import type { Request, Response } from 'express';
import { query, withTransaction } from '../lib/db';

const VALID_CURRENCIES = new Set(['COP', 'USD']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchYahooMarketQuote(
  ticker: string
): Promise<{ price: number | null; name: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      ticker
    )}?interval=1d&range=1d`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return { price: null, name: null };

    const data: any = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const rawPrice = Number(meta?.regularMarketPrice);
    const price = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : null;
    const name =
      (typeof meta?.longName === 'string' && meta.longName.trim()) ||
      (typeof meta?.shortName === 'string' && meta.shortName.trim()) ||
      null;
    return { price, name };
  } catch {
    return { price: null, name: null };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * POST /api/investments/buy
 * Registra un lote independiente de compra de acciones/ETFs en `portfolio_holdings`:
 * 1. Valida ticker, shares (> 0), buyPrice (> 0), purchaseDate (date) y currency.
 * 2. Resuelve la cuenta Broker del usuario (o la crea si no existe).
 * 3. Consulta el precio del día en Yahoo Finance y hace UPSERT del ticker en `securities`.
 * 4. Inserta el registro independiente del lote en `portfolio_holdings` con su `purchase_date`.
 * 5. Opcionalmente (si deductFromAccount = true) descuenta el efectivo de la cuenta y registra la transacción.
 */
export async function buyInvestment(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || req.body?.userId;
    const {
      brokerAccountId,
      accountId,
      ticker,
      name,
      assetClass,
      shares,
      buyPrice,
      currentPrice,
      currency = 'USD',
      date,
      purchaseDate,
      deductFromAccount = false,
    } = req.body;
    const requestedBrokerAccountId = brokerAccountId || accountId;

    const normalizedTicker = typeof ticker === 'string' ? ticker.trim().toUpperCase() : '';
    const numShares = Number(shares);
    const numBuyPrice = Number(buyPrice);
    const manualCurrentPrice =
      currentPrice !== undefined && currentPrice !== null && currentPrice !== ''
        ? Number(currentPrice)
        : null;
    const lotDate = purchaseDate || date || new Date().toISOString().slice(0, 10);

    if (
      !userId ||
      !normalizedTicker ||
      !Number.isFinite(numShares) ||
      numShares <= 0 ||
      !Number.isFinite(numBuyPrice) ||
      numBuyPrice <= 0 ||
      !VALID_CURRENCIES.has(currency)
    ) {
      return res.status(400).json({
        error:
          'Datos inválidos. Se requieren ticker, shares (> 0), buyPrice (> 0) y currency (COP|USD).',
      });
    }

    const totalCost = numShares * numBuyPrice;
    const quote = await fetchYahooMarketQuote(normalizedTicker);
    const hasManualPrice =
      manualCurrentPrice !== null && Number.isFinite(manualCurrentPrice) && manualCurrentPrice > 0;
    const marketPrice = hasManualPrice ? manualCurrentPrice : quote.price ?? numBuyPrice;
    const securityName =
      (typeof name === 'string' && name.trim()) || quote.name || normalizedTicker;
    const securityAssetClass = (typeof assetClass === 'string' && assetClass.trim()) || 'Equity';

    const result = await withTransaction(async (client) => {
      // 1. Resolver o crear la cuenta Broker del usuario
      let resolvedAccountId: string | null = null;
      if (requestedBrokerAccountId && UUID_REGEX.test(String(requestedBrokerAccountId))) {
        const accCheck = await client.query<{ id: string }>(
          `SELECT id FROM accounts WHERE id = $1::uuid AND user_id = $2 LIMIT 1`,
          [requestedBrokerAccountId, userId]
        );
        resolvedAccountId = accCheck.rows[0]?.id || null;
      }

      if (!resolvedAccountId) {
        const brokerLookup = await client.query<{ id: string }>(
          `SELECT id FROM accounts
           WHERE user_id = $1 AND LOWER(type) IN ('broker', 'inversión', 'inversion')
           ORDER BY CASE WHEN LOWER(type) = 'broker' THEN 0 ELSE 1 END, created_at ASC
           LIMIT 1`,
          [userId]
        );
        if (brokerLookup.rows[0]?.id) {
          resolvedAccountId = brokerLookup.rows[0].id;
        } else {
          const createdBroker = await client.query<{ id: string }>(
            `INSERT INTO accounts (user_id, name, type, currency, initial_balance, current_balance)
             VALUES ($1, 'Broker Inversiones', 'Broker', $2, 0, 0)
             RETURNING id`,
            [userId, currency]
          );
          resolvedAccountId = createdBroker.rows[0].id;
        }
      }

      // 2. Verificar/actualizar el título centralizado en `securities`
      await client.query(
        `INSERT INTO securities (ticker, name, asset_class, currency, current_price, last_price_update)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (ticker) DO UPDATE
         SET current_price = CASE
               WHEN $6::boolean THEN EXCLUDED.current_price
               ELSE securities.current_price
             END,
             name = CASE
               WHEN securities.name = securities.ticker AND EXCLUDED.name <> EXCLUDED.ticker THEN EXCLUDED.name
               ELSE securities.name
             END,
             last_price_update = CASE
               WHEN $6::boolean THEN CURRENT_TIMESTAMP
               ELSE securities.last_price_update
             END`,
        [
          normalizedTicker,
          securityName,
          securityAssetClass,
          currency,
          marketPrice,
          hasManualPrice || quote.price !== null,
        ]
      );

      // 3. Insertar lote independiente en `portfolio_holdings`
      const holdingInsert = await client.query<{
        id: string;
        shares: string;
        average_buy_price: string;
        purchase_date: string;
      }>(
        `INSERT INTO portfolio_holdings (
          user_id,
          account_id,
          ticker,
          shares,
          average_buy_price,
          purchase_date,
          currency,
          updated_at
        )
        VALUES ($1, $2::uuid, $3, $4, $5, $6::date, $7, CURRENT_TIMESTAMP)
        RETURNING id, shares, average_buy_price, TO_CHAR(purchase_date, 'YYYY-MM-DD') AS purchase_date`,
        [userId, resolvedAccountId, normalizedTicker, numShares, numBuyPrice, lotDate, currency]
      );

      let transactionId: string | null = null;
      let brokerRemainingBalance: number | null = null;

      if (deductFromAccount) {
        const brokerUpdate = await client.query<{ current_balance: string }>(
          `UPDATE accounts
           SET current_balance = current_balance - $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2::uuid AND user_id = $3
           RETURNING current_balance`,
          [totalCost, resolvedAccountId, userId]
        );
        brokerRemainingBalance = Number(brokerUpdate.rows[0]?.current_balance || 0);

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
            resolvedAccountId,
            lotDate,
            totalCost,
            currency,
            normalizedTicker,
            `Compra de ${numShares} ${normalizedTicker} @ ${numBuyPrice} ${currency}`,
          ]
        );
        transactionId = txInsert.rows[0].id;
      }

      return {
        holdingId: holdingInsert.rows[0].id,
        transactionId,
        ticker: normalizedTicker,
        securityName,
        shares: Number(holdingInsert.rows[0].shares),
        buyPrice: Number(holdingInsert.rows[0].average_buy_price),
        currentMarketPrice: marketPrice,
        purchaseDate: holdingInsert.rows[0].purchase_date,
        totalInvestedOrder: totalCost,
        brokerRemainingBalance,
      };
    });

    return res.status(201).json({
      success: true,
      ...result,
      message: 'Lote de compra de acción registrado correctamente.',
    });
  } catch (error) {
    console.error('Error al registrar compra de inversión:', error);
    return res.status(500).json({ error: 'Error interno al procesar la compra de inversión.' });
  }
}

/**
 * PUT /api/investments/:holdingId
 * Edita un lote individual de compra de acciones en `portfolio_holdings`.
 */
export async function updateInvestmentLot(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || req.params.userId || req.body?.userId;
    const holdingId = String(req.params.holdingId || '').trim();
    const {
      brokerAccountId,
      ticker,
      name,
      assetClass,
      shares,
      buyPrice,
      currentPrice,
      currency = 'USD',
      date,
      purchaseDate,
    } = req.body;

    const normalizedTicker = typeof ticker === 'string' ? ticker.trim().toUpperCase() : '';
    const numShares = Number(shares);
    const numBuyPrice = Number(buyPrice);
    const manualCurrentPrice =
      currentPrice !== undefined && currentPrice !== null && currentPrice !== ''
        ? Number(currentPrice)
        : null;
    const lotDate = purchaseDate || date || new Date().toISOString().slice(0, 10);

    if (
      !userId ||
      !UUID_REGEX.test(holdingId) ||
      !normalizedTicker ||
      !Number.isFinite(numShares) ||
      numShares <= 0 ||
      !Number.isFinite(numBuyPrice) ||
      numBuyPrice <= 0 ||
      !VALID_CURRENCIES.has(currency)
    ) {
      return res.status(400).json({
        error: 'Datos inválidos para actualizar el lote de inversión.',
      });
    }

    const quote = await fetchYahooMarketQuote(normalizedTicker);
    const hasManualPrice =
      manualCurrentPrice !== null && Number.isFinite(manualCurrentPrice) && manualCurrentPrice > 0;
    const marketPrice = hasManualPrice ? manualCurrentPrice : quote.price ?? numBuyPrice;
    const securityName =
      (typeof name === 'string' && name.trim()) || quote.name || normalizedTicker;
    const securityAssetClass = (typeof assetClass === 'string' && assetClass.trim()) || 'Equity';

    const updated = await withTransaction(async (client) => {
      const existing = await client.query<{ id: string; account_id: string }>(
        `SELECT id, account_id FROM portfolio_holdings WHERE id = $1::uuid AND user_id = $2 FOR UPDATE`,
        [holdingId, userId]
      );

      if (existing.rowCount === 0) {
        return null;
      }

      const targetAccountId =
        brokerAccountId && UUID_REGEX.test(String(brokerAccountId))
          ? String(brokerAccountId)
          : existing.rows[0].account_id;

      await client.query(
        `INSERT INTO securities (ticker, name, asset_class, currency, current_price, last_price_update)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (ticker) DO UPDATE
         SET current_price = CASE
               WHEN $6::boolean THEN EXCLUDED.current_price
               ELSE securities.current_price
             END,
             name = CASE
               WHEN $7::text <> '' THEN $7::text
               ELSE securities.name
             END,
             last_price_update = CASE
               WHEN $6::boolean THEN CURRENT_TIMESTAMP
               ELSE securities.last_price_update
             END`,
        [
          normalizedTicker,
          securityName,
          securityAssetClass,
          currency,
          marketPrice,
          hasManualPrice || quote.price !== null,
          typeof name === 'string' ? name.trim() : '',
        ]
      );

      const resUpdate = await client.query<{
        id: string;
        ticker: string;
        shares: string;
        average_buy_price: string;
        purchase_date: string;
      }>(
        `UPDATE portfolio_holdings
         SET account_id = $1::uuid,
             ticker = $2,
             shares = $3,
             average_buy_price = $4,
             purchase_date = $5::date,
             currency = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7::uuid AND user_id = $8
         RETURNING id, ticker, shares, average_buy_price, TO_CHAR(purchase_date, 'YYYY-MM-DD') AS purchase_date`,
        [
          targetAccountId,
          normalizedTicker,
          numShares,
          numBuyPrice,
          lotDate,
          currency,
          holdingId,
          userId,
        ]
      );

      return resUpdate.rows[0];
    });

    if (!updated) {
      return res.status(404).json({ error: 'El lote de inversión no existe.' });
    }

    return res.status(200).json({
      success: true,
      holding: updated,
      message: 'Lote de inversión actualizado correctamente.',
    });
  } catch (error) {
    console.error('Error al actualizar lote de inversión:', error);
    return res.status(500).json({ error: 'Error interno al actualizar el lote de inversión.' });
  }
}

/**
 * POST /api/investments/:holdingId/sell
 * Registra la venta total o parcial de un lote de acciones en `portfolio_holdings`
 * y acredita el monto neto recibido (descontando fees del broker) en la cuenta de
 * disponible de stocks (`Broker Inversiones`) o en la cuenta USD seleccionada.
 */
export async function sellInvestmentLot(req: Request, res: Response) {
  try {
    const userId = req.user?.uid || req.params.userId || req.body?.userId;
    const holdingId = String(req.params.holdingId || '').trim();
    const {
      sharesToSell,
      sellPrice,
      brokerFee = 0,
      netProceeds,
      saleDate,
      destinationAccountId,
      creditToAccount = true,
    } = req.body;

    const numSharesToSell = Number(sharesToSell);
    const numSellPrice = Number(sellPrice);
    const numFee = Math.max(0, Number(brokerFee || 0));
    const effectiveDate = saleDate || new Date().toISOString().slice(0, 10);

    if (
      !userId ||
      !UUID_REGEX.test(holdingId) ||
      !Number.isFinite(numSharesToSell) ||
      numSharesToSell <= 0 ||
      !Number.isFinite(numSellPrice) ||
      numSellPrice <= 0
    ) {
      return res.status(400).json({
        error:
          'Datos inválidos para la venta. Indica una cantidad de acciones (> 0) y un precio de venta (> 0).',
      });
    }

    const grossProceeds = numSharesToSell * numSellPrice;
    const calculatedNet = Math.max(0, grossProceeds - numFee);
    const finalNetProceeds =
      netProceeds !== undefined && netProceeds !== null && netProceeds !== '' && Number(netProceeds) > 0
        ? Number(Number(netProceeds).toFixed(2))
        : Number(calculatedNet.toFixed(2));

    if (finalNetProceeds <= 0) {
      return res.status(400).json({
        error: 'El monto neto a recibir por la venta debe ser mayor a 0.',
      });
    }

    const saleResult = await withTransaction(async (client) => {
      const existingRes = await client.query<{
        id: string;
        account_id: string;
        ticker: string;
        shares: string;
        average_buy_price: string;
        purchase_date: string | Date | null;
        currency: string;
      }>(
        `SELECT id, account_id, ticker, shares, average_buy_price, purchase_date, currency
         FROM portfolio_holdings
         WHERE id = $1::uuid AND user_id = $2
         FOR UPDATE`,
        [holdingId, userId]
      );

      if (existingRes.rowCount === 0) {
        return { notFound: true as const };
      }

      const lot = existingRes.rows[0];
      const currentShares = Number(lot.shares || 0);

      if (numSharesToSell > currentShares + 0.000001) {
        return {
          exceedsShares: true as const,
          availableShares: currentShares,
        };
      }

      const remainingShares = Number((currentShares - numSharesToSell).toFixed(8));
      const isFullSale = remainingShares <= 0.0000005;

      // Actualizar precio actual de la acción al precio de venta ejecutado
      await client.query(
        `UPDATE securities
         SET current_price = $1,
             last_price_update = CURRENT_TIMESTAMP
         WHERE ticker = $2`,
        [numSellPrice, lot.ticker]
      );

      if (isFullSale) {
        await client.query(
          `DELETE FROM portfolio_holdings WHERE id = $1::uuid AND user_id = $2`,
          [holdingId, userId]
        );
      } else {
        await client.query(
          `UPDATE portfolio_holdings
           SET shares = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2::uuid AND user_id = $3`,
          [remainingShares, holdingId, userId]
        );
      }

      let targetAccountId = lot.account_id;
      if (destinationAccountId && UUID_REGEX.test(String(destinationAccountId))) {
        const destCheck = await client.query<{ id: string }>(
          `SELECT id FROM accounts WHERE id = $1::uuid AND user_id = $2 LIMIT 1`,
          [destinationAccountId, userId]
        );
        if (destCheck.rows[0]?.id) {
          targetAccountId = destCheck.rows[0].id;
        }
      }

      let creditedAccountBalance: number | null = null;
      let transactionId: string | null = null;

      if (creditToAccount) {
        const accUpdate = await client.query<{ current_balance: string; name: string }>(
          `UPDATE accounts
           SET current_balance = current_balance + $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2::uuid AND user_id = $3
           RETURNING current_balance, name`,
          [finalNetProceeds, targetAccountId, userId]
        );
        creditedAccountBalance = Number(accUpdate.rows[0]?.current_balance || 0);

        const lotBuyPrice = Number(lot.average_buy_price || 0);
        const lotBuyDate = lot.purchase_date
          ? new Date(lot.purchase_date).toISOString().slice(0, 10)
          : effectiveDate;
        const costBasisSold = Number((numSharesToSell * lotBuyPrice).toFixed(2));
        const realizedPnl = Number((finalNetProceeds - costBasisSold).toFixed(2));
        const feeText = numFee > 0 ? ` · Fee: $${numFee.toFixed(2)}` : '';
        const pnlText = `${realizedPnl >= 0 ? '+' : ''}$${realizedPnl.toFixed(2)}`;

        const catRes = await client.query<{ id: string }>(
          `SELECT id
           FROM categories
           WHERE (is_global = TRUE OR user_id = $1)
             AND type = 'TRANSFERENCIA'
             AND category_name = 'Transferencia'
             AND sub_category_name = 'Venta de Acción / ETF'
           ORDER BY is_global DESC
           LIMIT 1`,
          [userId]
        );
        const categoryId = catRes.rows[0]?.id || null;

        const txInsert = await client.query<{ id: string }>(
          `INSERT INTO transactions (
            user_id,
            account_id,
            destination_account_id,
            category_id,
            date,
            amount,
            destination_amount,
            currency,
            category_type,
            category_name,
            sub_category_name,
            description,
            is_recurring
          )
          VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::date, $6, $6, $7, 'TRANSFERENCIA', 'Transferencia', 'Venta de Acción / ETF', $8, FALSE)
          RETURNING id`,
          [
            userId,
            lot.account_id,
            targetAccountId,
            categoryId,
            effectiveDate,
            finalNetProceeds,
            lot.currency || 'USD',
            `Venta ${isFullSale ? 'total' : 'parcial'} de ${numSharesToSell} ${lot.ticker} @ $${numSellPrice} (Compra: ${lotBuyDate} @ $${lotBuyPrice.toFixed(4)} · Neto: $${finalNetProceeds.toFixed(2)}${feeText} · PnL: ${pnlText})`,
          ]
        );
        transactionId = txInsert.rows[0]?.id || null;
      }

      return {
        notFound: false as const,
        exceedsShares: false as const,
        ticker: lot.ticker,
        soldShares: numSharesToSell,
        remainingShares: isFullSale ? 0 : remainingShares,
        isFullSale,
        netProceeds: finalNetProceeds,
        targetAccountId,
        creditedAccountBalance,
        transactionId,
      };
    });

    if (saleResult.notFound) {
      return res.status(404).json({ error: 'El lote de inversión no existe.' });
    }
    if (saleResult.exceedsShares) {
      return res.status(400).json({
        error: `No puedes vender más acciones de las que tiene el lote (${saleResult.availableShares}).`,
      });
    }

    return res.status(200).json({
      success: true,
      ...saleResult,
      message: saleResult.isFullSale
        ? `Venta total de ${saleResult.ticker} registrada y saldo acreditado.`
        : `Venta parcial de ${saleResult.ticker} registrada (${saleResult.remainingShares} shares restantes).`,
    });
  } catch (error) {
    console.error('Error al vender lote de inversión:', error);
    return res.status(500).json({ error: 'Error interno al procesar la venta de la acción.' });
  }
}

/**
 * DELETE /api/investments/:holdingId
 * Elimina un lote individual de compra de acciones en `portfolio_holdings`.
 */
export async function deleteInvestmentLot(req: Request, res: Response) {
  try {
    const userId =
      req.user?.uid || req.params.userId || String(req.query.userId || req.body?.userId || '');
    const holdingId = String(req.params.holdingId || '').trim();

    if (!userId || !UUID_REGEX.test(holdingId)) {
      return res.status(400).json({ error: 'ID de lote inválido o usuario no autenticado.' });
    }

    const delRes = await query<{ id: string; ticker: string }>(
      `DELETE FROM portfolio_holdings
       WHERE id = $1::uuid AND user_id = $2
       RETURNING id, ticker`,
      [holdingId, userId]
    );

    if (delRes.rowCount === 0) {
      return res.status(404).json({ error: 'El lote de inversión no existe.' });
    }

    return res.status(200).json({
      success: true,
      deletedId: delRes.rows[0].id,
      ticker: delRes.rows[0].ticker,
      message: 'Lote de inversión eliminado correctamente.',
    });
  } catch (error) {
    console.error('Error al eliminar lote de inversión:', error);
    return res.status(500).json({ error: 'Error interno al eliminar el lote de inversión.' });
  }
}

/**
 * Estrategia Caché On-Demand para precios de mercado (> 30 minutos).
 * Revisa `securities.last_price_update` de los títulos del usuario y refresca los que tengan
 * más de 30 minutos de antigüedad consultando Yahoo Finance.
 */
async function fetchYahooFinancePrice(symbol: string): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) return null;

    const data: unknown = await res.json();
    const marketPrice = Number(
      (data as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } })
        ?.chart?.result?.[0]?.meta?.regularMarketPrice
    );

    return Number.isFinite(marketPrice) && marketPrice > 0 ? marketPrice : null;
  } catch (fetchErr) {
    console.warn(`No se pudo refrescar cotización en Yahoo Finance para ${symbol}:`, fetchErr);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Estrategia Caché On-Demand (> 30 minutos) consultando Yahoo Finance:
 * 1. Revisa `user_settings.updated_at` del usuario y actualiza `exchange_rate_cop_usd` usando el ticker `USDCOP=X`.
 * 2. Revisa `securities.last_price_update` de los títulos del usuario y refresca los que tengan > 30 min.
 */
export async function refreshStaleSecurityPrices(userId: string): Promise<void> {
  try {
    const [staleSecuritiesRes, trmStaleRes] = await Promise.all([
      query<{ ticker: string }>(
        `SELECT DISTINCT s.ticker
         FROM portfolio_holdings h
         JOIN securities s ON h.ticker = s.ticker
         WHERE h.user_id = $1
           AND (
             s.last_price_update IS NULL
             OR s.last_price_update < (CURRENT_TIMESTAMP - INTERVAL '30 minutes')
           )`,
        [userId]
      ),
      query<{ should_refresh: boolean }>(
        `SELECT
           CASE
             WHEN NOT EXISTS (SELECT 1 FROM user_settings WHERE user_id = $1) THEN TRUE
             ELSE COALESCE((
               SELECT
                 updated_at IS NULL
                 OR updated_at < (CURRENT_TIMESTAMP - INTERVAL '30 minutes')
                 OR ROUND(exchange_rate_cop_usd::numeric, 2) = 3266.78
               FROM user_settings
               WHERE user_id = $1
               LIMIT 1
             ), TRUE)
           END AS should_refresh`,
        [userId]
      ),
    ]);

    const tasks: Promise<unknown>[] = [];

    // 1. Refrescar TRM USD/COP desde Yahoo Finance (USDCOP=X) si tiene > 30 minutos
    const shouldRefreshTrm = trmStaleRes.rows[0]?.should_refresh === true;
    if (shouldRefreshTrm) {
      tasks.push(
        (async () => {
          const usdCopPrice = await fetchYahooFinancePrice('USDCOP=X');
          if (usdCopPrice !== null && usdCopPrice > 1000 && usdCopPrice < 10000) {
            await query(
              `INSERT INTO user_settings (user_id, main_currency, exchange_rate_cop_usd, ai_provider, updated_at)
               VALUES ($1, 'COP', $2, 'gemini', CURRENT_TIMESTAMP)
               ON CONFLICT (user_id) DO UPDATE SET
                 exchange_rate_cop_usd = EXCLUDED.exchange_rate_cop_usd,
                 updated_at = CURRENT_TIMESTAMP`,
              [userId, Number(usdCopPrice.toFixed(4))]
            );
          }
        })()
      );
    }

    await Promise.allSettled([
      ...tasks,
      ...staleSecuritiesRes.rows.map(async ({ ticker }) => {
        const quote = await fetchYahooMarketQuote(ticker);
        if (quote.price !== null && quote.price > 0) {
          await query(
            `UPDATE securities
             SET current_price = $1,
                 last_price_update = CURRENT_TIMESTAMP
             WHERE ticker = $2`,
            [quote.price, ticker]
          );
        }
      }),
    ]);
  } catch (error) {
    console.warn('Error al verificar caché de precios y TRM en Yahoo Finance:', error);
  }
}

