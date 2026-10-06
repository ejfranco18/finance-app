import type { Request, Response } from 'express';
import { withTransaction } from '../lib/db';

/**
 * POST /api/liabilities/payments
 * Registra un pago a un pasivo/deuda:
 * 1. Valida accountId, liabilityId, date, totalPaid, principalAmount, interestAmount.
 * 2. En una transacción SQL (BEGIN ... COMMIT):
 *    - Registra la transacción tipo 'DEUDA' por totalPaid en `transactions`.
 *    - Descuenta totalPaid de `accounts.current_balance`.
 *    - Inserta el desglose de amortización en `liability_payments`.
 *    - Disminuye `liabilities.current_balance` descontando únicamente `principalAmount`.
 */
export async function createLiabilityPayment(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || req.body?.userId;
    const {
      accountId,
      liabilityId,
      date,
      totalPaid,
      principalAmount,
      interestAmount,
      description,
    } = req.body;

    const total = Number(totalPaid);
    const principal = Number(principalAmount);
    const interest = Number(interestAmount);

    if (
      !userId ||
      !accountId ||
      !liabilityId ||
      !date ||
      !Number.isFinite(total) ||
      total <= 0 ||
      !Number.isFinite(principal) ||
      principal < 0 ||
      !Number.isFinite(interest) ||
      interest < 0
    ) {
      return res.status(400).json({
        error:
          'Datos inválidos. Se requieren accountId, liabilityId, date, totalPaid (> 0), principalAmount (>= 0) e interestAmount (>= 0).',
      });
    }

    const result = await withTransaction(async (client) => {
      // Verificar que el pasivo exista y pertenezca al usuario
      const liabilityCheck = await client.query<{
        id: string;
        name: string;
        currency: string;
      }>(
        `SELECT id, name, currency
         FROM liabilities
         WHERE id = $1::uuid AND user_id = $2
         FOR UPDATE`,
        [liabilityId, userId]
      );

      if (liabilityCheck.rowCount === 0) {
        throw new Error('El pasivo/deuda especificado no existe o no pertenece al usuario.');
      }

      const liability = liabilityCheck.rows[0];

      // 1. Descontar el valor total pagado de la cuenta bancaria origen
      const accountUpdate = await client.query<{
        id: string;
        current_balance: string;
        currency: string;
      }>(
        `UPDATE accounts
         SET current_balance = current_balance - $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2::uuid AND user_id = $3
         RETURNING id, current_balance, currency`,
        [total, accountId, userId]
      );

      if (accountUpdate.rowCount === 0) {
        throw new Error('La cuenta origen no existe o no pertenece al usuario.');
      }

      const accountCurrency = accountUpdate.rows[0].currency || liability.currency || 'COP';

      // 2. Registrar la transacción tipo 'DEUDA' en transactions
      const txInsert = await client.query<{ id: string }>(
        `INSERT INTO transactions (
          user_id,
          account_id,
          date,
          amount,
          currency,
          category_type,
          category_name,
          sub_category_name,
          description
        )
        VALUES ($1, $2::uuid, $3::date, $4, $5, 'DEUDA', 'Deuda', $6, $7)
        RETURNING id`,
        [
          userId,
          accountId,
          date,
          total,
          accountCurrency,
          liability.name,
          description || `Abono a deuda: ${liability.name}`,
        ]
      );

      const transactionId = txInsert.rows[0].id;

      // 3. Insertar la amortización en liability_payments
      const paymentInsert = await client.query<{ id: string }>(
        `INSERT INTO liability_payments (
          liability_id,
          transaction_id,
          date,
          principal_amount,
          interest_amount,
          total_paid
        )
        VALUES ($1::uuid, $2::uuid, $3::date, $4, $5, $6)
        RETURNING id`,
        [liabilityId, transactionId, date, principal, interest, total]
      );

      // 4. Disminuir el saldo pendiente en liabilities descontando únicamente principalAmount
      const liabilityUpdate = await client.query<{ current_balance: string }>(
        `UPDATE liabilities
         SET current_balance = GREATEST(0, current_balance - $1),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2::uuid AND user_id = $3
         RETURNING current_balance`,
        [principal, liabilityId, userId]
      );

      return {
        paymentId: paymentInsert.rows[0].id,
        transactionId,
        accountNewBalance: Number(accountUpdate.rows[0].current_balance),
        liabilityRemainingBalance: Number(liabilityUpdate.rows[0].current_balance),
      };
    });

    return res.status(201).json({
      success: true,
      ...result,
      message: 'Pago de deuda registrado y saldos actualizados correctamente.',
    });
  } catch (error) {
    console.error('Error al registrar pago de pasivo:', error);
    return res.status(500).json({ error: 'Error interno al procesar el pago de la deuda.' });
  }
}
