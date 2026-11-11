import type { Request, Response } from 'express';
import {
  query,
  withTransaction,
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
             WHEN t.sub_category_name = 'Venta de Acción / ETF'
               THEN CASE
                 WHEN t.destination_account_id = a.id THEN COALESCE(t.destination_amount, t.amount)
                 ELSE 0
               END
             WHEN t.account_id = a.id AND t.category_type IN ('INGRESO_FIJO', 'INGRESO_VARIABLE')
               THEN t.amount
             WHEN t.account_id = a.id AND t.category_type IN ('GASTO', 'AHORRO', 'INVERSION', 'DEUDA', 'TRANSFERENCIA')
               THEN -t.amount
             WHEN t.destination_account_id = a.id AND t.category_type IN ('TRANSFERENCIA', 'AHORRO', 'INVERSION')
               THEN COALESCE(t.destination_amount, t.amount)
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
        `SELECT id, type, category_name, sub_category_name, COALESCE(is_global, FALSE) AS is_global
         FROM categories
         WHERE (is_global = TRUE OR user_id = $1) AND is_active = TRUE
         ORDER BY is_global DESC, category_name ASC, sub_category_name ASC`,
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

    const hasInitialBalanceUpdate =
      req.body?.initialBalance !== undefined &&
      req.body?.initialBalance !== null &&
      req.body?.initialBalance !== '';
    let numericInitialBalance: number | null = null;
    if (hasInitialBalanceUpdate) {
      numericInitialBalance = Number(req.body.initialBalance);
      if (!Number.isFinite(numericInitialBalance)) {
        return res.status(400).json({
          error: 'El saldo inicial de la cuenta debe ser un valor numérico válido.',
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
         initial_balance = CASE
           WHEN $7::boolean THEN $8::numeric
           ELSE initial_balance
         END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2::uuid
         AND user_id = $3
       RETURNING
         id, name, type, currency, initial_balance, current_balance,
         reconciled_balance, reconciled_at, annual_interest_rate,
         accumulated_interest, TO_CHAR(last_interest_date, 'YYYY-MM-DD') AS last_interest_date`,
      [
        numericReconciled,
        accountId,
        userId,
        hasReconcileUpdate,
        hasRateUpdate,
        numericRate,
        hasInitialBalanceUpdate,
        numericInitialBalance,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Cuenta no encontrada para el usuario autenticado.',
      });
    }

    const updated = result.rows[0];
    const currentBal = hasInitialBalanceUpdate
      ? await updateAccountBalance(userId, accountId)
      : Number(updated.current_balance || 0);
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
        accumulated_interest: Number(updated.accumulated_interest || 0),
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

const VALID_CUSTOM_CATEGORY_TYPES = new Set([
  'INGRESO_FIJO',
  'INGRESO_VARIABLE',
  'GASTO',
  'AHORRO',
  'INVERSION',
  'TRANSFERENCIA',
]);

/**
 * POST /api/categories
 * Crea explícitamente una categoría/subcategoría personalizada para el usuario (is_global = FALSE).
 */
export async function createCustomCategory(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || String(req.body?.userId || '').trim();
    const rawType = String(req.body?.type || 'GASTO').trim().toUpperCase();
    const categoryName = String(req.body?.categoryName || '').trim();
    const subCategoryName = String(req.body?.subCategoryName || '').trim();

    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado.' });
    }
    if (!VALID_CUSTOM_CATEGORY_TYPES.has(rawType)) {
      return res.status(400).json({ error: 'Tipo de categoría no válido.' });
    }
    if (categoryName.length < 2 || categoryName.length > 60) {
      return res.status(400).json({
        error: 'El nombre de la categoría debe tener entre 2 y 60 caracteres.',
      });
    }
    if (subCategoryName.length < 2 || subCategoryName.length > 60) {
      return res.status(400).json({
        error: 'El nombre de la subcategoría debe tener entre 2 y 60 caracteres.',
      });
    }

    const category = await withTransaction(async (client) => {
      // Asegurar que el usuario exista en users
      await client.query(
        `INSERT INTO users (id, email, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [userId, req.user?.email || `${userId}@user.local`, req.user?.name || 'Usuario']
      );

      // Verificar si ya existe como global o personalizada activa
      const existing = await client.query<{ id: string; is_global: boolean }>(
        `SELECT id, COALESCE(is_global, FALSE) AS is_global
         FROM categories
         WHERE (is_global = TRUE OR user_id = $1)
           AND type = $2
           AND LOWER(category_name) = LOWER($3)
           AND LOWER(COALESCE(sub_category_name, '')) = LOWER($4)
           AND is_active = TRUE
         LIMIT 1`,
        [userId, rawType, categoryName, subCategoryName]
      );

      if (existing.rows[0]) {
        throw new Error('DUPLICATE_CATEGORY');
      }

      const inserted = await client.query<{
        id: string;
        user_id: string;
        type: string;
        category_name: string;
        sub_category_name: string;
        is_global: boolean;
      }>(
        `INSERT INTO categories (user_id, type, category_name, sub_category_name, is_active, is_global)
         VALUES ($1, $2, $3, $4, TRUE, FALSE)
         ON CONFLICT (user_id, type, category_name, sub_category_name)
         DO UPDATE SET is_active = TRUE, category_name = EXCLUDED.category_name, sub_category_name = EXCLUDED.sub_category_name
         RETURNING id, user_id, type, category_name, sub_category_name, is_global`,
        [userId, rawType, categoryName, subCategoryName]
      );

      return inserted.rows[0];
    });

    return res.status(201).json({
      message: 'Categoría personalizada creada exitosamente.',
      category,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'DUPLICATE_CATEGORY') {
      return res.status(409).json({
        error: 'Esta categoría y subcategoría ya existe en el catálogo.',
      });
    }
    console.error('Error al crear categoría personalizada:', error);
    return res.status(500).json({
      error: 'Error interno al crear la categoría personalizada.',
    });
  }
}

/**
 * PUT /api/categories/:categoryId
 * Edita una categoría o subcategoría personalizada del usuario (is_global = FALSE) y sincroniza sus transacciones asociadas.
 */
export async function updateCustomCategory(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || String(req.body?.userId || '').trim();
    const categoryId = String(req.params.categoryId || '').trim();
    const categoryName = String(req.body?.categoryName || '').trim();
    const subCategoryName = String(req.body?.subCategoryName || '').trim();
    const renameMacroCategory = Boolean(req.body?.renameMacroCategory);
    const requestedType = req.body?.type
      ? String(req.body.type).trim().toUpperCase()
      : undefined;

    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado.' });
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)) {
      return res.status(400).json({ error: 'ID de categoría no válido.' });
    }
    if (requestedType && !VALID_CUSTOM_CATEGORY_TYPES.has(requestedType)) {
      return res.status(400).json({ error: 'Tipo de categoría no válido.' });
    }
    if (categoryName.length < 2 || categoryName.length > 60) {
      return res.status(400).json({
        error: 'El nombre de la categoría debe tener entre 2 y 60 caracteres.',
      });
    }
    if (!renameMacroCategory && (subCategoryName.length < 2 || subCategoryName.length > 60)) {
      return res.status(400).json({
        error: 'El nombre de la subcategoría debe tener entre 2 y 60 caracteres.',
      });
    }

    const updated = await withTransaction(async (client) => {
      const currentRes = await client.query<{
        id: string;
        user_id: string | null;
        type: string;
        category_name: string;
        sub_category_name: string | null;
        is_global: boolean;
      }>(
        `SELECT id, user_id, type, category_name, sub_category_name, COALESCE(is_global, FALSE) AS is_global
         FROM categories
         WHERE id = $1::uuid
         LIMIT 1`,
        [categoryId]
      );

      const current = currentRes.rows[0];
      if (!current) {
        throw new Error('NOT_FOUND');
      }
      if (current.is_global || current.user_id !== userId) {
        throw new Error('FORBIDDEN_GLOBAL');
      }

      const targetType = requestedType || current.type;

      if (renameMacroCategory) {
        // Verificar colisión si se renombra toda la categoría personalizada
        const collision = await client.query<{ id: string }>(
          `SELECT c1.id
           FROM categories c1
           WHERE (c1.is_global = TRUE OR c1.user_id = $1)
             AND c1.type = $2
             AND LOWER(c1.category_name) = LOWER($3)
             AND LOWER(c1.category_name) != LOWER($4)
             AND c1.is_active = TRUE
             AND LOWER(COALESCE(c1.sub_category_name, '')) IN (
               SELECT LOWER(COALESCE(c2.sub_category_name, ''))
               FROM categories c2
               WHERE c2.user_id = $1
                 AND c2.is_global = FALSE
                 AND c2.type = $5
                 AND LOWER(c2.category_name) = LOWER($4)
             )
           LIMIT 1`,
          [userId, targetType, categoryName, current.category_name, current.type]
        );
        if (collision.rows[0]) {
          throw new Error('DUPLICATE_CATEGORY');
        }

        const updRes = await client.query<{
          id: string;
          user_id: string;
          type: string;
          category_name: string;
          sub_category_name: string;
          is_global: boolean;
        }>(
          `UPDATE categories
           SET category_name = $1,
               type = $2
           WHERE user_id = $3
             AND is_global = FALSE
             AND type = $4
             AND LOWER(category_name) = LOWER($5)
           RETURNING id, user_id, type, category_name, sub_category_name, is_global`,
          [categoryName, targetType, userId, current.type, current.category_name]
        );

        await client.query(
          `UPDATE transactions
           SET category_name = $1,
               category_type = $2
           WHERE user_id = $3
             AND category_type = $4
             AND LOWER(category_name) = LOWER($5)`,
          [categoryName, targetType, userId, current.type, current.category_name]
        );

        return updRes.rows[0];
      }

      const duplicate = await client.query<{ id: string }>(
        `SELECT id
         FROM categories
         WHERE id != $1::uuid
           AND (is_global = TRUE OR user_id = $2)
           AND type = $3
           AND LOWER(category_name) = LOWER($4)
           AND LOWER(COALESCE(sub_category_name, '')) = LOWER($5)
           AND is_active = TRUE
         LIMIT 1`,
        [categoryId, userId, targetType, categoryName, subCategoryName]
      );
      if (duplicate.rows[0]) {
        throw new Error('DUPLICATE_CATEGORY');
      }

      const updRes = await client.query<{
        id: string;
        user_id: string;
        type: string;
        category_name: string;
        sub_category_name: string;
        is_global: boolean;
      }>(
        `UPDATE categories
         SET category_name = $1,
             sub_category_name = $2,
             type = $3
         WHERE id = $4::uuid AND user_id = $5 AND is_global = FALSE
         RETURNING id, user_id, type, category_name, sub_category_name, is_global`,
        [categoryName, subCategoryName, targetType, categoryId, userId]
      );

      // Sincronizar los nombres denormalizados en las transacciones del usuario asociadas a esta subcategoría
      await client.query(
        `UPDATE transactions
         SET category_name = $1,
             sub_category_name = $2,
             category_type = $3
         WHERE user_id = $4
           AND (
             category_id = $5::uuid
             OR (category_type = $6 AND category_name = $7 AND COALESCE(sub_category_name, '') = COALESCE($8, ''))
           )`,
        [
          categoryName,
          subCategoryName,
          targetType,
          userId,
          categoryId,
          current.type,
          current.category_name,
          current.sub_category_name || '',
        ]
      );

      return updRes.rows[0];
    });

    return res.status(200).json({
      message: 'Categoría personalizada actualizada exitosamente.',
      category: updated,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NOT_FOUND') {
        return res.status(404).json({ error: 'Categoría no encontrada.' });
      }
      if (error.message === 'FORBIDDEN_GLOBAL') {
        return res.status(403).json({
          error: 'Solo puedes editar tus propias categorías personalizadas (las categorías globales son fijas).',
        });
      }
      if (error.message === 'DUPLICATE_CATEGORY') {
        return res.status(409).json({
          error: 'Ya existe otra categoría/subcategoría con ese nombre.',
        });
      }
    }
    console.error('Error al actualizar categoría personalizada:', error);
    return res.status(500).json({
      error: 'Error interno al actualizar la categoría personalizada.',
    });
  }
}

