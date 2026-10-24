import type { Request, Response } from 'express';
import {
  query,
  withTransaction,
  applyDailyCompoundInterest,
} from '../lib/db';
import { refreshStaleSecurityPrices } from './investmentController';
import { ensureProductionTelegramWebhook } from './telegramController';

/**
 * GET /api/canvas/:month
 * Consulta la vista consolidada mensual:
 * SELECT * FROM v_monthly_canvas WHERE user_id = $1 AND month = $2;
 */
export async function getMonthlyCanvasView(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || String(req.params.userId || req.query.userId || '');
    const month = String(req.params.month || '');

    if (!userId || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        error: 'Parámetros inválidos. Se requiere usuario autenticado y mes en formato YYYY-MM.',
      });
    }

    const result = await query(
      `SELECT * FROM v_monthly_canvas WHERE user_id = $1 AND month = $2`,
      [userId, month]
    );

    const row = result.rows[0] || {
      user_id: userId,
      month,
      fixed_income: '0.00',
      variable_income: '0.00',
      total_income: '0.00',
      total_expenses: '0.00',
      total_savings: '0.00',
      total_investments: '0.00',
      total_debt_payments: '0.00',
    };

    return res.status(200).json(row);
  } catch (error) {
    console.error('Error al consultar v_monthly_canvas:', error);
    return res.status(500).json({ error: 'Error interno al consultar el canvas mensual.' });
  }
}

/**
 * GET /api/net-worth
 * Consulta el balance de activos, pasivos y patrimonio neto:
 * SELECT * FROM v_net_worth WHERE user_id = $1;
 */
export async function getNetWorthView(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || String(req.params.userId || req.query.userId || '');

    if (!userId) {
      return res.status(400).json({ error: 'Usuario no identificado.' });
    }

    await applyDailyCompoundInterest(userId);

    const result = await query(
      `SELECT * FROM v_net_worth WHERE user_id = $1`,
      [userId]
    );

    const row = result.rows[0] || {
      user_id: userId,
      liquid_assets: '0.00',
      fixed_assets: '0.00',
      total_assets: '0.00',
      total_liabilities: '0.00',
      net_worth: '0.00',
    };

    return res.status(200).json(row);
  } catch (error) {
    console.error('Error al consultar v_net_worth:', error);
    return res.status(500).json({ error: 'Error interno al consultar el patrimonio neto.' });
  }
}

/**
 * GET /api/investments/summary
 * 1. Ejecuta estrategia caché on-demand (> 30 min) para actualizar precios de `securities`.
 * 2. Consulta la vista SQL `v_portfolio_summary` con ganancia/pérdida no realizada:
 *    SELECT * FROM v_portfolio_summary WHERE user_id = $1;
 */
export async function getInvestmentsSummaryView(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || String(req.params.userId || req.query.userId || '');

    if (!userId) {
      return res.status(400).json({ error: 'Usuario no identificado.' });
    }

    // Refrescar precios con antigüedad mayor a 30 minutos antes de leer la vista
    await refreshStaleSecurityPrices(userId);

    const result = await query(
      `SELECT * FROM v_portfolio_summary WHERE user_id = $1 ORDER BY ticker ASC`,
      [userId]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error al consultar v_portfolio_summary:', error);
    return res.status(500).json({ error: 'Error interno al consultar el resumen del portafolio.' });
  }
}

/**
 * GET /api/db-overview
 * Endpoint de diagnóstico para inspeccionar todas las tablas y vistas en DBTest.tsx.
 */
