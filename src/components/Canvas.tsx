import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auth } from '../lib/firebaseClient';
import {
  TransactionFormModal,
  AssetLiabilityFormModal,
  PeriodConfigFormModal,
  AccountFormModal,
} from './FinanceForms';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Scale,
  Rocket,
  Shield,
  Calendar,
  Plus,
  LogOut,
  Building,
} from 'lucide-react';
import styles from './Canvas.module.css';

interface CanvasPreviewProps {
  onLogout: () => void;
  userId?: string;
}

interface AccountRecord {
  id: string;
  name: string;
  type: string;
  currency: string;
  initial_balance: string;
  current_balance: string;
  is_active: boolean;
}

interface MonthlyCanvasRecord {
  month: string;
  fixed_income: string;
  variable_income: string;
  total_income: string;
  total_expenses: string;
  total_savings: string;
  total_investments: string;
  total_debt_payments: string;
}

interface NetWorthRecord {
  liquid_assets: string;
  fixed_assets: string;
  total_assets: string;
  total_liabilities: string;
  net_worth: string;
}

interface PortfolioRecord {
  account_id: string;
  account_name: string;
  ticker: string;
  security_name: string;
  shares: string;
  average_buy_price: string;
  current_price: string;
  total_cost_basis: string;
  current_market_value: string;
  unrealized_pnl: string;
  pnl_percentage: string;
  currency: string;
}

interface TaxonomyRecord {
  category_name: string;
  category_type: string;
  subcategories_count: number;
  amount: string;
}

interface CanvasDashboardResponse {
  settings: {
    main_currency: string;
    exchange_rate_cop_usd: string;
    ai_provider: string;
  };
  accounts: AccountRecord[];
  netWorth: NetWorthRecord;
  monthlyCanvas: MonthlyCanvasRecord[];
  portfolio: PortfolioRecord[];
  taxonomy: TaxonomyRecord[];
}

const CATEGORY_COLORS = [
  '#10b981',
  '#06b6d4',
  '#a855f7',
  '#f59e0b',
  '#f43f5e',
  '#3b82f6',
  '#14b8a6',
  '#ec4899',
  '#84cc16',
];

const MONTH_NAMES: Record<string, string> = {
  '01': 'Enero',
  '02': 'Febrero',
  '03': 'Marzo',
  '04': 'Abril',
  '05': 'Mayo',
  '06': 'Junio',
  '07': 'Julio',
  '08': 'Agosto',
  '09': 'Septiembre',
  '10': 'Octubre',
  '11': 'Noviembre',
  '12': 'Diciembre',
};

