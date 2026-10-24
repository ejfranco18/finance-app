import type { Request, Response } from 'express';
import {
  query,
  ensureAccountReconciliationColumns,
  applyDailyCompoundInterest,
} from '../lib/db';
export {
  getMonthlyCanvasView as getMonthlyCanvas,
  getNetWorthView as getNetWorth,
  getInvestmentsSummaryView as getInvestmentsSummary,
  getDatabaseOverview,
} from './viewsController';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Recalcula el saldo actual (current_balance) de una cuenta en PostgreSQL
 * partiendo de su initial_balance + accumulated_interest más el historial de transacciones.
 */
export async function updateAccountBalance(userId: string, accountId: string): Promise<number> {
  await ensureAccountReconciliationColumns();

  const result = await query<{ current_balance: string }>(
    `UPDATE accounts a
     SET
       current_balance = a.initial_balance + COALESCE(a.accumulated_interest, 0) + COALESCE((
         SELECT SUM(
           CASE
             WHEN t.account_id = a.id AND t.category_type IN ('INGRESO_FIJO', 'INGRESO_VARIABLE')
               THEN t.amount
             WHEN t.account_id = a.id AND t.category_type IN ('GASTO', 'AHORRO', 'INVERSION', 'DEUDA', 'TRANSFERENCIA')
               THEN -t.amount
             WHEN t.destination_account_id = a.id AND t.category_type IN ('TRANSFERENCIA', 'AHORRO', 'INVERSION')
               THEN t.amount
             ELSE 0
           END
         )
         FROM transactions t
         WHERE t.user_id = $1
           AND (t.account_id = a.id OR t.destination_account_id = a.id)
       ), 0),
       updated_at = CURRENT_TIMESTAMP
     WHERE a.id = $2::uuid
       AND a.user_id = $1
     RETURNING current_balance`,
    [userId, accountId]
  );

  if (result.rowCount === 0) {
    throw new Error('Cuenta no encontrada para el usuario.');
  }

  return Number(result.rows[0].current_balance);
}

/**
 * Endpoint GET /api/users/:userId/settings
 */
export async function getUserSettings(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || String(req.params.userId || '');
    if (!userId) {
      return res.status(400).json({ error: 'Parámetro userId requerido.' });
    }

    const [settingsRes, categoryRes] = await Promise.all([
      query(
        `SELECT main_currency, exchange_rate_cop_usd, ai_provider
         FROM user_settings
         WHERE user_id = $1`,
        [userId]
      ),
      query(
        `SELECT id, type, category_name, sub_category_name
         FROM categories
         WHERE user_id = $1 AND is_active = TRUE
         ORDER BY category_name ASC, sub_category_name ASC`,
        [userId]
      ),
    ]);

    const settings = settingsRes.rows[0];
    const categoriesByType: Record<string, string[]> = {};

    for (const row of categoryRes.rows) {
      const type = String(row.type);
      if (!categoriesByType[type]) {
        categoriesByType[type] = [];
      }
      const label = row.sub_category_name
        ? `${row.category_name} - ${row.sub_category_name}`
        : String(row.category_name);
      categoriesByType[type].push(label);
    }

    return res.status(200).json({
      mainCurrency: settings?.main_currency ?? 'COP',
      exchangeRateCOPUSD: settings ? Number(settings.exchange_rate_cop_usd) : null,
      aiProvider: settings?.ai_provider ?? 'gemini',
      categories: categoriesByType,
    });
  } catch (error) {
    console.error('Error al obtener configuración del usuario:', error);
    return res.status(500).json({ error: 'Error interno al consultar la configuración.' });
  }
}

/**
 * Endpoint GET /api/users/:userId/accounts
 */