export async function getDatabaseOverview(_req: Request, res: Response) {
  try {
    const data = await withTransaction(async (client) => {
      const [
        users,
        userSettings,
        categories,
        accounts,
        transactions,
        assets,
        liabilities,
        liabilityPayments,
        securities,
        portfolioHoldings,
        vMonthlyCanvas,
        vNetWorth,
        vPortfolioSummary,
      ] = await Promise.all([
        client.query(`SELECT * FROM users ORDER BY created_at DESC`),
        client.query(
          `SELECT user_id, main_currency, exchange_rate_cop_usd, ai_provider, updated_at FROM user_settings`
        ),
        client.query(`SELECT * FROM categories ORDER BY type, category_name, sub_category_name`),
        client.query(`SELECT * FROM accounts ORDER BY created_at ASC`),
        client.query(`SELECT * FROM transactions ORDER BY date DESC, created_at DESC`),
        client.query(`SELECT * FROM assets ORDER BY created_at ASC`),
        client.query(`SELECT * FROM liabilities ORDER BY created_at ASC`),
        client.query(`SELECT * FROM liability_payments ORDER BY date DESC`),
        client.query(`SELECT * FROM securities ORDER BY ticker ASC`),
        client.query(`SELECT * FROM portfolio_holdings ORDER BY ticker ASC`),
        client.query(`SELECT * FROM v_monthly_canvas ORDER BY month DESC`),
        client.query(`SELECT * FROM v_net_worth`),
        client.query(`SELECT * FROM v_portfolio_summary ORDER BY ticker ASC`),
      ]);

      return {
        tables: {
          users: users.rows,
          user_settings: userSettings.rows,
          categories: categories.rows,
          accounts: accounts.rows,
          transactions: transactions.rows,
          assets: assets.rows,
          liabilities: liabilities.rows,
          liability_payments: liabilityPayments.rows,
          securities: securities.rows,
          portfolio_holdings: portfolioHoldings.rows,
        },
        views: {
          v_monthly_canvas: vMonthlyCanvas.rows,
          v_net_worth: vNetWorth.rows,
          v_portfolio_summary: vPortfolioSummary.rows,
        },
      };
    });

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al obtener resumen completo de la base de datos:', error);
    return res.status(500).json({ error: 'Error interno al consultar las tablas de Neon.' });
  }
}

/**
 * GET /api/canvas-dashboard
 * Devuelve todos los datos consolidados desde Neon PostgreSQL para el componente Canvas.tsx:
 * - Configuración del usuario (moneda base, TRM)
 * - Cuentas activas (liquidez inmediata COP, ahorro, inversión, cuentas USD)
 * - Vista v_net_worth (activos líquidos, fijos, pasivos y patrimonio neto)
 * - Vista v_monthly_canvas (flujo mensual e indicadores anuales acumulados)
 * - Vista v_portfolio_summary (posiciones de inversión en USD)
 * - Taxonomía de categorías con montos y conteo de subcategorías
 */
