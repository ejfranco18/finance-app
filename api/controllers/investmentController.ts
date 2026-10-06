import type { Request, Response } from 'express';
import { query, withTransaction } from '../lib/db';

const VALID_CURRENCIES = new Set(['COP', 'USD']);

/**
 * POST /api/investments/buy
 * Registra una compra de acciones/ETFs:
 * 1. Valida brokerAccountId, ticker, shares, buyPrice, currency.
 * 2. Verifica/crea el ticker en `securities` (UPSERT).
 * 3. Consulta si existe posición previa en `portfolio_holdings` y calcula el nuevo precio promedio ponderado:
 *    nuevo_precio_promedio = ((shares_actuales * precio_promedio_actual) + (nuevas_shares * buyPrice)) / (shares_actuales + nuevas_shares)
 * 4. Ejecuta UPSERT en `portfolio_holdings`.
 * 5. Descuenta el efectivo total (shares * buyPrice) de `accounts.current_balance`.
 * 6. Registra la transacción tipo 'INVERSION' en `transactions`.
 */
export async function buyInvestment(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || req.body?.userId;
    const {
      brokerAccountId,
      ticker,
      name,
      assetClass,
      shares,
      buyPrice,
      currency = 'USD',
      date,
    } = req.body;

    const normalizedTicker = typeof ticker === 'string' ? ticker.trim().toUpperCase() : '';
    const numShares = Number(shares);
    const numBuyPrice = Number(buyPrice);
    const txDate = date || new Date().toISOString().slice(0, 10);

    if (
      !userId ||
      !brokerAccountId ||
      !normalizedTicker ||
      !Number.isFinite(numShares) ||
      numShares <= 0 ||
      !Number.isFinite(numBuyPrice) ||
      numBuyPrice <= 0 ||
      !VALID_CURRENCIES.has(currency)
    ) {
      return res.status(400).json({
        error:
          'Datos inválidos. Se requieren brokerAccountId, ticker, shares (> 0), buyPrice (> 0) y currency (COP|USD).',
      });
    }

    const totalCost = numShares * numBuyPrice;
    const securityName = (typeof name === 'string' && name.trim()) || normalizedTicker;
    const securityAssetClass = (typeof assetClass === 'string' && assetClass.trim()) || 'Equity';

    const result = await withTransaction(async (client) => {
      // 1. Verificar/crear el título en `securities` (UPSERT)
      await client.query(
        `INSERT INTO securities (ticker, name, asset_class, currency, current_price, last_price_update)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (ticker) DO UPDATE
         SET current_price = EXCLUDED.current_price,
             last_price_update = CURRENT_TIMESTAMP`,
        [normalizedTicker, securityName, securityAssetClass, currency, numBuyPrice]
      );

      // 2. Consultar si ya existe posición en `portfolio_holdings` (FOR UPDATE)
      const existingHolding = await client.query<{
        id: string;
        shares: string;
        average_buy_price: string;
      }>(
        `SELECT id, shares, average_buy_price
         FROM portfolio_holdings
         WHERE user_id = $1 AND account_id = $2::uuid AND ticker = $3
         FOR UPDATE`,
        [userId, brokerAccountId, normalizedTicker]
      );

      let newShares = numShares;
      let newAverageBuyPrice = numBuyPrice;

      // 3. Cálculo de Precio Promedio Ponderado
      if (existingHolding.rowCount && existingHolding.rowCount > 0) {
        const currentShares = Number(existingHolding.rows[0].shares);
        const currentAvgPrice = Number(existingHolding.rows[0].average_buy_price);
        newShares = currentShares + numShares;
        newAverageBuyPrice =
          (currentShares * currentAvgPrice + numShares * numBuyPrice) / newShares;
      }

      // 4. UPSERT en `portfolio_holdings`
      const holdingUpsert = await client.query<{
        id: string;
        shares: string;
        average_buy_price: string;
      }>(
        `INSERT INTO portfolio_holdings (
          user_id,
          account_id,
          ticker,
          shares,
          average_buy_price,
          currency,
          updated_at
        )
        VALUES ($1, $2::uuid, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, account_id, ticker) DO UPDATE
        SET shares = $4,
            average_buy_price = $5,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id, shares, average_buy_price`,
        [userId, brokerAccountId, normalizedTicker, newShares, newAverageBuyPrice, currency]
      );

      // 5. Descontar el efectivo total (shares * buyPrice) de la cuenta del Broker
      const brokerUpdate = await client.query<{ current_balance: string }>(
        `UPDATE accounts
         SET current_balance = current_balance - $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2::uuid AND user_id = $3
         RETURNING current_balance`,
        [totalCost, brokerAccountId, userId]
      );

      if (brokerUpdate.rowCount === 0) {
        throw new Error('La cuenta del broker no existe o no pertenece al usuario.');
      }

      // 6. Registrar la transacción correspondiente tipo 'INVERSION' en `transactions`
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
        VALUES ($1, $2::uuid, $3::date, $4, $5, 'INVERSION', 'Inversión', $6, $7)
        RETURNING id`,
        [
          userId,
          brokerAccountId,
          txDate,
          totalCost,
          currency,
          normalizedTicker,
          `Compra de ${numShares} ${normalizedTicker} @ ${numBuyPrice} ${currency}`,
        ]
      );

      return {
        holdingId: holdingUpsert.rows[0].id,
        transactionId: txInsert.rows[0].id,
        ticker: normalizedTicker,
        totalShares: Number(holdingUpsert.rows[0].shares),
        averageBuyPrice: Number(holdingUpsert.rows[0].average_buy_price),
        totalInvestedOrder: totalCost,
        brokerRemainingBalance: Number(brokerUpdate.rows[0].current_balance),
      };
    });

    return res.status(201).json({
      success: true,
      ...result,
      message: 'Compra de inversión registrada y portafolio actualizado correctamente.',
    });
  } catch (error) {
    console.error('Error al registrar compra de inversión:', error);
    return res.status(500).json({ error: 'Error interno al procesar la compra de inversión.' });
  }
}

/**
 * Estrategia Caché On-Demand para precios de mercado (> 30 minutos).
 * Revisa `securities.last_price_update` de los títulos del usuario y refresca los que tengan
 * más de 30 minutos de antigüedad consultando Yahoo Finance.
 */
export async function refreshStaleSecurityPrices(userId: string): Promise<void> {
  try {
    const staleResult = await query<{ ticker: string }>(
      `SELECT DISTINCT s.ticker
       FROM portfolio_holdings h
       JOIN securities s ON h.ticker = s.ticker
       WHERE h.user_id = $1
         AND (
           s.last_price_update IS NULL
           OR s.last_price_update < (CURRENT_TIMESTAMP - INTERVAL '30 minutes')
         )`,
      [userId]
    );

    if (staleResult.rowCount === 0) {
      return;
    }

    await Promise.allSettled(
      staleResult.rows.map(async ({ ticker }) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
          const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });

          if (!res.ok) return;

          const data: any = await res.json();
          const marketPrice = Number(
            data?.chart?.result?.[0]?.meta?.regularMarketPrice
          );

          if (Number.isFinite(marketPrice) && marketPrice > 0) {
            await query(
              `UPDATE securities
               SET current_price = $1,
                   last_price_update = CURRENT_TIMESTAMP
               WHERE ticker = $2`,
              [marketPrice, ticker]
            );
          }
        } catch (fetchErr) {
          console.warn(`No se pudo refrescar el precio de mercado para ${ticker}:`, fetchErr);
        } finally {
          clearTimeout(timeout);
        }
      })
    );
  } catch (error) {
    console.warn('Error al verificar caché de precios de títulos:', error);
  }
}