export async function getUserAccounts(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || String(req.params.userId || '');
    if (!userId) {
      return res.status(400).json({ error: 'Parámetro userId requerido.' });
    }

    await applyDailyCompoundInterest(userId);

    const result = await query(
      `SELECT
         id,
         name,
         type,
         currency,
         initial_balance,
         current_balance,
         reconciled_balance,
         reconciled_at,
         annual_interest_rate,
         accumulated_interest,
         TO_CHAR(last_interest_date, 'YYYY-MM-DD') AS last_interest_date,
         updated_at
       FROM accounts
       WHERE user_id = $1 AND is_active = TRUE
       ORDER BY created_at ASC`,
      [userId]
    );

    const accounts = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      currency: row.currency,
      initialBalance: Number(row.initial_balance),
      balance: Number(row.current_balance),
      reconciledBalance:
        row.reconciled_balance !== null && row.reconciled_balance !== undefined
          ? Number(row.reconciled_balance)
          : null,
      reconciledAt: row.reconciled_at ?? null,
      annualInterestRate: Number(row.annual_interest_rate || 0),
      accumulatedInterest: Number(row.accumulated_interest || 0),
      lastInterestDate: row.last_interest_date ?? null,
      updatedAt: row.updated_at,
    }));

    return res.status(200).json(accounts);
  } catch (error) {
    console.error('Error al obtener cuentas del usuario:', error);
    return res.status(500).json({ error: 'Error interno al consultar las cuentas.' });
  }
}

/**
 * Endpoint POST /api/accounts
 * Crea una nueva cuenta bancaria, billetera digital, efectivo o broker para el usuario autenticado.
 */
export async function createAccount(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || String(req.body?.userId || '');
    const name = String(req.body?.name || '').trim();
    const type = String(req.body?.type || 'Banco').trim();
    const currency = req.body?.currency === 'USD' ? 'USD' : 'COP';
    const initialBalance = Number(req.body?.initialBalance ?? req.body?.currentBalance ?? 0);
    const rawRate = req.body?.annualInterestRate;

    const isCreditCard =
      type.toLowerCase() === 'tarjeta de crédito' || type.toLowerCase() === 'tarjeta de credito';

    const defaultNuRate = !isCreditCard && name.toLowerCase().startsWith('nu') ? 9.35 : 0;
    const annualInterestRate =
      rawRate !== undefined && rawRate !== null && rawRate !== ''
        ? Math.max(0, Math.min(100, Number(rawRate) || 0))
        : defaultNuRate;

    if (
      !userId ||
      !name ||
      name.length < 2 ||
      !Number.isFinite(initialBalance) ||
      (!isCreditCard && initialBalance < 0)
    ) {
      return res.status(400).json({
        error:
          'Datos inválidos. Indica un nombre válido y un saldo inicial válido para el tipo de cuenta.',
      });
    }

    await ensureAccountReconciliationColumns();

    const result = await query<{
      id: string;
      name: string;
      type: string;
      currency: string;
      initial_balance: string;
      current_balance: string;
      annual_interest_rate: string;
    }>(
      `INSERT INTO accounts (
         user_id, name, type, currency, initial_balance, current_balance,
         annual_interest_rate, last_interest_date, is_active
       )
       VALUES (
         $1, $2, $3, $4, $5, $5,
         $6, CASE WHEN $6::numeric > 0 THEN (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date ELSE NULL END, TRUE
       )
       RETURNING id, name, type, currency, initial_balance, current_balance, annual_interest_rate`,
      [userId, name, type, currency, initialBalance, annualInterestRate]
    );

    const created = result.rows[0];
    return res.status(201).json({
      success: true,
      account: {
        id: created.id,
        name: created.name,
        type: created.type,
        currency: created.currency,
        initialBalance: Number(created.initial_balance),
        currentBalance: Number(created.current_balance),
        annualInterestRate: Number(created.annual_interest_rate || 0),
      },
    });
  } catch (error) {
    console.error('Error al crear cuenta en Neon DB:', error);
    return res.status(500).json({ error: 'Error interno al crear la cuenta.' });
  }
}

/**
 * Endpoint PUT /api/accounts/:accountId/reconcile
 * Guarda o limpia el saldo real en banco (`reconciled_balance`) y/o actualiza la tasa de
 * interés compuesto anual (`annual_interest_rate`) de una cuenta.
 */