export async function getCanvasDashboard(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || String(req.params.userId || req.query.userId || '');
    const rawMonth = String(req.query.month || '').trim();
    const filterMonth = /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : null;

    if (!userId) {
      return res.status(400).json({ error: 'Usuario no identificado.' });
    }

    // Asegura en segundo plano que el Webhook 24/7 de Telegram apunte al dominio HTTPS de producción (Vercel)
    void ensureProductionTelegramWebhook(userId, req);

    // Asegura columnas y aplica el interés compuesto diario si ya pasó medianoche (Bogotá)
    await applyDailyCompoundInterest(userId);

    // Actualizar precios de acciones (> 30 min) desde Yahoo Finance antes de leer v_portfolio_summary
    await refreshStaleSecurityPrices(userId);

    const [
      settingsRes,
      accountsRes,
      netWorthRes,
      monthlyCanvasRes,
      portfolioRes,
      taxonomyRes,
      transactionsRes,
    ] = await Promise.all([
      query(
        `SELECT main_currency, exchange_rate_cop_usd, ai_provider
         FROM user_settings
         WHERE user_id = $1`,
        [userId]
      ),
      query(
        `SELECT
           id, name, type, currency, initial_balance, current_balance,
           reconciled_balance, reconciled_at,
           annual_interest_rate, accumulated_interest,
           TO_CHAR(last_interest_date, 'YYYY-MM-DD') AS last_interest_date,
           is_active
         FROM accounts
         WHERE user_id = $1 AND is_active = TRUE
         ORDER BY created_at ASC`,
        [userId]
      ),
      query(
        `SELECT liquid_assets, fixed_assets, total_assets, total_liabilities, net_worth
         FROM v_net_worth
         WHERE user_id = $1`,
        [userId]
      ),
      query(
        `SELECT month, fixed_income, variable_income, total_income, total_expenses, total_savings, total_investments, total_debt_payments
         FROM v_monthly_canvas
         WHERE user_id = $1
         ORDER BY month ASC`,
        [userId]
      ),
      query(
        `SELECT account_id, account_name, ticker, security_name, shares, average_buy_price, current_price, total_cost_basis, current_market_value, unrealized_pnl, pnl_percentage, currency
         FROM v_portfolio_summary
         WHERE user_id = $1
         ORDER BY ticker ASC`,
        [userId]
      ),
      query(
        `WITH subcat_base AS (
           SELECT
             c.category_name,
             c.type AS category_type,
             COALESCE(c.sub_category_name, 'General') AS sub_category_name
           FROM categories c
           WHERE c.user_id = $1 AND c.is_active = TRUE
           UNION
           SELECT
             t.category_name,
             t.category_type,
             COALESCE(t.sub_category_name, 'General') AS sub_category_name
           FROM transactions t
           WHERE t.user_id = $1
             AND ($2::text IS NULL OR TO_CHAR(t.date, 'YYYY-MM') = $2)
         ),
         tx_by_subcat AS (
           SELECT
             t.category_name,
             t.category_type,
             COALESCE(t.sub_category_name, 'General') AS sub_category_name,
             SUM(t.amount) AS total_amount,
             COUNT(*)::int AS transactions_count
           FROM transactions t
           WHERE t.user_id = $1
             AND ($2::text IS NULL OR TO_CHAR(t.date, 'YYYY-MM') = $2)
           GROUP BY t.category_name, t.category_type, COALESCE(t.sub_category_name, 'General')
         ),
         subcat_enriched AS (
           SELECT
             sb.category_name,
             sb.category_type,
             sb.sub_category_name,
             COALESCE(tx.total_amount, 0) AS sub_amount,
             COALESCE(tx.transactions_count, 0) AS transactions_count
           FROM subcat_base sb
           LEFT JOIN tx_by_subcat tx
             ON sb.category_name = tx.category_name
             AND sb.category_type = tx.category_type
             AND sb.sub_category_name = tx.sub_category_name
         )
         SELECT
           se.category_name,
           se.category_type,
           COUNT(*)::int AS subcategories_count,
           COALESCE(SUM(se.sub_amount), 0) AS amount,
           COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'name', se.sub_category_name,
                 'amount', se.sub_amount,
                 'transactions_count', se.transactions_count
               )
               ORDER BY se.sub_amount DESC, se.sub_category_name ASC
             ),
             '[]'::json
           ) AS subcategories
         FROM subcat_enriched se
         GROUP BY se.category_name, se.category_type
         ORDER BY amount DESC, se.category_name ASC`,
        [userId, filterMonth]
      ),
      query(
        `SELECT
           t.id,
           TO_CHAR(t.date, 'YYYY-MM-DD') AS date,
           TO_CHAR(t.date, 'YYYY-MM') AS month,
           COALESCE(t.description, '') AS description,
           t.amount,
           t.currency,
           t.category_type,
           t.category_name,
           COALESCE(t.sub_category_name, 'General') AS sub_category_name,
           t.account_id,
           COALESCE(a.name, 'Cuenta') AS account_name,
           t.destination_account_id,
           da.name AS destination_account_name,
           COALESCE(t.is_recurring, FALSE) AS is_recurring
         FROM transactions t
         LEFT JOIN accounts a ON t.account_id = a.id
         LEFT JOIN accounts da ON t.destination_account_id = da.id
         WHERE t.user_id = $1
         ORDER BY t.date DESC, t.created_at DESC`,
        [userId]
      ),
    ]);

    const settings = settingsRes.rows[0] || {
      main_currency: 'COP',
      exchange_rate_cop_usd: '3303.1600',
      ai_provider: 'gemini',
    };

    const netWorth = netWorthRes.rows[0] || {
      liquid_assets: '0.00',
      fixed_assets: '0.00',
      total_assets: '0.00',
      total_liabilities: '0.00',
      net_worth: '0.00',
    };

    return res.status(200).json({
      settings,
      accounts: accountsRes.rows,
      netWorth,
      monthlyCanvas: monthlyCanvasRes.rows,
      portfolio: portfolioRes.rows,
      taxonomy: taxonomyRes.rows,
      transactions: transactionsRes.rows,
    });
  } catch (error) {
    console.error('Error al obtener datos del Canvas Dashboard:', error);
    return res.status(500).json({ error: 'Error interno al consultar los datos del Canvas.' });
  }
}