function formatNumberCOP(value: number): string {
  const hasDecimals = Math.abs(value % 1) > 0.001;
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCurrencyCOP(value: number): string {
  return `$ ${formatNumberCOP(value)}`;
}

export function formatCurrencyUSD(value: number): string {
  return `US$${new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function formatCompactMillionsCOP(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  return formatCurrencyCOP(value);
}

function formatMonthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-');
  const monthName = MONTH_NAMES[month] || yyyyMm;
  return `${monthName} ${year}`;
}

export const CanvasPreview: React.FC<CanvasPreviewProps> = ({ onLogout, userId }) => {
  const [activeTab, setActiveTab] = useState<'resumen' | 'taxonomia' | 'mensual'>('resumen');

  // Modals state
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);

  const effectiveUserId = userId || auth.currentUser?.uid || '';

  const { data, isLoading, error } = useQuery<CanvasDashboardResponse>({
    queryKey: ['canvas-dashboard', effectiveUserId],
    queryFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (effectiveUserId) {
        headers['x-user-id'] = effectiveUserId;
      }

      const res = await fetch('/api/canvas-dashboard', { headers });
      if (!res.ok) {
        throw new Error('No se pudieron cargar los datos financieros desde Neon PostgreSQL.');
      }
      return res.json();
    },
  });

  const trm = Number(data?.settings?.exchange_rate_cop_usd || 3303.16);
  const mainCurrency = data?.settings?.main_currency || 'COP';
  const accounts = data?.accounts || [];
  const monthlyRows = data?.monthlyCanvas || [];
  const portfolio = data?.portfolio || [];
  const taxonomyRows = data?.taxonomy || [];

  // 1. Cuentas de liquidez inmediata en COP vs Cuentas en USD / Ahorro / Inversión
  const copLiquidAccounts = accounts.filter(
    (acc) =>
      acc.currency === 'COP' &&
      !['ahorro', 'inversión', 'inversion', 'broker'].includes(acc.type.toLowerCase())
  );
  const copSavingsAccounts = accounts.filter(
    (acc) => acc.currency === 'COP' && acc.type.toLowerCase() === 'ahorro'
  );
  const copInvestmentAccounts = accounts.filter(
    (acc) =>
      acc.currency === 'COP' &&
      ['inversión', 'inversion', 'broker'].includes(acc.type.toLowerCase())
  );
  const usdAccounts = accounts.filter((acc) => acc.currency === 'USD');

  const totalImmediateLiquidityCop = copLiquidAccounts.reduce(
    (sum, acc) => sum + Number(acc.current_balance || 0),
    0
  );

  // 2. Consolidado de Flujo Mensual / Anual (v_monthly_canvas)
  const totalIncomeYear = monthlyRows.reduce(
    (sum, row) => sum + Number(row.total_income || 0),
    0
  );
  const totalExpensesYear = monthlyRows.reduce(
    (sum, row) => sum + Number(row.total_expenses || 0),
    0
  );
  const totalSavingsTransferred = monthlyRows.reduce(
    (sum, row) => sum + Number(row.total_savings || 0),
    0
  );
  const totalInvestmentsTransferred = monthlyRows.reduce(
    (sum, row) => sum + Number(row.total_investments || 0),
    0
  );
  const netBalanceYear = totalIncomeYear - totalExpensesYear;
  const savingsRateYear =
    totalIncomeYear > 0 ? Number(((netBalanceYear / totalIncomeYear) * 100).toFixed(1)) : 0;

  // 3. Estructura Multidivisa (COP / USD)
  const totalSavingsCop =
    copSavingsAccounts.reduce((sum, acc) => sum + Number(acc.current_balance || 0), 0) +
    totalSavingsTransferred;
  const totalInvestmentCop =
    copInvestmentAccounts.reduce((sum, acc) => sum + Number(acc.current_balance || 0), 0) +
    totalInvestmentsTransferred;

  const totalUsdAccountsBalance = usdAccounts.reduce(
    (sum, acc) => sum + Number(acc.current_balance || 0),
    0
  );
  const totalPortfolioUsd = portfolio.reduce(
    (sum, item) => sum + Number(item.current_market_value || 0),
    0
  );
  const totalSavingsUsd = usdAccounts
    .filter((acc) => acc.type.toLowerCase() === 'ahorro')
    .reduce((sum, acc) => sum + Number(acc.current_balance || 0), 0);

  const totalConsolidatedSavingsCop =
    totalImmediateLiquidityCop +
    totalSavingsCop +
    totalInvestmentCop +
    (totalUsdAccountsBalance + totalPortfolioUsd) * trm;

  // 4. Patrimonio Neto (v_net_worth)
  const liquidAssets = Number(data?.netWorth?.liquid_assets || 0);
  const fixedAssets = Number(data?.netWorth?.fixed_assets || 0);
  const totalAssets = Number(data?.netWorth?.total_assets || 0);
  const totalLiabilities = Number(data?.netWorth?.total_liabilities || 0);
  const netWorth = Number(data?.netWorth?.net_worth || 0);

  const liquidAssetsPct = totalAssets > 0 ? ((liquidAssets / totalAssets) * 100).toFixed(1) : '0.0';
  const fixedAssetsPct = totalAssets > 0 ? ((fixedAssets / totalAssets) * 100).toFixed(1) : '0.0';
  const leveragePct =
    totalAssets > 0 ? Number(((totalLiabilities / totalAssets) * 100).toFixed(1)) : 0;
  const solvencyPct = totalAssets > 0 ? Number(((netWorth / totalAssets) * 100).toFixed(1)) : 0;

  // 5. Taxonomía de Categorías desde DB
  const expenseTaxonomy = taxonomyRows.filter((row) => row.category_type === 'GASTO');
  const displayedTaxonomy = expenseTaxonomy.length > 0 ? expenseTaxonomy : taxonomyRows;
  const totalTaxonomyAmount = displayedTaxonomy.reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0
  );
  const totalSubcategoriesCount = taxonomyRows.reduce(
    (sum, row) => sum + Number(row.subcategories_count || 0),
    0
  );

  const spendingCategories = displayedTaxonomy.map((row, index) => {
    const amount = Number(row.amount || 0);
    const percentage =
      totalTaxonomyAmount > 0 ? Number(((amount / totalTaxonomyAmount) * 100).toFixed(1)) : 0;
    return {
      id: `${row.category_type}-${row.category_name}`,
      name: row.category_name,
      type: row.category_type,
      subcategoriesCount: row.subcategories_count,
      amount,
      percentage,
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    };
  });

  // 6. Flujo Mensual con Balance Acumulado (v_monthly_canvas)
  let runningAccumulated = 0;
  const monthlyCashFlow = monthlyRows.map((row) => {
    const ingresos = Number(row.total_income || 0);
    const gastos = Number(row.total_expenses || 0);
    const balanceMes = ingresos - gastos;
    runningAccumulated += balanceMes;
    const tasaAhorro = ingresos > 0 ? Number(((balanceMes / ingresos) * 100).toFixed(1)) : 0;
    const ahorroMes = Number(row.total_savings || 0) + Number(row.total_investments || 0);

    return {
      month: formatMonthLabel(row.month),
      ingresos,
      gastos,
      balanceMes,
      tasaAhorro,
      balanceAcumulado: runningAccumulated,
      ahorroMes,
    };
  });

  const portfolioTickersLabel =
    portfolio.length > 0 ? portfolio.map((p) => p.ticker).join(', ') : 'Sin posiciones';
  const usdAccountNamesLabel =
    usdAccounts.length > 0 ? usdAccounts.map((a) => a.name).join(', ') : 'Sin cuentas USD';

  return (
    <div className={styles.page}>
      {/* Modales Interactivos */}
      <TransactionFormModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        accounts={accounts}
        trm={trm}
      />
      <AccountFormModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
      />
      <AssetLiabilityFormModal
        isOpen={isAssetModalOpen}
        onClose={() => setIsAssetModalOpen(false)}
      />
      <PeriodConfigFormModal
        isOpen={isPeriodModalOpen}
        onClose={() => setIsPeriodModalOpen(false)}
        initialTrm={trm}
      />

      {/* Top Bar Navigation */}
      <header className={styles.header}>
        {/* Brand Zone */}
        <div className={styles.brandZone}>
          <div className={styles.brandIconBox}>
            <Wallet className={styles.brandIcon} />
          </div>
          <div>
            <div className={styles.brandTitleRow}>
              <h1 className={styles.brandTitle}>Financial Management & Cash Flow</h1>
              <span className={styles.liveBadge}>
                <span className={styles.liveDot} />
                Neon DB En Vivo
              </span>
            </div>
            <p className={styles.brandSubtitle}>
              Motor de Consolidación Financiera · {mainCurrency} ($)
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className={styles.actionControls}>
          <button onClick={() => setIsTxModalOpen(true)} className={styles.primaryBtn}>
            <Plus className={styles.btnIcon} />
            <span>+ Nueva Transacción</span>
          </button>

          <button onClick={() => setIsAccountModalOpen(true)} className={styles.secondaryCyanBtn}>
            <Wallet className={styles.btnIcon} />
            <span>+ Nueva Cuenta</span>
          </button>

          <button onClick={() => setIsAssetModalOpen(true)} className={styles.secondaryCyanBtn}>
            <Building className={styles.btnIcon} />
            <span>+ Activo / Deuda</span>
          </button>

          <button onClick={() => setIsPeriodModalOpen(true)} className={styles.periodBtn}>
            <Calendar className={styles.mutedIcon} />
            <span>
              Período: <strong className={styles.periodStrong}>Todo el Año (2026)</strong>
            </span>
          </button>

          <button
            onClick={onLogout}
            title="Volver a pantalla de inicio de sesión"
            className={styles.logoutBtn}
          >
            <LogOut className={styles.btnIcon} />
            <span className={styles.logoutLabel}>Cerrar Sesión</span>
          </button>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className={styles.main}>
        {/* Navigation Tabs */}
        <div className={styles.tabsBar}>
          <button
            onClick={() => setActiveTab('resumen')}
            className={`${styles.tabBtn} ${
              activeTab === 'resumen' ? styles.tabBtnActiveEmerald : ''
            }`}
          >
            Resumen General & Liquidez
          </button>
          <button
            onClick={() => setActiveTab('taxonomia')}
            className={`${styles.tabBtn} ${
              activeTab === 'taxonomia' ? styles.tabBtnActiveCyan : ''
            }`}
          >
            Taxonomía & Análisis Visual
          </button>
          <button
            onClick={() => setActiveTab('mensual')}
            className={`${styles.tabBtn} ${
              activeTab === 'mensual' ? styles.tabBtnActivePurple : ''
            }`}
          >
            Registro Flujo Mensual
          </button>
        </div>

        {isLoading && (
          <div className={styles.stateCard}>
            Sincronizando datos financieros desde Neon PostgreSQL...
          </div>
        )}

        {error && (
          <div className={styles.errorCard}>
            <span>
              {error instanceof Error
                ? error.message
                : 'Error al consultar la base de datos.'}
            </span>
          </div>
        )}

        {!isLoading && !error && activeTab === 'resumen' && (
          <div className={styles.tabContent}>
            {/* 1. DINERO DISPONIBLE • LIQUIDEZ INMEDIATA */}
            <div className={styles.liquidityHero}>
              <div className={styles.heroGlow} />

              <div className={styles.heroGrid}>
                <div className={styles.heroLeft}>
                  <div className={styles.heroTag}>
                    <span className={styles.heroTagDot} />
                    <span>Dinero Disponible · Liquidez Inmediata</span>
                  </div>

                  <div>
                    <h2 className={styles.heroTitle}>Cuentas Operativas & Efectivo en Mano</h2>
                    <p className={styles.heroSubtitle}>
                      {copLiquidAccounts.length > 0
                        ? copLiquidAccounts.map((acc) => `${acc.name} (${acc.type})`).join(' · ')
                        : 'Sin cuentas operativas COP registradas'}
                    </p>
                  </div>

                  <div className={styles.heroBalanceBlock}>
                    <span className={styles.heroBalanceLabel}>Saldo Disponible al Instante</span>
                    <div className={styles.heroBalanceValue}>
                      <span className={styles.heroCurrencySymbol}>$</span>
                      <span>{formatNumberCOP(totalImmediateLiquidityCop)}</span>
                    </div>
                  </div>

                  <div className={styles.heroAccessibleBadge}>
                    <span>✓ 100% Accesible para Flujo de Caja Operativo</span>
                  </div>
                </div>

                {/* Sub-account badges from Neon DB */}
                <div className={styles.subAccountsGrid}>
                  {copLiquidAccounts.map((acc, idx) => (
                    <div key={acc.id} className={styles.subAccountCard}>
                      <div className={styles.subAccountLabel}>{acc.name}</div>
                      <div className={styles.subAccountTitle}>{acc.type}</div>
                      <div
                        className={
                          idx % 2 === 0
                            ? styles.subAccountAmountEmerald
                            : styles.subAccountAmountCyan
                        }
                      >
                        {formatCurrencyCOP(Number(acc.current_balance))}
                      </div>
                    </div>
                  ))}

                  <div className={styles.subAccountCard}>
                    <div className={styles.subAccountLabel}>Cuentas USD / Broker</div>
                    <div className={styles.subAccountTitle}>{usdAccountNamesLabel}</div>
                    <div className={styles.subAccountAmountAmber}>
                      {formatCurrencyUSD(totalUsdAccountsBalance)}
                    </div>
                  </div>

                  <div className={styles.subAccountCard}>
                    <div className={styles.subAccountLabel}>Disponibilidad</div>
                    <div className={styles.subAccountTitleEmerald}>Inmediata (T+0)</div>
                    <div className={styles.subAccountNote}>Sin restricciones</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. RESUMEN EJECUTIVO • CONSOLIDADO ANUAL 2026 */}
            <div className={styles.sectionBlock}>
              <div className={styles.sectionHeading}>
                <span>Resumen Ejecutivo · Consolidado Anual 2026</span>
              </div>

              <div className={styles.kpiGrid5}>
                {/* Ingresos Totales */}
                <div className={styles.kpiCard}>
                  <div className={styles.kpiHeader}>
                    <span>Ingresos Totales</span>
                    <span className={styles.iconBadgeEmerald}>
                      <ArrowUpRight className={styles.btnIcon} />
                    </span>
                  </div>
                  <div className={styles.kpiValueWhite}>{formatCurrencyCOP(totalIncomeYear)}</div>
                  <div className={styles.kpiMetaEmerald}>
                    ● Acumulado ({monthlyRows.length}{' '}
                    {monthlyRows.length === 1 ? 'mes' : 'meses'})
                  </div>
                </div>

                {/* Gastos Totales */}
                <div className={styles.kpiCard}>
                  <div className={styles.kpiHeader}>
                    <span>Gastos Totales</span>
                    <span className={styles.iconBadgeRose}>
                      <ArrowDownRight className={styles.btnIcon} />
                    </span>
                  </div>
                  <div className={styles.kpiValueWhite}>
                    {formatCurrencyCOP(totalExpensesYear)}
                  </div>
                  <div className={styles.kpiMetaMuted}>Salidas operativas registradas</div>
                </div>

                {/* Balance Neto */}
                <div className={styles.kpiCard}>
                  <div className={styles.kpiHeader}>
                    <span>Balance Neto</span>
                    <span className={styles.iconBadgeTeal}>
                      <Scale className={styles.btnIcon} />
                    </span>
                  </div>
                  <div className={styles.kpiValueEmerald}>{formatCurrencyCOP(netBalanceYear)}</div>
                  <div className={styles.kpiMetaMuted}>
                    {netBalanceYear >= 0 ? 'Superávit en período' : 'Déficit en período'}
                  </div>
                </div>

                {/* Tasa de Ahorro */}
                <div className={styles.kpiCard}>
                  <div className={styles.kpiHeader}>
                    <span>Tasa de Ahorro</span>
                    <span className={styles.iconBadgePurple}>
                      <Rocket className={styles.btnIcon} />
                    </span>
                  </div>
                  <div className={styles.kpiValuePurple}>{savingsRateYear}%</div>
                  <div className={styles.progressTrack}>
                    <div
                      className={styles.progressFillPurple}
                      style={{ width: `${Math.max(0, Math.min(100, savingsRateYear))}%` }}
                    />
                  </div>
                  <div className={styles.kpiMetaSmall}>Meta: 20%</div>
                </div>

                {/* Patrimonio Neto */}
                <div className={styles.kpiCard}>
                  <div className={styles.kpiHeader}>
                    <span>Patrimonio Neto</span>
                    <span className={styles.iconBadgeCyan}>
                      <Shield className={styles.btnIcon} />
                    </span>
                  </div>
                  <div className={styles.kpiValueCyan}>{formatCurrencyCOP(netWorth)}</div>
                  <div className={styles.kpiMetaSplit}>
                    <span className={styles.monoEmerald}>
                      Act: {formatCompactMillionsCOP(totalAssets)}
                    </span>
                    <span className={styles.monoRose}>
                      Deuda: {formatCompactMillionsCOP(totalLiabilities)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. ESTRUCTURA DE AHORRO E INVERSIÓN MULTIDIVISA */}
            <div className={styles.sectionBlock}>
              <div className={styles.sectionTitleRow}>
                <div className={styles.sectionHeading}>
                  <span>Estructura de Ahorro e Inversión Multidivisa (COP / USD)</span>
                </div>
                <span className={styles.trmBadge}>TRM: {formatCurrencyCOP(trm)} COP</span>
              </div>

              <div className={styles.savingsGrid4}>
                <div className={styles.savingsCardCop}>
                  <span className={styles.cardLabel}>Ahorro Total COP</span>
                  <div className={styles.cardValueEmerald}>
                    {formatCurrencyCOP(totalSavingsCop)}
                  </div>
                  <div className={styles.cardHintMuted}>Cuentas y movimientos tipo Ahorro</div>
                </div>

                <div className={styles.savingsCardCop}>
                  <span className={styles.cardLabel}>Inversión Total COP</span>
                  <div className={styles.cardValueCyan}>
                    {formatCurrencyCOP(totalInvestmentCop)}
                  </div>
                  <div className={styles.cardHintMuted}>Inversiones en moneda local</div>
                </div>

                <div className={styles.savingsCardCop}>
                  <span className={styles.cardLabel}>Ahorro (Período)</span>
                  <div className={styles.cardValueEmerald}>
                    {formatCurrencyCOP(totalSavingsTransferred)}
                  </div>
                  <div className={styles.cardHintMuted}>Ahorro transferido en transacciones</div>
                </div>

                <div className={styles.savingsCardCop}>
                  <span className={styles.cardLabel}>Liquidez + Inversión Consolidada</span>
                  <div className={styles.cardValueCyanLight}>
                    {formatCurrencyCOP(totalConsolidatedSavingsCop)}
                  </div>
                  <div className={styles.cardHintMuted}>Consolidado COP + USD a TRM</div>
                </div>
              </div>

              {/* USD Row */}
              <div className={styles.usdGrid3}>
                <div className={styles.savingsCardUsd}>
                  <span className={styles.cardLabel}>Ahorro Total USD</span>
                  <div className={styles.cardValueEmerald}>
                    {formatCurrencyUSD(totalSavingsUsd)}
                  </div>
                  <div className={styles.cardHintSlate}>
                    ≈ {formatCurrencyCOP(totalSavingsUsd * trm)} COP
                  </div>
                </div>

                <div className={styles.savingsCardUsd}>
                  <span className={styles.cardLabel}>Inversión Total USD (Portafolio)</span>
                  <div className={styles.cardValuePurple}>
                    {formatCurrencyUSD(totalPortfolioUsd)}
                  </div>
                  <div className={styles.cardHintSlate}>
                    ≈ {formatCurrencyCOP(totalPortfolioUsd * trm)} COP ({portfolioTickersLabel})
                  </div>
                </div>

                <div className={styles.savingsCardUsd}>
                  <span className={styles.cardLabel}>Cuentas en USD</span>
                  <div className={styles.cardValueAmber}>
                    {formatCurrencyUSD(totalUsdAccountsBalance)}
                  </div>
                  <div className={styles.cardHintSlate}>
                    ≈ {formatCurrencyCOP(totalUsdAccountsBalance * trm)} COP ({usdAccountNamesLabel}
                    )
                  </div>
                </div>
              </div>
            </div>

            {/* 4. RESUMEN PATRIMONIAL */}
            <div className={styles.sectionBlock}>
              <div className={styles.sectionHeading}>
                Resumen Patrimonial · Balance General Consolidado
              </div>

              <div className={styles.patrimonyGrid3}>
                <div className={styles.patrimonyCard}>
                  <span className={styles.cardLabel}>Total Activos</span>
                  <div className={styles.patrimonyValueEmerald}>
                    {formatCurrencyCOP(totalAssets)}
                  </div>
                  <div className={styles.patrimonyDetails}>
                    <div className={styles.patrimonyRow}>
                      <span>Líquidos:</span>
                      <span className={styles.monoEmerald}>
                        {formatCompactMillionsCOP(liquidAssets)} COP ({liquidAssetsPct}%)
                      </span>
                    </div>
                    <div className={styles.patrimonyRow}>
                      <span>Fijos / Inversiones:</span>
                      <span className={styles.monoCyan}>
                        {formatCompactMillionsCOP(fixedAssets)} COP ({fixedAssetsPct}%)
                      </span>
                    </div>
                  </div>
                </div>

                <div className={styles.patrimonyCard}>
                  <span className={styles.cardLabel}>Total Pasivos / Deudas</span>
                  <div className={styles.patrimonyValueRose}>
                    {formatCurrencyCOP(totalLiabilities)}
                  </div>
                  <div className={styles.patrimonyDetails}>
                    <div className={styles.patrimonyRow}>
                      <span>Apalancamiento s/ Activo:</span>
                      <span className={styles.monoRose}>{leveragePct}%</span>
                    </div>
                    <div className={styles.progressTrack}>
                      <div
                        className={styles.progressFillRose}
                        style={{ width: `${Math.max(0, Math.min(100, leveragePct))}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className={styles.patrimonyCard}>
                  <span className={styles.cardLabel}>Patrimonio Neto</span>
                  <div className={styles.patrimonyValueCyan}>{formatCurrencyCOP(netWorth)}</div>
                  <div className={styles.patrimonyDetails}>
                    <div className={styles.patrimonyRow}>
                      <span>Solvencia Patrimonial:</span>
                      <span className={styles.monoCyan}>{solvencyPct}% del activo</span>
                    </div>
                    <div className={styles.progressTrack}>
                      <div
                        className={styles.progressFillCyan}
                        style={{ width: `${Math.max(0, Math.min(100, solvencyPct))}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAXONOMÍA TAB */}
        {!isLoading && !error && activeTab === 'taxonomia' && (
          <div className={styles.tabContent}>
            <div className={styles.taxonomyBanner}>
              <div>
                <h3 className={styles.taxonomyTitle}>
                  Taxonomía Completa & Análisis ({totalSubcategoriesCount} Subcategorías)
                </h3>
                <p className={styles.taxonomySubtitle}>
                  Explora el comportamiento mensual por Categoría General sincronizado con Neon DB.
                </p>
              </div>
              <div>
                <span className={styles.taxonomyBadge}>
                  {spendingCategories.length} Categorías Activas
                </span>
              </div>
            </div>

            <div className={styles.taxonomyGrid}>
              {spendingCategories.map((cat) => (
                <div key={cat.id} className={styles.categoryCard}>
                  <div className={styles.categoryLeft}>
                    <span
                      className={styles.categoryDot}
                      style={{ backgroundColor: cat.color }}
                    />
                    <div>
                      <div className={styles.categoryName}>{cat.name}</div>
                      <div className={styles.categorySubcount}>
                        {cat.subcategoriesCount} subcategoría(s)
                      </div>
                    </div>
                  </div>

                  <div className={styles.categoryRight}>
                    <div className={styles.categoryAmount}>{formatCurrencyCOP(cat.amount)}</div>
                    <div className={styles.categoryPercent} style={{ color: cat.color }}>
                      {cat.percentage}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* REGISTRO MENSUAL TAB */}
        {!isLoading && !error && activeTab === 'mensual' && (
          <div className={styles.tabContent}>
            <div className={styles.monthlyBanner}>
              <h3 className={styles.taxonomyTitle}>Registro Mensual de Flujo de Caja</h3>
              <p className={styles.taxonomySubtitle}>
                Detalle del período desde la vista calculada v_monthly_canvas en PostgreSQL
              </p>
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead className={styles.tableHead}>
                  <tr>
                    <th className={styles.th}>Mes</th>
                    <th className={styles.thRight}>Ingresos</th>
                    <th className={styles.thRight}>Gastos</th>
                    <th className={styles.thRight}>Balance Mes</th>
                    <th className={styles.thRight}>Tasa Ahorro</th>
                    <th className={styles.thRight}>Balance Acumulado</th>
                    <th className={styles.thRight}>Ahorro (Mes)</th>
                  </tr>
                </thead>
                <tbody className={styles.tableBody}>
                  {monthlyCashFlow.map((row) => (
                    <tr key={row.month} className={styles.tr}>
                      <td className={styles.tdMonth}>{row.month}</td>
                      <td className={styles.tdIncome}>{formatCurrencyCOP(row.ingresos)}</td>
                      <td className={styles.tdExpense}>{formatCurrencyCOP(row.gastos)}</td>
                      <td className={styles.tdBalance}>{formatCurrencyCOP(row.balanceMes)}</td>
                      <td className={styles.tdRate}>
                        {row.tasaAhorro > 0 ? `${row.tasaAhorro}%` : '0.0%'}
                      </td>
                      <td className={styles.tdAccumulated}>
                        {formatCurrencyCOP(row.balanceAcumulado)}
                      </td>
                      <td className={styles.tdSavings}>{formatCurrencyCOP(row.ahorroMes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