export async function reconcileAccount(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || String(req.body?.userId || '');
    const accountId = String(req.params.accountId || '').trim();

    if (!userId || !UUID_REGEX.test(accountId)) {
      return res.status(400).json({
        error: 'Identificador de cuenta o usuario inválido.',
      });
    }

    await ensureAccountReconciliationColumns();

    const hasRateUpdate =
      req.body?.annualInterestRate !== undefined && req.body?.annualInterestRate !== null;
    let numericRate: number | null = null;
    if (hasRateUpdate) {
      numericRate = Number(req.body.annualInterestRate);
      if (!Number.isFinite(numericRate) || numericRate < 0 || numericRate > 100) {
        return res.status(400).json({
          error: 'La tasa de interés anual (E.A.) debe estar entre 0% y 100%.',
        });
      }
    }

    const hasReconcileUpdate =
      req.body?.reconciledBalance !== undefined || req.body?.clear !== undefined;
    const rawValue = req.body?.reconciledBalance;
    const shouldClear =
      rawValue === null ||
      rawValue === '' ||
      req.body?.clear === true;

    let numericReconciled: number | null = null;
    if (hasReconcileUpdate && !shouldClear) {
      numericReconciled = Number(rawValue);
      if (!Number.isFinite(numericReconciled)) {
        return res.status(400).json({
          error: 'El saldo real en banco debe ser un valor numérico válido.',
        });
      }
    }

    const result = await query<{
      id: string;
      name: string;
      type: string;
      currency: string;
      initial_balance: string;
      current_balance: string;
      reconciled_balance: string | null;
      reconciled_at: string | null;
      annual_interest_rate: string;
      accumulated_interest: string;
      last_interest_date: string | null;
    }>(
      `UPDATE accounts
       SET
         reconciled_balance = CASE
           WHEN $4::boolean THEN $1::numeric
           ELSE reconciled_balance
         END,
         reconciled_at = CASE
           WHEN $4::boolean THEN (CASE WHEN $1::numeric IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END)
           ELSE reconciled_at
         END,
         annual_interest_rate = CASE
           WHEN $5::boolean THEN $6::numeric
           ELSE annual_interest_rate
         END,
         last_interest_date = CASE
           WHEN $5::boolean AND $6::numeric > 0 THEN COALESCE(last_interest_date, (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date)
           ELSE last_interest_date
         END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2::uuid
         AND user_id = $3
       RETURNING
         id, name, type, currency, initial_balance, current_balance,
         reconciled_balance, reconciled_at, annual_interest_rate,
         accumulated_interest, TO_CHAR(last_interest_date, 'YYYY-MM-DD') AS last_interest_date`,
      [numericReconciled, accountId, userId, hasReconcileUpdate, hasRateUpdate, numericRate]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Cuenta no encontrada para el usuario autenticado.',
      });
    }

    const updated = result.rows[0];
    const currentBal = Number(updated.current_balance || 0);
    const reconciledBal =
      updated.reconciled_balance !== null && updated.reconciled_balance !== undefined
        ? Number(updated.reconciled_balance)
        : null;

    return res.status(200).json({
      success: true,
      account: {
        id: updated.id,
        name: updated.name,
        type: updated.type,
        currency: updated.currency,
        initialBalance: Number(updated.initial_balance || 0),
        currentBalance: currentBal,
        reconciledBalance: reconciledBal,
        discrepancy: reconciledBal !== null ? Number((reconciledBal - currentBal).toFixed(2)) : null,
        reconciledAt: updated.reconciled_at,
        annualInterestRate: Number(updated.annual_interest_rate || 0),
        accumulatedInterest: Number(updated.accumulated_interest || 0),
        lastInterestDate: updated.last_interest_date,
      },
    });
  } catch (error) {
    console.error('Error al actualizar cuenta:', error);
    return res.status(500).json({
      error: 'Error interno al actualizar la cuenta.',
    });
  }
}

/**
 * Endpoint GET/POST /api/cron/daily-interest
 * Ejecutado automáticamente cada día después de medianoche (00:05 hora Colombia / 05:05 UTC)
 * por Vercel Cron Jobs (y de forma idempotente al abrir el Dashboard).
 */
export async function runDailyInterestCron(req: Request, res: Response) {
  try {
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (cronSecret) {
      const authHeader = req.headers.authorization || '';
      if (authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'No autorizado para ejecutar el cron job.' });
      }
    }

    const accrued = await applyDailyCompoundInterest();
    return res.status(200).json({
      success: true,
      executedAt: new Date().toISOString(),
      accountsUpdated: accrued.length,
      accrued,
    });
  } catch (error) {
    console.error('Error ejecutando cron de interés compuesto diario:', error);
    return res.status(500).json({
      error: 'Error interno al calcular el interés compuesto diario.',
    });
  }
}