/**
 * DELETE /api/categories/:categoryId
 * Elimina una categoría personalizada del usuario (is_global = FALSE) y reasigna sus transacciones a General -> General.
 */
export async function deleteCustomCategory(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || String(req.query.userId || '').trim();
    const categoryId = String(req.params.categoryId || '').trim();

    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado.' });
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)) {
      return res.status(400).json({ error: 'ID de categoría no válido.' });
    }

    await withTransaction(async (client) => {
      const currentRes = await client.query<{
        id: string;
        user_id: string | null;
        type: string;
        category_name: string;
        sub_category_name: string | null;
        is_global: boolean;
      }>(
        `SELECT id, user_id, type, category_name, sub_category_name, COALESCE(is_global, FALSE) AS is_global
         FROM categories
         WHERE id = $1::uuid
         LIMIT 1`,
        [categoryId]
      );

      const current = currentRes.rows[0];
      if (!current) {
        throw new Error('NOT_FOUND');
      }
      if (current.is_global || current.user_id !== userId) {
        throw new Error('FORBIDDEN_GLOBAL');
      }

      const generalRes = await client.query<{ id: string }>(
        `SELECT id
         FROM categories
         WHERE is_global = TRUE
           AND LOWER(category_name) = 'general'
           AND LOWER(COALESCE(sub_category_name, '')) = 'general'
         LIMIT 1`
      );
      const generalId = generalRes.rows[0]?.id || null;

      await client.query(
        `UPDATE transactions
         SET category_id = $1::uuid,
             category_name = 'General',
             sub_category_name = 'General'
         WHERE user_id = $2
           AND (
             category_id = $3::uuid
             OR (category_type = $4 AND category_name = $5 AND COALESCE(sub_category_name, '') = COALESCE($6, ''))
           )`,
        [
          generalId,
          userId,
          categoryId,
          current.type,
          current.category_name,
          current.sub_category_name || '',
        ]
      );

      await client.query(
        `DELETE FROM categories WHERE id = $1::uuid AND user_id = $2 AND is_global = FALSE`,
        [categoryId, userId]
      );
    });

    return res.status(200).json({
      message: 'Categoría personalizada eliminada y movimientos reasignados a General.',
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NOT_FOUND') {
        return res.status(404).json({ error: 'Categoría no encontrada.' });
      }
      if (error.message === 'FORBIDDEN_GLOBAL') {
        return res.status(403).json({
          error: 'No puedes eliminar categorías globales del sistema.',
        });
      }
    }
    console.error('Error al eliminar categoría personalizada:', error);
    return res.status(500).json({
      error: 'Error interno al eliminar la categoría personalizada.',
    });
  }
}