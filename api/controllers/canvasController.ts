import type { Request, Response } from 'express';
import { query } from '../lib/db';
export {
  getMonthlyCanvasView as getMonthlyCanvas,
  getNetWorthView as getNetWorth,
  getInvestmentsSummaryView as getInvestmentsSummary,
  getDatabaseOverview,
} from './viewsController';

/**
 * Recalcula el saldo actual (current_balance) de una cuenta en PostgreSQL
 * partiendo de su initial_balance más el historial de transacciones.
 */
export async function updateAccountBalance(userId: string, accountId: string): Promise<number> {
  const result = await query<{ current_balance: string }>(
    `UPDATE accounts a
     SET
       current_balance = a.initial_balance + COALESCE((
         SELECT SUM(
           CASE
             WHEN t.account_id = a.id AND t.category_type IN ('INGRESO_FIJO', 'INGRESO_VARIABLE')
               THEN t.amount
             WHEN t.account_id = a.id AND t.category_type IN ('GASTO', 'AHORRO', 'INVERSION', 'DEUDA', 'TRANSFERENCIA')
               THEN -t.amount
             WHEN t.destination_account_id = a.id AND t.category_type = 'TRANSFERENCIA'
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

    const result = await query(
      `SELECT
         id,
         name,
         type,
         currency,
         initial_balance,
         current_balance,
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

    if (!userId || !name || name.length < 2 || !Number.isFinite(initialBalance) || initialBalance < 0) {
      return res.status(400).json({
        error: 'Datos inválidos. Indica un nombre válido y un saldo inicial mayor o igual a 0.',
      });
    }

    const result = await query<{
      id: string;
      name: string;
      type: string;
      currency: string;
      initial_balance: string;
      current_balance: string;
    }>(
      `INSERT INTO accounts (user_id, name, type, currency, initial_balance, current_balance, is_active)
       VALUES ($1, $2, $3, $4, $5, $5, TRUE)
       RETURNING id, name, type, currency, initial_balance, current_balance`,
      [userId, name, type, currency, initialBalance]
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
      },
    });
  } catch (error) {
    console.error('Error al crear cuenta en Neon DB:', error);
    return res.status(500).json({ error: 'Error interno al crear la cuenta.' });
  }
}