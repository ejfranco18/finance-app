import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { auth } from '../lib/firebaseClient';
import {
  TransactionFormModal,
  AssetLiabilityFormModal,
  PeriodConfigFormModal,
  AccountFormModal,
  InitialTransactionDraft,
} from './FinanceForms';
import { AIAssistantModal } from './AIAssistantModal';
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
  Trash2,
  Pencil,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  X,
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
  reconciled_balance?: string | null;
  reconciled_at?: string | null;
  annual_interest_rate?: string | number;
  accumulated_interest?: string | number;
  last_interest_date?: string | null;
  is_active: boolean;
}

function getAccountReconciliation(acc: AccountRecord) {
  const calculated = Number(acc.current_balance || 0);
  const hasReconciled =
    acc.reconciled_balance !== null &&
    acc.reconciled_balance !== undefined &&
    acc.reconciled_balance !== '';
  const bankBalance = hasReconciled ? Number(acc.reconciled_balance) : null;
  const diff =
    bankBalance !== null && Number.isFinite(bankBalance)
      ? Number((bankBalance - calculated).toFixed(2))
      : null;
  const isDiscrepant = diff !== null && Math.abs(diff) >= 0.01;
  const isMatched = diff !== null && Math.abs(diff) < 0.01;

  const annualRate = Number(acc.annual_interest_rate || 0);
  const accumulatedInterest = Number(acc.accumulated_interest || 0);
  const dailyRateFactor =
    annualRate > 0 ? Math.pow(1 + annualRate / 100, 1 / 365) - 1 : 0;
  const estimatedDailyGain =
    annualRate > 0 && calculated > 0
      ? Number((calculated * dailyRateFactor).toFixed(2))
      : 0;

  return {
    calculated,
    hasReconciled,
    bankBalance,
    diff,
    isDiscrepant,
    isMatched,
    annualRate,
    accumulatedInterest,
    dailyRateFactor,
    estimatedDailyGain,
  };
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

interface TaxonomySubcategoryRecord {
  name: string;
  amount: string | number;
  transactions_count: number;
}

interface TaxonomyRecord {
  category_name: string;
  category_type: string;
  subcategories_count: number;
  amount: string;
  subcategories?: TaxonomySubcategoryRecord[];
}

interface TransactionRecord {
  id: string;
  date: string;
  month: string;
  description: string;
  amount: string;
  currency: string;
  category_type: string;
  category_name: string;
  sub_category_name: string;
  account_id: string;
  account_name: string;
  destination_account_id: string | null;
  destination_account_name: string | null;
  is_recurring?: boolean;
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
  transactions: TransactionRecord[];
}

const CATEGORY_COLORS = [
  '#10b981',
  '#06b9d4',
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
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
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

function formatCategoryTypeLabel(type: string): string {
  switch (type) {
    case 'INGRESO_FIJO':
      return 'Ingreso Fijo';
    case 'INGRESO_VARIABLE':
      return 'Ingreso Variable';
    case 'GASTO':
      return 'Gasto';
    case 'AHORRO':
      return 'Ahorro';
    case 'INVERSION':
      return 'Inversión';
    case 'TRANSFERENCIA':
      return 'Transferencia';
    default:
      return type;
  }
}

export const CanvasPreview: React.FC<CanvasPreviewProps> = ({ onLogout, userId }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'resumen' | 'taxonomia' | 'mensual'>('resumen');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('ALL');
  const [savingsGoalPct, setSavingsGoalPct] = useState<number>(20);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSubcategoryName, setSelectedSubcategoryName] = useState<string | null>(null);
  const [selectedFlowMonth, setSelectedFlowMonth] = useState<string | null>(null);
  const [confirmDeleteTxId, setConfirmDeleteTxId] = useState<string | null>(null);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<TransactionRecord | null>(null);
  const [txInitialDraft, setTxInitialDraft] = useState<InitialTransactionDraft | null>(null);

  // Conciliación de Cuentas (Saldo Calculado vs. Saldo Real en Banco + Tasa de Interés E.A.)
  const [reconcilingAccountId, setReconcilingAccountId] = useState<string | null>(null);
  const [reconcileInputValue, setReconcileInputValue] = useState<string>('');
  const [reconcileRateInputValue, setReconcileRateInputValue] = useState<string>('');
  const [reconcileSearchQuery, setReconcileSearchQuery] = useState<string>('');
  const [isSavingReconcile, setIsSavingReconcile] = useState<boolean>(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [reconcileSavedMsg, setReconcileSavedMsg] = useState<string | null>(null);

  // Modals state
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);

  const effectiveUserId = userId || auth.currentUser?.uid || '';

  const handleSaveReconciliation = async (
    accountId: string,
    bankBalanceValue: number | null | undefined,
    annualInterestRateValue?: number
  ) => {
    try {
      setIsSavingReconcile(true);
      setReconcileError(null);
      setReconcileSavedMsg(null);
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (effectiveUserId) {
        headers['x-user-id'] = effectiveUserId;
      }

      const payload: Record<string, unknown> = {};
      if (bankBalanceValue !== undefined) {
        payload.reconciledBalance = bankBalanceValue;
        payload.clear = bankBalanceValue === null;
      }
      if (annualInterestRateValue !== undefined) {
        payload.annualInterestRate = annualInterestRateValue;
      }

      const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/reconcile`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'No se pudo actualizar la cuenta.');
      }

      if (bankBalanceValue === null) {
        setReconcileInputValue('');
        setReconcileSavedMsg('Validación manual limpiada.');
      } else if (bankBalanceValue !== undefined) {
        setReconcileInputValue(String(bankBalanceValue));
        setReconcileSavedMsg('Saldo de banco guardado.');
      } else if (annualInterestRateValue !== undefined) {
        setReconcileRateInputValue(String(annualInterestRateValue));
        setReconcileSavedMsg('Tasa de interés anual (E.A.) actualizada.');
      }

      await queryClient.invalidateQueries({ queryKey: ['canvas-dashboard'] });
    } catch (err) {
      setReconcileError(
        err instanceof Error ? err.message : 'Error inesperado al actualizar la cuenta.'
      );
    } finally {
      setIsSavingReconcile(false);
    }
  };

  const handleDeleteTransaction = async (txId: string) => {
    try {
      setDeletingTxId(txId);
      setDeleteError(null);
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (effectiveUserId) {
        headers['x-user-id'] = effectiveUserId;
      }

      const res = await fetch(`/api/transactions/${encodeURIComponent(txId)}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo eliminar la transacción.');
      }

      setConfirmDeleteTxId(null);
      await queryClient.invalidateQueries({ queryKey: ['canvas-dashboard'] });
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Error inesperado al eliminar la transacción.'
      );
    } finally {
      setDeletingTxId(null);
    }
  };

  const { data, isLoading, error } = useQuery<CanvasDashboardResponse>({
    queryKey: ['canvas-dashboard', effectiveUserId, selectedPeriod],
    queryFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (effectiveUserId) {
        headers['x-user-id'] = effectiveUserId;
      }

      const querySuffix =
        selectedPeriod && selectedPeriod !== 'ALL'
          ? `?month=${encodeURIComponent(selectedPeriod)}`
          : '';
      const res = await fetch(`/api/canvas-dashboard${querySuffix}`, { headers });
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
  const allTransactions = data?.transactions || [];

  const periodLabel =
    selectedPeriod === 'ALL' ? 'Todo el Año (2026)' : formatMonthLabel(selectedPeriod);

  const filteredMonthlyRows =
    selectedPeriod === 'ALL'
      ? monthlyRows
      : monthlyRows.filter((row) => row.month === selectedPeriod);

  // 1. Cuentas de liquidez inmediata en COP vs Tarjetas de Crédito vs USD / Ahorro / Inversión
  const isCreditCardType = (type: string) =>
    ['tarjeta de crédito', 'tarjeta de credito'].includes(type.toLowerCase());

  const creditCardAccounts = accounts.filter((acc) => isCreditCardType(acc.type));
  const copLiquidAccounts = accounts.filter(
    (acc) =>
      acc.currency === 'COP' &&
      !['ahorro', 'inversión', 'inversion', 'broker'].includes(acc.type.toLowerCase()) &&
      !isCreditCardType(acc.type)
  );
  const copSavingsAccounts = accounts.filter(
    (acc) => acc.currency === 'COP' && acc.type.toLowerCase() === 'ahorro'
  );
  const copInvestmentAccounts = accounts.filter(
    (acc) =>
      acc.currency === 'COP' &&
      ['inversión', 'inversion', 'broker'].includes(acc.type.toLowerCase())
  );
  const usdAccounts = accounts.filter(
    (acc) => acc.currency === 'USD' && !isCreditCardType(acc.type)
  );

  const totalImmediateLiquidityCop = copLiquidAccounts.reduce(
    (sum, acc) => sum + Number(acc.current_balance || 0),
    0
  );

  // 2. Consolidado de Flujo Mensual / Anual (v_monthly_canvas filtrado por selectedPeriod)
  const totalIncomeYear = filteredMonthlyRows.reduce(
    (sum, row) => sum + Number(row.total_income || 0),
    0
  );
  const totalExpensesYear = filteredMonthlyRows.reduce(
    (sum, row) => sum + Number(row.total_expenses || 0),
    0
  );
  const totalSavingsTransferred = filteredMonthlyRows.reduce(
    (sum, row) => sum + Number(row.total_savings || 0),
    0
  );
  const totalInvestmentsTransferred = filteredMonthlyRows.reduce(
    (sum, row) => sum + Number(row.total_investments || 0),
    0
  );
  const netBalanceYear = totalIncomeYear - totalExpensesYear;
  const savingsRateYear =
    totalIncomeYear > 0 ? Number(((netBalanceYear / totalIncomeYear) * 100).toFixed(1)) : 0;

  // 3. Estructura Multidivisa (COP / USD)
  const totalSavingsCop = copSavingsAccounts.reduce(
    (sum, acc) => sum + Number(acc.current_balance || 0),
    0
  );
  const totalInvestmentCop = copInvestmentAccounts.reduce(
    (sum, acc) => sum + Number(acc.current_balance || 0),
    0
  );

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
    const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
    const subcategories = (row.subcategories || []).map((sub) => {
      const subAmount = Number(sub.amount || 0);
      const subPercentage =
        amount > 0 ? Number(((subAmount / amount) * 100).toFixed(1)) : 0;
      return {
        name: sub.name,
        amount: subAmount,
        transactionsCount: Number(sub.transactions_count || 0),
        percentage: subPercentage,
      };
    });

    return {
      id: `${row.category_type}-${row.category_name}`,
      name: row.category_name,
      type: row.category_type,
      subcategoriesCount: row.subcategories_count,
      amount,
      percentage,
      color,
      subcategories,
    };
  });

  const selectedCategory =
    spendingCategories.find((cat) => cat.id === selectedCategoryId) || null;
  const selectedSubcategory =
    selectedCategory?.subcategories.find((sub) => sub.name === selectedSubcategoryName) || null;

  const subcategoryTransactions =
    selectedCategory && selectedSubcategory
      ? allTransactions.filter(
          (tx) =>
            tx.category_name === selectedCategory.name &&
            tx.category_type === selectedCategory.type &&
            tx.sub_category_name === selectedSubcategory.name &&
            (selectedPeriod === 'ALL' || tx.month === selectedPeriod)
        )
      : [];

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
      rawMonth: row.month,
      month: formatMonthLabel(row.month),
      ingresos,
      gastos,
      balanceMes,
      tasaAhorro,
      balanceAcumulado: runningAccumulated,
      ahorroMes,
    };
  });

  const selectedMonthFlowSummary =
    monthlyCashFlow.find((m) => m.rawMonth === selectedFlowMonth) || null;
  const selectedMonthTransactions = selectedFlowMonth
    ? allTransactions.filter((tx) => tx.month === selectedFlowMonth)
    : [];

  const portfolioTickersLabel =
    portfolio.length > 0 ? portfolio.map((p) => p.ticker).join(', ') : 'Sin posiciones';
  const usdAccountNamesLabel =
    usdAccounts.length > 0 ? usdAccounts.map((a) => a.name).join(', ') : 'Sin cuentas USD';

  const discrepantAccounts = accounts.filter((acc) => getAccountReconciliation(acc).isDiscrepant);
  const discrepantUsdAccounts = usdAccounts.filter(
    (acc) => getAccountReconciliation(acc).isDiscrepant
  );

  const openAccountReconciliation = (accountId: string) => {
    const acc = accounts.find((a) => a.id === accountId) || accounts[0];
    if (!acc) return;
    setReconcilingAccountId(acc.id);
    const hasReconciled =
      acc.reconciled_balance !== null &&
      acc.reconciled_balance !== undefined &&
      acc.reconciled_balance !== '';
    setReconcileInputValue(hasReconciled ? String(Number(acc.reconciled_balance)) : '');
    setReconcileRateInputValue(String(Number(acc.annual_interest_rate || 0)));
    setReconcileError(null);
    setReconcileSavedMsg(null);
    setReconcileSearchQuery('');
    setConfirmDeleteTxId(null);
  };

  const reconcilingAccount = accounts.find((a) => a.id === reconcilingAccountId) || null;
  const reconcilingAccountTxAll = reconcilingAccount
    ? allTransactions.filter(
        (tx) =>
          tx.account_id === reconcilingAccount.id ||
          tx.destination_account_id === reconcilingAccount.id
      )
    : [];
  const normalizedSearch = reconcileSearchQuery.trim().toLowerCase();
  const reconcilingAccountTransactions = normalizedSearch
    ? reconcilingAccountTxAll.filter(
        (tx) =>
          tx.description.toLowerCase().includes(normalizedSearch) ||
          tx.category_name.toLowerCase().includes(normalizedSearch) ||
          tx.sub_category_name.toLowerCase().includes(normalizedSearch) ||
          tx.date.includes(normalizedSearch) ||
          String(tx.amount).includes(normalizedSearch)
      )
    : reconcilingAccountTxAll;

  return (
    <div className={styles.page}>
      {/* Modales Interactivos */}
      <TransactionFormModal
        isOpen={isTxModalOpen}
        onClose={() => {
          setIsTxModalOpen(false);
          setEditingTransaction(null);
          setTxInitialDraft(null);
        }}
        accounts={accounts}
        trm={trm}
        editingTransaction={editingTransaction}
        initialDraft={txInitialDraft}
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
        initialPeriod={selectedPeriod}
        initialSavingsGoal={savingsGoalPct}
        availableMonths={monthlyRows.map((row) => row.month)}
        onSubmitSuccess={(payload) => {
          setSelectedPeriod(payload.periodoMesAno || 'ALL');
          if (Number.isFinite(payload.tasaAhorroMetaPorcentaje)) {
            setSavingsGoalPct(payload.tasaAhorroMetaPorcentaje);
          }
        }}
      />
      <AIAssistantModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        onOpenTransactionDraft={(draft) => {
          setIsAiModalOpen(false);
          setEditingTransaction(null);
          setTxInitialDraft(draft);
          setIsTxModalOpen(true);
        }}
      />

      {/* Modal de Detalle y Conciliación Bancaria (Saldo Calculado vs. Saldo Real en Banco) */}
      {reconcilingAccount && (() => {
        const fmtAcc =
          reconcilingAccount.currency === 'USD' ? formatCurrencyUSD : formatCurrencyCOP;
        const calcBal = Number(reconcilingAccount.current_balance || 0);
        const initBal = Number(reconcilingAccount.initial_balance || 0);
        const savedInfo = getAccountReconciliation(reconcilingAccount);
        const netTxEffect = Number(
          (calcBal - initBal - savedInfo.accumulatedInterest).toFixed(2)
        );
        const parsedInput =
          reconcileInputValue.trim() !== '' ? Number(reconcileInputValue) : null;
        const effectiveBankVal =
          parsedInput !== null && Number.isFinite(parsedInput)
            ? parsedInput
            : savedInfo.bankBalance;
        const liveDiff =
          effectiveBankVal !== null && Number.isFinite(effectiveBankVal)
            ? Number((effectiveBankVal - calcBal).toFixed(2))
            : null;
        const liveIsDiscrepant = liveDiff !== null && Math.abs(liveDiff) >= 0.01;
        const liveIsMatched = liveDiff !== null && Math.abs(liveDiff) < 0.01;

        return (
          <div className={styles.reconcileOverlay}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reconcile-modal-title"
              className={styles.reconcileModalCard}
            >
              <div className={styles.reconcileModalHeader}>
                <div>
                  <h2 id="reconcile-modal-title" className={styles.taxonomyTitle}>
                    Conciliación y Detalle de Cuenta · {reconcilingAccount.name} (
                    {reconcilingAccount.type} · {reconcilingAccount.currency})
                  </h2>
                  <p className={styles.taxonomySubtitle}>
                    Compara el saldo calculado por tus movimientos e interés compuesto contra el
                    saldo real que ves hoy en tu banco o billetera.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReconcilingAccountId(null)}
                  className={styles.cancelDeleteBtn}
                  aria-label="Cerrar conciliación"
                >
                  <X className={styles.btnIcon} />
                </button>
              </div>

              {/* Selector rápido entre todas las cuentas activas */}
              <div className={styles.reconcileAccountTabs}>
                {accounts.map((acc) => {
                  const status = getAccountReconciliation(acc);
                  const isCurrent = acc.id === reconcilingAccount.id;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => openAccountReconciliation(acc.id)}
                      className={`${styles.reconcileAccountPill} ${
                        isCurrent ? styles.reconcileAccountPillActive : ''
                      } ${
                        !isCurrent && status.isDiscrepant
                          ? styles.reconcileAccountPillDiscrepant
                          : ''
                      }`}
                    >
                      <span>{acc.name}</span>
                      {status.annualRate > 0 && (
                        <span style={{ opacity: 0.75, fontSize: '10px' }}>
                          {status.annualRate}% E.A.
                        </span>
                      )}
                      {status.isDiscrepant && <span>⚠️</span>}
                      {status.isMatched && <span>✓</span>}
                    </button>
                  );
                })}
              </div>

              {reconcileError && (
                <div className={styles.errorCard}>
                  <span>{reconcileError}</span>
                </div>
              )}

              {/* Comparador Estilo Excel: 1. Calculado | 2. Real en Banco | 3. Diferencia */}
              <div className={styles.reconcileComparisonGrid}>
                {/* 1. Saldo Calculado en la App */}
                <div className={styles.reconcileBox}>
                  <div>
                    <span className={styles.cardLabel}>1. Saldo Calculado (En la App)</span>
                    <div className={styles.patrimonyValueCyan}>{fmtAcc(calcBal)}</div>
                  </div>
                  <div className={styles.cardHintSlate}>
                    Saldo Inicial: <strong>{fmtAcc(initBal)}</strong> · Movimientos (
                    {reconcilingAccountTxAll.length}):{' '}
                    <strong className={netTxEffect >= 0 ? styles.monoEmerald : styles.monoRose}>
                      {netTxEffect >= 0 ? '+' : '-'}
                      {fmtAcc(Math.abs(netTxEffect))}
                    </strong>
                    {savedInfo.annualRate > 0 && (
                      <>
                        <br />
                        Interés Compuesto ({savedInfo.annualRate}% E.A. ·{' '}
                        {(savedInfo.dailyRateFactor * 100).toFixed(4)}%/día):{' '}
                        <strong className={styles.monoEmerald}>
                          +{fmtAcc(savedInfo.accumulatedInterest)} acum.
                        </strong>{' '}
                        (Est. hoy: <strong>+{fmtAcc(savedInfo.estimatedDailyGain)}/día</strong>)
                      </>
                    )}
                  </div>
                  <div
                    className={styles.reconcileBtnRow}
                    style={{ marginTop: '6px', alignItems: 'center' }}
                  >
                    <label
                      htmlFor="reconcile-rate-input"
                      className={styles.cardHintSlate}
                      style={{ margin: 0 }}
                    >
                      Tasa E.A. (%):
                    </label>
                    <input
                      id="reconcile-rate-input"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={reconcileRateInputValue}
                      onChange={(e) => {
                        setReconcileRateInputValue(e.target.value);
                        setReconcileSavedMsg(null);
                      }}
                      className={styles.reconcileInput}
                      style={{ width: '90px', padding: '5px 8px', fontSize: '12px' }}
                    />
                    <button
                      type="button"
                      disabled={
                        isSavingReconcile ||
                        reconcileRateInputValue.trim() === '' ||
                        !Number.isFinite(Number(reconcileRateInputValue))
                      }
                      onClick={() =>
                        handleSaveReconciliation(
                          reconcilingAccount.id,
                          undefined,
                          Number(reconcileRateInputValue)
                        )
                      }
                      className={styles.reconcileSecondaryBtn}
                    >
                      Guardar % E.A.
                    </button>
                  </div>
                </div>

                {/* 2. Saldo Real en el Banco (Editable) */}
                <div className={styles.reconcileBox}>
                  <div>
                    <label htmlFor="reconcile-bank-input" className={styles.cardLabel}>
                      2. Saldo Real (En tu Banco / Efectivo)
                    </label>
                    <div className={styles.reconcileInputRow}>
                      <input
                        id="reconcile-bank-input"
                        type="number"
                        step="0.01"
                        placeholder={`ej. ${calcBal}`}
                        value={reconcileInputValue}
                        onChange={(e) => {
                          setReconcileInputValue(e.target.value);
                          setReconcileSavedMsg(null);
                        }}
                        className={styles.reconcileInput}
                      />
                    </div>
                  </div>
                  <div className={styles.reconcileBtnRow}>
                    <button
                      type="button"
                      disabled={
                        isSavingReconcile ||
                        reconcileInputValue.trim() === '' ||
                        !Number.isFinite(Number(reconcileInputValue))
                      }
                      onClick={() =>
                        handleSaveReconciliation(
                          reconcilingAccount.id,
                          Number(reconcileInputValue)
                        )
                      }
                      className={styles.reconcileSaveBtn}
                    >
                      {isSavingReconcile ? 'Guardando...' : 'Guardar Saldo Banco'}
                    </button>
                    <button
                      type="button"
                      disabled={isSavingReconcile}
                      onClick={() => handleSaveReconciliation(reconcilingAccount.id, calcBal)}
                      className={styles.reconcileSecondaryBtn}
                      title="Marca la cuenta como cuadrada con el saldo calculado actual"
                    >
                      = Igualar al Calculado
                    </button>
                    {savedInfo.hasReconciled && (
                      <button
                        type="button"
                        disabled={isSavingReconcile}
                        onClick={() => handleSaveReconciliation(reconcilingAccount.id, null)}
                        className={styles.reconcileSecondaryBtn}
                      >
                        Limpiar
                      </button>
                    )}
                    {reconcileSavedMsg && (
                      <span className={styles.monoEmerald} style={{ fontSize: '11px' }}>
                        ✓ {reconcileSavedMsg}
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. Diferencia / Semáforo de Validación */}
                <div
                  className={
                    liveIsDiscrepant
                      ? styles.reconcileBoxDiscrepancy
                      : liveIsMatched
                        ? styles.reconcileBoxMatched
                        : styles.reconcileBox
                  }
                >
                  <div>
                    <span className={styles.cardLabel}>
                      3. Diferencia (Banco vs. Calculado)
                    </span>
                    {liveDiff === null ? (
                      <div className={styles.kpiValueWhite}>Sin validar aún</div>
                    ) : liveIsMatched ? (
                      <div className={styles.patrimonyValueEmerald}>
                        ✓ {fmtAcc(0)} (Cuadrado)
                      </div>
                    ) : (
                      <div className={styles.patrimonyValueRose}>
                        ⚠️ {liveDiff > 0 ? '+' : '-'}
                        {fmtAcc(Math.abs(liveDiff))}
                      </div>
                    )}
                  </div>

                  {liveDiff === null ? (
                    <div className={styles.cardHintSlate}>
                      Ingresa el saldo que ves en tu banco para verificar si coincide con la app.
                    </div>
                  ) : liveIsMatched ? (
                    <div className={styles.cardHintSlate}>
                      <CheckCircle2
                        className={styles.btnIcon}
                        style={{ verticalAlign: 'middle', marginRight: '4px', color: '#34d399' }}
                      />
                      El saldo calculado coincide exactamente con el valor real de tu banco.
                    </div>
                  ) : (
                    <div>
                      <div className={styles.cardHintSlate}>
                        {liveDiff < 0
                          ? `Hay ${fmtAcc(Math.abs(liveDiff))} menos en el banco que en la app (posible gasto o cobro no anotado).`
                          : `Hay ${fmtAcc(Math.abs(liveDiff))} más en el banco que en la app (posible ingreso no anotado o gasto registrado de más).`}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTransaction(null);
                          setTxInitialDraft({
                            tipo: liveDiff < 0 ? 'gasto' : 'ingreso',
                            monto: Number(Math.abs(liveDiff).toFixed(2)),
                            moneda: reconcilingAccount.currency === 'USD' ? 'USD' : 'COP',
                            cuentaOrigenId: reconcilingAccount.id,
                            categoriaMacroId:
                              liveDiff < 0 ? 'Otros' : 'Ingresos Variables',
                            subcategoria:
                              liveDiff < 0 ? 'Otros gastos' : 'Otros ingresos variables',
                            descripcion: 'Ajuste / movimiento detectado en conciliación bancaria',
                          });
                          setIsTxModalOpen(true);
                        }}
                        className={styles.reconcileFixActionBtn}
                      >
                        <Plus className={styles.btnIcon} />
                        <span>
                          Registrar {liveDiff < 0 ? 'Gasto' : 'Ingreso'} faltante por{' '}
                          {fmtAcc(Math.abs(liveDiff))}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Barra de herramientas del historial de la cuenta */}
              <div className={styles.reconcileToolbar}>
                <div>
                  <h3 className={styles.taxonomyTitle}>
                    Movimientos de {reconcilingAccount.name} ({reconcilingAccountTransactions.length}{' '}
                    {reconcilingAccountTransactions.length === 1 ? 'registro' : 'registros'})
                  </h3>
                  <p className={styles.taxonomySubtitle}>
                    Revisa, edita o elimina movimientos de esta cuenta para investigar cualquier
                    diferencia.
                  </p>
                </div>

                <div className={styles.actionControls}>
                  <input
                    type="search"
                    placeholder="Buscar por descripción, categoría o monto..."
                    value={reconcileSearchQuery}
                    onChange={(e) => setReconcileSearchQuery(e.target.value)}
                    className={styles.reconcileSearchInput}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTransaction(null);
                      setTxInitialDraft({
                        tipo: 'gasto',
                        moneda: reconcilingAccount.currency === 'USD' ? 'USD' : 'COP',
                        cuentaOrigenId: reconcilingAccount.id,
                      });
                      setIsTxModalOpen(true);
                    }}
                    className={styles.primaryBtn}
                  >
                    <Plus className={styles.btnIcon} />
                    <span>+ Movimiento en {reconcilingAccount.name}</span>
                  </button>
                </div>
              </div>

              {deleteError && (
                <div className={styles.errorCard}>
                  <span>{deleteError}</span>
                </div>
              )}

              {/* Tabla de movimientos de la cuenta */}
              {reconcilingAccountTransactions.length === 0 ? (
                <div className={styles.stateCard}>
                  No se encontraron movimientos para {reconcilingAccount.name}.
                </div>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead className={styles.tableHead}>
                      <tr>
                        <th className={styles.th}>Fecha</th>
                        <th className={styles.th}>Descripción</th>
                        <th className={styles.th}>Categoría / Subcategoría</th>
                        <th className={styles.th}>Tipo</th>
                        <th className={styles.thRight}>Impacto en {reconcilingAccount.name}</th>
                        <th className={styles.thRight}>Acción</th>
                      </tr>
                    </thead>
                    <tbody className={styles.tableBody}>
                      {reconcilingAccountTransactions.map((tx) => {
                        const txAmount = Number(tx.amount || 0);
                        const isPositiveForThisAccount =
                          (tx.account_id === reconcilingAccount.id &&
                            (tx.category_type === 'INGRESO_FIJO' ||
                              tx.category_type === 'INGRESO_VARIABLE')) ||
                          (tx.destination_account_id === reconcilingAccount.id &&
                            tx.category_type === 'TRANSFERENCIA');
                        const isConfirming = confirmDeleteTxId === tx.id;
                        const isDeleting = deletingTxId === tx.id;
                        const fmtTx =
                          tx.currency === 'USD' ? formatCurrencyUSD : formatCurrencyCOP;

                        return (
                          <tr key={tx.id} className={styles.tr}>
                            <td className={styles.tdDate}>{tx.date}</td>
                            <td className={styles.tdMonth}>
                              {tx.description || tx.sub_category_name}
                            </td>
                            <td className={styles.tdCategory}>
                              <span className={styles.txCategoryMain}>{tx.category_name}</span>
                              <span className={styles.txSubcategoryMuted}>
                                {' '}
                                · {tx.sub_category_name}
                              </span>
                            </td>
                            <td className={styles.tdType}>
                              <span
                                className={
                                  isPositiveForThisAccount
                                    ? styles.txTypeBadgeEmerald
                                    : tx.category_type === 'GASTO'
                                      ? styles.txTypeBadgeRose
                                      : styles.txTypeBadgeCyan
                                }
                              >
                                {formatCategoryTypeLabel(tx.category_type)}
                              </span>
                            </td>
                            <td
                              className={
                                isPositiveForThisAccount ? styles.tdIncome : styles.tdExpense
                              }
                            >
                              {isPositiveForThisAccount ? '+' : '-'}
                              {fmtTx(txAmount)}
                            </td>
                            <td className={styles.tdAction}>
                              {isConfirming ? (
                                <div className={styles.confirmActionGroup}>
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => handleDeleteTransaction(tx.id)}
                                    className={styles.confirmDeleteBtn}
                                  >
                                    {isDeleting ? 'Eliminando...' : 'Confirmar'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => setConfirmDeleteTxId(null)}
                                    className={styles.cancelDeleteBtn}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <div className={styles.actionBtnGroup}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTransaction(tx);
                                      setTxInitialDraft(null);
                                      setIsTxModalOpen(true);
                                    }}
                                    className={styles.editTxBtn}
                                  >
                                    <Pencil className={styles.deleteIcon} />
                                    <span>Editar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteTxId(tx.id)}
                                    className={styles.deleteTxBtn}
                                  >
                                    <Trash2 className={styles.deleteIcon} />
                                    <span>Eliminar</span>
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
          <button
            onClick={() => {
              setEditingTransaction(null);
              setTxInitialDraft(null);
              setIsTxModalOpen(true);
            }}
            className={styles.primaryBtn}
          >
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

          <button
            onClick={() => setIsAiModalOpen(true)}
            className={styles.secondaryCyanBtn}
            style={{
              backgroundColor: 'rgba(168, 85, 247, 0.14)',
              borderColor: 'rgba(192, 132, 252, 0.45)',
              color: '#e9d5ff',
            }}
            title="Abrir Copiloto Financiero IA (Contexto Neon DB + Configuración de API Key por usuario)"
          >
            <Sparkles className={styles.btnIcon} style={{ color: '#c084fc' }} />
            <span>Copiloto IA</span>
          </button>

          <button onClick={() => setIsPeriodModalOpen(true)} className={styles.periodBtn}>
            <Calendar className={styles.mutedIcon} />
            <span>
              Período: <strong className={styles.periodStrong}>{periodLabel}</strong>
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

                  <div className={styles.heroActionsRow}>
                    <div className={styles.heroAccessibleBadge}>
                      <span>✓ 100% Accesible para Flujo de Caja Operativo</span>
                    </div>

                    {accounts.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          openAccountReconciliation(
                            discrepantAccounts[0]?.id || accounts[0].id
                          )
                        }
                        className={
                          discrepantAccounts.length > 0
                            ? styles.reconcileHeroBtnAlert
                            : styles.reconcileHeroBtn
                        }
                      >
                        {discrepantAccounts.length > 0 ? (
                          <>
                            <AlertTriangle className={styles.btnIcon} />
                            <span>
                              {discrepantAccounts.length}{' '}
                              {discrepantAccounts.length === 1
                                ? 'cuenta con descuadre'
                                : 'cuentas con descuadre'}{' '}
                              · Revisar
                            </span>
                          </>
                        ) : (
                          <>
                            <Scale className={styles.btnIcon} />
                            <span>Conciliar Saldos con Banco</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub-account badges from Neon DB (Clicables para Conciliación Estilo Excel) */}
                <div className={styles.subAccountsGrid}>
                  {copLiquidAccounts.map((acc, idx) => {
                    const rec = getAccountReconciliation(acc);
                    const cardClass = rec.isDiscrepant
                      ? styles.subAccountCardDiscrepancy
                      : rec.isMatched
                        ? styles.subAccountCardMatched
                        : styles.subAccountCardInteractive;

                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => openAccountReconciliation(acc.id)}
                        className={cardClass}
                        title="Haz clic para ver detalle de movimientos y validar saldo real con el banco"
                      >
                        <div>
                          <div className={styles.subAccountTopRow}>
                            <span className={styles.subAccountLabel}>{acc.name}</span>
                            {rec.isDiscrepant && (
                              <span className={styles.reconcileStatusBadgeRed}>⚠️ Descuadre</span>
                            )}
                            {rec.isMatched && (
                              <span className={styles.reconcileStatusBadgeGreen}>✓ Cuadrado</span>
                            )}
                          </div>
                          <div className={styles.subAccountTitle}>
                            {acc.type}
                            {rec.annualRate > 0 ? ` · ${rec.annualRate}% E.A.` : ''}
                          </div>
                          <div
                            className={
                              rec.isDiscrepant
                                ? styles.subAccountAmountRose
                                : idx % 2 === 0
                                  ? styles.subAccountAmountEmerald
                                  : styles.subAccountAmountCyan
                            }
                          >
                            {formatCurrencyCOP(Number(acc.current_balance))}
                          </div>
                          {rec.annualRate > 0 && rec.estimatedDailyGain > 0 && (
                            <div className={styles.reconcileBankLineMuted}>
                              +{formatCurrencyCOP(rec.estimatedDailyGain)}/día
                              {rec.accumulatedInterest > 0
                                ? ` · Acum: +${formatCurrencyCOP(rec.accumulatedInterest)}`
                                : ''}
                            </div>
                          )}
                        </div>

                        {rec.isDiscrepant && rec.bankBalance !== null && rec.diff !== null ? (
                          <div>
                            <div className={styles.reconcileBankLineMuted}>
                              Banco: {formatCurrencyCOP(rec.bankBalance)}
                            </div>
                            <div className={styles.reconcileDiffLineRed}>
                              Dif: {rec.diff > 0 ? '+' : '-'}
                              {formatCurrencyCOP(Math.abs(rec.diff))}
                            </div>
                          </div>
                        ) : rec.isMatched ? (
                          <div className={styles.reconcileBankLineMuted}>
                            Igual al banco · Ver detalle →
                          </div>
                        ) : (
                          <div className={styles.reconcileHintLink}>Validar saldo banco →</div>
                        )}
                      </button>
                    );
                  })}

                  {creditCardAccounts.map((acc) => {
                    const balance = Number(acc.current_balance || 0);
                    const hasDebt = balance < 0;
                    const fmtAcc =
                      acc.currency === 'USD' ? formatCurrencyUSD : formatCurrencyCOP;
                    const formattedDebt = fmtAcc(Math.abs(balance));
                    const rec = getAccountReconciliation(acc);
                    const cardClass = rec.isDiscrepant
                      ? styles.subAccountCardDiscrepancy
                      : hasDebt
                        ? styles.subAccountCardRose
                        : styles.subAccountCardInteractive;

                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => openAccountReconciliation(acc.id)}
                        className={cardClass}
                        title="Haz clic para conciliar tarjeta de crédito"
                      >
                        <div>
                          <div className={styles.subAccountTopRow}>
                            <span className={styles.subAccountLabel}>{acc.name}</span>
                            {rec.isDiscrepant && (
                              <span className={styles.reconcileStatusBadgeRed}>⚠️ Descuadre</span>
                            )}
                            {rec.isMatched && (
                              <span className={styles.reconcileStatusBadgeGreen}>✓ Cuadrado</span>
                            )}
                          </div>
                          <div className={styles.subAccountTitle}>{acc.type}</div>
                          <div
                            className={
                              hasDebt || rec.isDiscrepant
                                ? styles.subAccountAmountRose
                                : styles.subAccountAmountEmerald
                            }
                          >
                            {hasDebt ? `Deuda Actual: ${formattedDebt}` : `${formattedDebt} (Al día)`}
                          </div>
                        </div>
                        {rec.isDiscrepant && rec.diff !== null ? (
                          <div className={styles.reconcileDiffLineRed}>
                            Dif: {rec.diff > 0 ? '+' : '-'}
                            {fmtAcc(Math.abs(rec.diff))}
                          </div>
                        ) : (
                          <div className={styles.reconcileHintLink}>Validar saldo TC →</div>
                        )}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      const targetUsd =
                        discrepantUsdAccounts[0]?.id ||
                        usdAccounts[0]?.id ||
                        accounts[0]?.id;
                      if (targetUsd) openAccountReconciliation(targetUsd);
                    }}
                    className={
                      discrepantUsdAccounts.length > 0
                        ? styles.subAccountCardDiscrepancy
                        : styles.subAccountCardInteractive
                    }
                    title="Haz clic para conciliar tus cuentas en USD"
                  >
                    <div>
                      <div className={styles.subAccountTopRow}>
                        <span className={styles.subAccountLabel}>Cuentas USD / Broker</span>
                        {discrepantUsdAccounts.length > 0 && (
                          <span className={styles.reconcileStatusBadgeRed}>⚠️ Descuadre</span>
                        )}
                      </div>
                      <div className={styles.subAccountTitle}>{usdAccountNamesLabel}</div>
                      <div className={styles.subAccountAmountAmber}>
                        {formatCurrencyUSD(totalUsdAccountsBalance)}
                      </div>
                    </div>
                    <div className={styles.reconcileHintLink}>Validar cuentas USD →</div>
                  </button>

                  <div className={styles.subAccountCard}>
                    <div className={styles.subAccountLabel}>Disponibilidad</div>
                    <div className={styles.subAccountTitleEmerald}>Inmediata (T+0)</div>
                    <div className={styles.subAccountNote}>Sin restricciones</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. RESUMEN EJECUTIVO • PERÍODO O CONSOLIDADO ANUAL */}
            <div className={styles.sectionBlock}>
              <div className={styles.sectionHeading}>
                <span>
                  Resumen Ejecutivo ·{' '}
                  {selectedPeriod === 'ALL' ? 'Consolidado Anual 2026' : periodLabel}
                </span>
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
                    {selectedPeriod === 'ALL'
                      ? `● Acumulado (${monthlyRows.length} ${
                          monthlyRows.length === 1 ? 'mes' : 'meses'
                        })`
                      : `● Mes (${periodLabel})`}
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
                  <div className={styles.kpiMetaSmall}>Meta: {savingsGoalPct}%</div>
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
                <div
                  className={styles.savingsCardCop}
                  style={{ cursor: copSavingsAccounts.length > 0 ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (copSavingsAccounts[0]) {
                      openAccountReconciliation(copSavingsAccounts[0].id);
                    }
                  }}
                  title={
                    copSavingsAccounts[0]
                      ? `Haz clic para ver detalle y conciliación de ${copSavingsAccounts[0].name}`
                      : undefined
                  }
                >
                  <span className={styles.cardLabel}>
                    Ahorro Total COP
                    {copSavingsAccounts.length > 0
                      ? ` (${copSavingsAccounts.map((a) => a.name).join(', ')})`
                      : ''}
                  </span>
                  <div className={styles.cardValueEmerald}>
                    {formatCurrencyCOP(totalSavingsCop)}
                  </div>
                  <div className={styles.cardHintMuted}>
                    {copSavingsAccounts.length > 0 &&
                    getAccountReconciliation(copSavingsAccounts[0]).annualRate > 0 ? (
                      <>
                        {getAccountReconciliation(copSavingsAccounts[0]).annualRate}% E.A. · +
                        {formatCurrencyCOP(
                          getAccountReconciliation(copSavingsAccounts[0]).estimatedDailyGain
                        )}
                        /día · Ver detalle →
                      </>
                    ) : (
                      'Cuentas y movimientos tipo Ahorro'
                    )}
                  </div>
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
            {deleteError && (
              <div className={styles.errorCard}>
                <span>{deleteError}</span>
              </div>
            )}

            {selectedCategory && selectedSubcategory ? (
              <>
                <div className={styles.taxonomyBanner}>
                  <div className={styles.bannerHeaderLeft}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSubcategoryName(null);
                        setConfirmDeleteTxId(null);
                        setDeleteError(null);
                      }}
                      className={styles.backBtn}
                    >
                      ← Volver a Subcategorías de {selectedCategory.name}
                    </button>
                    <div>
                      <h3 className={styles.taxonomyTitle}>
                        {selectedCategory.name} · {selectedSubcategory.name} (
                        {subcategoryTransactions.length}{' '}
                        {subcategoryTransactions.length === 1 ? 'movimiento' : 'movimientos'})
                      </h3>
                      <p className={styles.taxonomySubtitle}>
                        Total en {selectedSubcategory.name}:{' '}
                        <strong>{formatCurrencyCOP(selectedSubcategory.amount)}</strong> (
                        {selectedSubcategory.percentage}% de {selectedCategory.name} en{' '}
                        {periodLabel})
                      </p>
                    </div>
                  </div>
                  <div>
                    <span className={styles.taxonomyBadge}>
                      {formatCurrencyCOP(selectedSubcategory.amount)}
                    </span>
                  </div>
                </div>

                {subcategoryTransactions.length === 0 ? (
                  <div className={styles.stateCard}>
                    No hay movimientos registrados en esta subcategoría para {periodLabel}.
                  </div>
                ) : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead className={styles.tableHead}>
                        <tr>
                          <th className={styles.th}>Fecha</th>
                          <th className={styles.th}>Descripción</th>
                          <th className={styles.th}>Cuenta</th>
                          <th className={styles.thRight}>Monto</th>
                          <th className={styles.thRight}>Acción</th>
                        </tr>
                      </thead>
                      <tbody className={styles.tableBody}>
                        {subcategoryTransactions.map((tx) => {
                          const txAmount = Number(tx.amount || 0);
                          const isConfirming = confirmDeleteTxId === tx.id;
                          const isDeleting = deletingTxId === tx.id;
                          const accountLabel = tx.destination_account_name
                            ? `${tx.account_name} → ${tx.destination_account_name}`
                            : tx.account_name;

                          return (
                            <tr key={tx.id} className={styles.tr}>
                              <td className={styles.tdDate}>{tx.date}</td>
                              <td className={styles.tdMonth}>
                                {tx.description || selectedSubcategory.name}
                              </td>
                              <td className={styles.tdAccount}>{accountLabel}</td>
                              <td className={styles.tdExpense}>
                                -{formatCurrencyCOP(txAmount)}
                              </td>
                              <td className={styles.tdAction}>
                                {isConfirming ? (
                                  <div className={styles.confirmActionGroup}>
                                    <button
                                      type="button"
                                      disabled={isDeleting}
                                      onClick={() => handleDeleteTransaction(tx.id)}
                                      className={styles.confirmDeleteBtn}
                                    >
                                      {isDeleting ? 'Eliminando...' : 'Confirmar'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isDeleting}
                                      onClick={() => setConfirmDeleteTxId(null)}
                                      className={styles.cancelDeleteBtn}
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                ) : (
                                  <div className={styles.actionBtnGroup}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingTransaction(tx);
                                        setIsTxModalOpen(true);
                                      }}
                                      className={styles.editTxBtn}
                                      title="Editar movimiento y ajustar saldo en cuenta"
                                    >
                                      <Pencil className={styles.deleteIcon} />
                                      <span>Editar</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteTxId(tx.id)}
                                      className={styles.deleteTxBtn}
                                      title="Eliminar movimiento y revertir saldo en cuenta"
                                    >
                                      <Trash2 className={styles.deleteIcon} />
                                      <span>Eliminar</span>
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : selectedCategory ? (
              <>
                <div className={styles.taxonomyBanner}>
                  <div className={styles.bannerHeaderLeft}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategoryId(null);
                        setSelectedSubcategoryName(null);
                        setConfirmDeleteTxId(null);
                        setDeleteError(null);
                      }}
                      className={styles.backBtn}
                    >
                      ← Volver a Categorías
                    </button>
                    <div>
                      <h3 className={styles.taxonomyTitle}>
                        {selectedCategory.name} ({selectedCategory.subcategories.length}{' '}
                        Subcategorías)
                      </h3>
                      <p className={styles.taxonomySubtitle}>
                        Haz clic en una subcategoría para ver o eliminar sus movimientos · Total:{' '}
                        <strong>{formatCurrencyCOP(selectedCategory.amount)}</strong> (
                        {selectedCategory.percentage}% en {periodLabel})
                      </p>
                    </div>
                  </div>
                  <div>
                    <span className={styles.taxonomyBadge}>
                      {formatCurrencyCOP(selectedCategory.amount)}
                    </span>
                  </div>
                </div>

                <div className={styles.taxonomyGrid}>
                  {selectedCategory.subcategories.map((sub) => (
                    <button
                      key={sub.name}
                      type="button"
                      onClick={() => {
                        setSelectedSubcategoryName(sub.name);
                        setConfirmDeleteTxId(null);
                        setDeleteError(null);
                      }}
                      className={styles.subcategoryCardBtn}
                    >
                      <div className={styles.subcategoryTopRow}>
                        <div className={styles.categoryLeft}>
                          <span
                            className={styles.categoryDot}
                            style={{ backgroundColor: selectedCategory.color }}
                          />
                          <div>
                            <div className={styles.categoryName}>{sub.name}</div>
                            <div className={styles.categorySubcount}>
                              {sub.transactionsCount}{' '}
                              {sub.transactionsCount === 1 ? 'movimiento' : 'movimientos'} · Ver
                              registros →
                            </div>
                          </div>
                        </div>

                        <div className={styles.categoryRight}>
                          <div className={styles.categoryAmount}>
                            {formatCurrencyCOP(sub.amount)}
                          </div>
                          <div
                            className={styles.categoryPercent}
                            style={{ color: selectedCategory.color }}
                          >
                            {sub.percentage}%
                          </div>
                        </div>
                      </div>

                      <div className={styles.progressTrack}>
                        <div
                          className={styles.progressFillCyan}
                          style={{
                            width: `${Math.max(0, Math.min(100, sub.percentage))}%`,
                            backgroundColor: selectedCategory.color,
                          }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className={styles.taxonomyBanner}>
                  <div>
                    <h3 className={styles.taxonomyTitle}>
                      Taxonomía Completa & Análisis ({totalSubcategoriesCount} Subcategorías)
                    </h3>
                    <p className={styles.taxonomySubtitle}>
                      Haz clic en cualquier categoría para ver el desglose detallado de sus
                      subcategorías ({periodLabel}).
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
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategoryId(cat.id);
                        setSelectedSubcategoryName(null);
                        setConfirmDeleteTxId(null);
                        setDeleteError(null);
                      }}
                      className={styles.categoryCardBtn}
                    >
                      <div className={styles.categoryLeft}>
                        <span
                          className={styles.categoryDot}
                          style={{ backgroundColor: cat.color }}
                        />
                        <div>
                          <div className={styles.categoryName}>{cat.name}</div>
                          <div className={styles.categorySubcount}>
                            {cat.subcategoriesCount} subcategoría(s) · Ver detalle →
                          </div>
                        </div>
                      </div>

                      <div className={styles.categoryRight}>
                        <div className={styles.categoryAmount}>{formatCurrencyCOP(cat.amount)}</div>
                        <div className={styles.categoryPercent} style={{ color: cat.color }}>
                          {cat.percentage}%
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* REGISTRO MENSUAL TAB */}
        {!isLoading && !error && activeTab === 'mensual' && (
          <div className={styles.tabContent}>
            {deleteError && (
              <div className={styles.errorCard}>
                <span>{deleteError}</span>
              </div>
            )}

            {selectedFlowMonth ? (
              <>
                <div className={styles.taxonomyBanner}>
                  <div className={styles.bannerHeaderLeft}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFlowMonth(null);
                        setConfirmDeleteTxId(null);
                        setDeleteError(null);
                      }}
                      className={styles.backBtn}
                    >
                      ← Volver a Registro Mensual
                    </button>
                    <div>
                      <h3 className={styles.taxonomyTitle}>
                        Movimientos de {formatMonthLabel(selectedFlowMonth)} (
                        {selectedMonthTransactions.length}{' '}
                        {selectedMonthTransactions.length === 1 ? 'registro' : 'registros'})
                      </h3>
                      {selectedMonthFlowSummary && (
                        <p className={styles.taxonomySubtitle}>
                          Ingresos:{' '}
                          <strong className={styles.monoEmerald}>
                            {formatCurrencyCOP(selectedMonthFlowSummary.ingresos)}
                          </strong>{' '}
                          · Gastos:{' '}
                          <strong className={styles.monoRose}>
                            {formatCurrencyCOP(selectedMonthFlowSummary.gastos)}
                          </strong>{' '}
                          · Balance:{' '}
                          <strong className={styles.monoCyan}>
                            {formatCurrencyCOP(selectedMonthFlowSummary.balanceMes)}
                          </strong>
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className={styles.taxonomyBadge}>
                      {formatMonthLabel(selectedFlowMonth)}
                    </span>
                  </div>
                </div>

                {selectedMonthTransactions.length === 0 ? (
                  <div className={styles.stateCard}>
                    No hay movimientos registrados en {formatMonthLabel(selectedFlowMonth)}.
                  </div>
                ) : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead className={styles.tableHead}>
                        <tr>
                          <th className={styles.th}>Fecha</th>
                          <th className={styles.th}>Descripción</th>
                          <th className={styles.th}>Categoría / Subcategoría</th>
                          <th className={styles.th}>Tipo</th>
                          <th className={styles.th}>Cuenta</th>
                          <th className={styles.thRight}>Monto</th>
                          <th className={styles.thRight}>Acción</th>
                        </tr>
                      </thead>
                      <tbody className={styles.tableBody}>
                        {selectedMonthTransactions.map((tx) => {
                          const txAmount = Number(tx.amount || 0);
                          const isInflow =
                            tx.category_type === 'INGRESO_FIJO' ||
                            tx.category_type === 'INGRESO_VARIABLE';
                          const isConfirming = confirmDeleteTxId === tx.id;
                          const isDeleting = deletingTxId === tx.id;
                          const accountLabel = tx.destination_account_name
                            ? `${tx.account_name} → ${tx.destination_account_name}`
                            : tx.account_name;

                          return (
                            <tr key={tx.id} className={styles.tr}>
                              <td className={styles.tdDate}>{tx.date}</td>
                              <td className={styles.tdMonth}>
                                {tx.description || tx.sub_category_name}
                              </td>
                              <td className={styles.tdCategory}>
                                <span className={styles.txCategoryMain}>{tx.category_name}</span>
                                <span className={styles.txSubcategoryMuted}>
                                  {' '}
                                  · {tx.sub_category_name}
                                </span>
                              </td>
                              <td className={styles.tdType}>
                                <span
                                  className={
                                    isInflow
                                      ? styles.txTypeBadgeEmerald
                                      : tx.category_type === 'GASTO'
                                        ? styles.txTypeBadgeRose
                                        : styles.txTypeBadgeCyan
                                  }
                                >
                                  {formatCategoryTypeLabel(tx.category_type)}
                                </span>
                              </td>
                              <td className={styles.tdAccount}>{accountLabel}</td>
                              <td
                                className={
                                  isInflow
                                    ? styles.tdIncome
                                    : tx.category_type === 'GASTO'
                                      ? styles.tdExpense
                                      : styles.tdAccumulated
                                }
                              >
                                {isInflow ? '+' : '-'}
                                {formatCurrencyCOP(txAmount)}
                              </td>
                              <td className={styles.tdAction}>
                                {isConfirming ? (
                                  <div className={styles.confirmActionGroup}>
                                    <button
                                      type="button"
                                      disabled={isDeleting}
                                      onClick={() => handleDeleteTransaction(tx.id)}
                                      className={styles.confirmDeleteBtn}
                                    >
                                      {isDeleting ? 'Eliminando...' : 'Confirmar'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isDeleting}
                                      onClick={() => setConfirmDeleteTxId(null)}
                                      className={styles.cancelDeleteBtn}
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                ) : (
                                  <div className={styles.actionBtnGroup}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingTransaction(tx);
                                        setIsTxModalOpen(true);
                                      }}
                                      className={styles.editTxBtn}
                                      title="Editar movimiento y ajustar saldo en cuenta"
                                    >
                                      <Pencil className={styles.deleteIcon} />
                                      <span>Editar</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteTxId(tx.id)}
                                      className={styles.deleteTxBtn}
                                      title="Eliminar movimiento y revertir saldo en cuenta"
                                    >
                                      <Trash2 className={styles.deleteIcon} />
                                      <span>Eliminar</span>
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className={styles.monthlyBanner}>
                  <h3 className={styles.taxonomyTitle}>Registro Mensual de Flujo de Caja</h3>
                  <p className={styles.taxonomySubtitle}>
                    Haz clic en cualquier mes para ver el listado detallado de sus movimientos y
                    administrarlos.
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
                        <tr
                          key={row.rawMonth}
                          onClick={() => {
                            setSelectedFlowMonth(row.rawMonth);
                            setConfirmDeleteTxId(null);
                            setDeleteError(null);
                          }}
                          className={styles.trClickable}
                        >
                          <td className={styles.tdMonthClickable}>
                            <span>{row.month}</span>
                            <span className={styles.rowDrillHint}>Ver movimientos →</span>
                          </td>
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
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