/**
 * POST /api/patrimony
 * Registra un nuevo Activo Líquido (en `accounts`), Activo Fijo/Inversión (en `assets`)
 * o Pasivo/Deuda (en `liabilities`) desde AssetLiabilityFormModal.
 */
export async function createPatrimonyRecord(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || String(req.body?.userId || '');
    const {
      tipoClasificacion,
      nombreInstrumento,
      institucion,
      moneda,
      valorMonto,
      tasaRendimientoOInteres,
    } = req.body || {};

    const amount = Number(valorMonto);
    const currency = moneda === 'USD' ? 'USD' : 'COP';

    if (!userId || !nombreInstrumento || !institucion || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        error: 'Datos inválidos. Verifica nombre, entidad y un valor mayor a 0.',
      });
    }

    if (tipoClasificacion === 'activo_liquido') {
      const accRes = await query<{ id: string }>(
        `INSERT INTO accounts (user_id, name, type, currency, initial_balance, current_balance, is_active)
         VALUES ($1, $2, $3, $4, $5, $5, TRUE)
         RETURNING id`,
        [userId, String(nombreInstrumento).trim(), String(institucion).trim(), currency, amount]
      );
      return res.status(201).json({
        success: true,
        table: 'accounts',
        id: accRes.rows[0]?.id,
      });
    }

    if (tipoClasificacion === 'pasivo_deuda') {
      const rate = Number.isFinite(Number(tasaRendimientoOInteres))
        ? Number(tasaRendimientoOInteres)
        : 0;
      const liaRes = await query<{ id: string }>(
        `INSERT INTO liabilities (user_id, name, type, original_amount, current_balance, interest_rate, currency)
         VALUES ($1, $2, $3, $4, $4, $5, $6)
         RETURNING id`,
        [
          userId,
          `${String(nombreInstrumento).trim()} (${String(institucion).trim()})`,
          String(institucion).trim(),
          amount,
          rate,
          currency,
        ]
      );
      return res.status(201).json({
        success: true,
        table: 'liabilities',
        id: liaRes.rows[0]?.id,
      });
    }

    // Por defecto: 'activo_fijo_inversion' -> tabla assets
    const assetRes = await query<{ id: string }>(
      `INSERT INTO assets (user_id, name, type, estimated_value, currency)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        userId,
        `${String(nombreInstrumento).trim()} (${String(institucion).trim()})`,
        String(institucion).trim(),
        amount,
        currency,
      ]
    );

    return res.status(201).json({
      success: true,
      table: 'assets',
      id: assetRes.rows[0]?.id,
    });
  } catch (error) {
    console.error('Error al registrar activo o pasivo:', error);
    return res.status(500).json({ error: 'Error interno al guardar el registro patrimonial.' });
  }
}

/**
 * POST /api/settings
 * Actualiza la TRM oficial (exchange_rate_cop_usd) en `user_settings` desde PeriodConfigFormModal.
 */
export async function updatePeriodSettings(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || String(req.body?.userId || '');
    const trm = Number(req.body?.trmOficialCopUsd ?? req.body?.exchangeRateCopUsd);

    if (!userId || !Number.isFinite(trm) || trm <= 0) {
      return res.status(400).json({ error: 'Se requiere una TRM válida mayor a 0.' });
    }

    await query(
      `INSERT INTO user_settings (user_id, main_currency, exchange_rate_cop_usd, ai_provider, updated_at)
       VALUES ($1, 'COP', $2, 'gemini', CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         exchange_rate_cop_usd = EXCLUDED.exchange_rate_cop_usd,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, trm]
    );

    return res.status(200).json({
      success: true,
      exchangeRateCopUsd: trm,
    });
  } catch (error) {
    console.error('Error al actualizar configuración de período / TRM:', error);
    return res.status(500).json({ error: 'Error interno al actualizar la configuración.' });
  }
}
