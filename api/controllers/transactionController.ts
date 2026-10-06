import type { Request, Response } from 'express';
import { withTransaction } from '../lib/db';

const VALID_CATEGORY_TYPES = new Set([
  'INGRESO_FIJO',
  'INGRESO_VARIABLE',
  'GASTO',
  'AHORRO',
  'INVERSION',
  'DEUDA',
  'TRANSFERENCIA',
]);

const VALID_CURRENCIES = new Set(['COP', 'USD']);

export async function createTransaction(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || req.body?.userId;
    // Soporta tanto payload plano (según logic.md) como anidado en { transaction: {...} }
    const payload = req.body?.transaction ? req.body.transaction : req.body;

    const accountId = payload?.accountId;
    const destinationAccountId = payload?.destinationAccountId || null;
    const categoryId = payload?.categoryId || null;
    const date = payload?.date;
    const amount = Number(payload?.amount);
    const currency = payload?.currency || 'COP';
    const categoryType = payload?.categoryType || payload?.category;
    const categoryName = payload?.categoryName || payload?.subCategory || categoryType;
    const subCategoryName = payload?.subCategoryName ?? payload?.subCategory ?? null;
    const description = payload?.description ?? null;
    const isRecurring = Boolean(payload?.isRecurring);

    // 1. Validar payload de entrada
    if (
      !userId ||
      !accountId ||
      !date ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !categoryType ||
      !VALID_CATEGORY_TYPES.has(categoryType) ||
      !categoryName ||
      !VALID_CURRENCIES.has(currency)
    ) {
      return res.status(400).json({
        error:
          'Faltan datos obligatorios o válidos (accountId, date, amount > 0, categoryType, categoryName, currency COP|USD).',
      });
    }

    if (categoryType === 'TRANSFERENCIA' && !destinationAccountId) {
      return res.status(400).json({
        error: 'destinationAccountId es obligatorio cuando categoryType es TRANSFERENCIA.',
      });
    }

    // 2. Iniciar transacción SQL (BEGIN ... COMMIT)
    const result = await withTransaction(async (client) => {
      // Resolver cuenta si se envió un slug en vez de UUID
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(accountId)
      );
      let resolvedAccountId = String(accountId);

      if (!isUuid) {
        const existingAcc = await client.query<{ id: string }>(
          `SELECT id FROM accounts WHERE user_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
          [userId, String(accountId)]
        );
        if (existingAcc.rowCount && existingAcc.rows[0]) {
          resolvedAccountId = existingAcc.rows[0].id;
        } else {
          const createdAcc = await client.query<{ id: string }>(
            `INSERT INTO accounts (user_id, name, type, currency, initial_balance, current_balance)
             VALUES ($1, $2, 'Banco', $3, 0, 0)
             RETURNING id`,
            [userId, String(accountId), currency]
          );
          resolvedAccountId = createdAcc.rows[0].id;
        }
      }

      // Asegurar que la categoría y subcategoría existan en la tabla categories
      let resolvedCategoryId = categoryId;
      if (!resolvedCategoryId && categoryName) {
        const catRes = await client.query<{ id: string }>(
          `INSERT INTO categories (user_id, type, category_name, sub_category_name, is_active)
           VALUES ($1, $2, $3, $4, TRUE)
           ON CONFLICT (user_id, type, category_name, sub_category_name)
           DO UPDATE SET is_active = TRUE
           RETURNING id`,
          [userId, categoryType, categoryName, subCategoryName]
        );
        resolvedCategoryId = catRes.rows[0]?.id || null;
      }

      // 3. Registrar la transacción en la tabla transactions
      const insertTx = await client.query<{ id: string }>(
        `INSERT INTO transactions (
          user_id,
          account_id,
          destination_account_id,
          category_id,
          date,
          amount,
          currency,
          category_type,
          category_name,
          sub_category_name,
          description,
          is_recurring
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::date, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          userId,
          resolvedAccountId,
          destinationAccountId,
          resolvedCategoryId,
          date,
          amount,
          currency,
          categoryType,
          categoryName,
          subCategoryName,
          description,
          isRecurring,
        ]
      );

      const transactionId = insertTx.rows[0].id;

      // 4 & 5. Actualizar current_balance en accounts directamente en la moneda de la cuenta (sin TRM)
      const isInflow = categoryType === 'INGRESO_FIJO' || categoryType === 'INGRESO_VARIABLE';
      const originDelta = isInflow ? amount : -amount;

      const updateOrigin = await client.query<{ id: string; current_balance: string; currency: string }>(
        `UPDATE accounts
         SET current_balance = current_balance + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2::uuid AND user_id = $3
         RETURNING id, current_balance, currency`,
        [originDelta, resolvedAccountId, userId]
      );

      if (updateOrigin.rowCount === 0) {
        throw new Error('La cuenta de origen no existe o no pertenece al usuario.');
      }

      let destinationAccount = null;
      if (categoryType === 'TRANSFERENCIA' && destinationAccountId) {
        const updateDest = await client.query<{ id: string; current_balance: string; currency: string }>(
          `UPDATE accounts
           SET current_balance = current_balance + $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2::uuid AND user_id = $3
           RETURNING id, current_balance, currency`,
          [amount, destinationAccountId, userId]
        );

        if (updateDest.rowCount === 0) {
          throw new Error('La cuenta de destino no existe o no pertenece al usuario.');
        }
        destinationAccount = {
          id: updateDest.rows[0].id,
          currentBalance: Number(updateDest.rows[0].current_balance),
          currency: updateDest.rows[0].currency,
        };
      }

      return {
        transactionId,
        originAccount: {
          id: updateOrigin.rows[0].id,
          currentBalance: Number(updateOrigin.rows[0].current_balance),
          currency: updateOrigin.rows[0].currency,
        },
        destinationAccount,
      };
    });

    return res.status(201).json({
      success: true,
      ...result,
      message: 'Transacción registrada y saldo actualizado correctamente.',
    });
  } catch (error) {
    console.error('Error al crear transacción:', error);
    return res.status(500).json({ error: 'Error interno al procesar la transacción.' });
  }
}

export async function deleteTransaction(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || String(req.params.userId || '');
    const transactionId = String(req.params.transactionId || '');

    if (!userId || !transactionId) {
      return res.status(400).json({ error: 'Parámetros insuficientes.' });
    }

    const deleted = await withTransaction(async (client) => {
      const delRes = await client.query<{
        account_id: string;
        destination_account_id: string | null;
        amount: string;
        category_type: string;
      }>(
        `DELETE FROM transactions
         WHERE id = $1::uuid AND user_id = $2
         RETURNING account_id, destination_account_id, amount, category_type`,
        [transactionId, userId]
      );

      if (delRes.rowCount === 0) {
        return null;
      }

      const tx = delRes.rows[0];
      const amount = Number(tx.amount);
      const isInflow = tx.category_type === 'INGRESO_FIJO' || tx.category_type === 'INGRESO_VARIABLE';
      const revertDelta = isInflow ? -amount : amount;

      await client.query(
        `UPDATE accounts
         SET current_balance = current_balance + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2::uuid AND user_id = $3`,
        [revertDelta, tx.account_id, userId]
      );

      if (tx.category_type === 'TRANSFERENCIA' && tx.destination_account_id) {
        await client.query(
          `UPDATE accounts
           SET current_balance = current_balance - $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2::uuid AND user_id = $3`,
          [amount, tx.destination_account_id, userId]
        );
      }

      return tx;
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Transacción no encontrada.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Transacción eliminada y saldos revertidos correctamente.',
    });
  } catch (error) {
    console.error('Error al eliminar transacción:', error);
    return res.status(500).json({ error: 'Error interno al eliminar la transacción.' });
  }
}