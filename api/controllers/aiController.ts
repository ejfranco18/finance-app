import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Request, Response } from 'express';
import { query } from '../lib/db';

export type AIProviderId = 'gemini' | 'openai' | 'anthropic' | 'openrouter';

interface ProviderConfig {
  id: AIProviderId;
  name: string;
  defaultModel: string;
  models: Array<{ id: string; label: string }>;
  keyPlaceholder: string;
  docsUrl: string;
}

export const SUPPORTED_AI_PROVIDERS: Record<AIProviderId, ProviderConfig> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    defaultModel: 'gemini-3-flash-preview',
    models: [
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Rápido ~3s / Recomendado)' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite (Ultra Rápido ~1.2s)' },
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Razonamiento Profundo)' },
      { id: 'gemini-pro-latest', label: 'Gemini Pro Latest (Análisis Avanzado)' },
    ],
    keyPlaceholder: 'AIzaSy...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini (Rápido y Económico)' },
      { id: 'gpt-4o', label: 'GPT-4o (Omnimodel)' },
      { id: 'o3-mini', label: 'o3-mini (Razonamiento Financiero)' },
    ],
    keyPlaceholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    defaultModel: 'claude-3-5-sonnet-latest',
    models: [
      { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet (Recomendado)' },
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku (Rápido)' },
    ],
    keyPlaceholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter (Multi-Modelo)',
    defaultModel: 'google/gemini-2.5-flash',
    models: [
      { id: 'google/gemini-2.5-flash', label: 'Google: Gemini Flash' },
      { id: 'anthropic/claude-3.5-sonnet', label: 'Anthropic: Claude 3.5 Sonnet' },
      { id: 'openai/gpt-4o-mini', label: 'OpenAI: GPT-4o Mini' },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3' },
    ],
    keyPlaceholder: 'sk-or-v1-...',
    docsUrl: 'https://openrouter.ai/keys',
  },
};

export const VALID_PROVIDERS = new Set<string>(Object.keys(SUPPORTED_AI_PROVIDERS));

let ephemeralSecretKey: Buffer | null = null;

/**
 * Obtiene la llave de cifrado de 32 bytes para AES-256-GCM sin usar secretos literales en código.
 */
function getEncryptionKey(): Buffer {
  const envSecret =
    process.env.AI_ENCRYPTION_SECRET?.trim() || process.env.DATABASE_URL?.trim();
  if (envSecret) {
    const salt = crypto.createHash('sha256').update(envSecret).digest().subarray(0, 16);
    return crypto.scryptSync(envSecret, salt, 32);
  }
  if (fs.existsSync('./ai_encryption_secret.txt')) {
    const fileSecret = fs.readFileSync('./ai_encryption_secret.txt', 'utf-8').trim();
    if (fileSecret) {
      const salt = crypto.createHash('sha256').update(fileSecret).digest().subarray(0, 16);
      return crypto.scryptSync(fileSecret, salt, 32);
    }
  }
  if (!ephemeralSecretKey) {
    console.warn('Generating ephemeral secret. Instance-isolated!');
    ephemeralSecretKey = crypto.randomBytes(32);
  }
  return ephemeralSecretKey;
}

/**
 * Cifra una API Key con AES-256-GCM autenticado antes de guardarla en PostgreSQL.
 */
export function encryptApiKey(plainKey: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainKey, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Descifra una API Key almacenada en `user_settings.ai_api_key_encrypted`.
 */
export function decryptApiKey(storedValue: string | null | undefined): string | null {
  if (!storedValue) return null;
  try {
    if (!storedValue.startsWith('v1:')) {
      return null;
    }
    const parts = storedValue.split(':');
    if (parts.length !== 4) return null;
    const iv = Buffer.from(parts[1], 'base64');
    const authTag = Buffer.from(parts[2], 'base64');
    const encrypted = Buffer.from(parts[3], 'base64');
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Enmascara la API Key para mostrarla de forma segura en la UI (`***-***-1234`).
 */
export function maskApiKey(rawKey: string | null): string | null {
  if (!rawKey || rawKey.length < 4) return null;
  return `***-***-${rawKey.slice(-4)}`;
}

let aiColumnsReady: Promise<void> | null = null;

export function ensureAiSettingsColumns(): Promise<void> {
  if (!aiColumnsReady) {
    aiColumnsReady = (async () => {
      await query(
        `ALTER TABLE user_settings
         ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(32) DEFAULT 'gemini',
         ADD COLUMN IF NOT EXISTS ai_model VARCHAR(64) DEFAULT NULL,
         ADD COLUMN IF NOT EXISTS ai_api_key_encrypted TEXT DEFAULT NULL,
         ADD COLUMN IF NOT EXISTS telegram_bot_token_encrypted TEXT DEFAULT NULL,
         ADD COLUMN IF NOT EXISTS telegram_bot_username VARCHAR(64) DEFAULT NULL,
         ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(64) DEFAULT NULL,
         ADD COLUMN IF NOT EXISTS telegram_webhook_secret VARCHAR(64) DEFAULT NULL,
         ADD COLUMN IF NOT EXISTS telegram_last_update_id BIGINT DEFAULT 0`
      );
    })().catch((err) => {
      aiColumnsReady = null;
      console.error('Error asegurando columnas de IA en user_settings:', err);
    });
  }
  return aiColumnsReady;
}

/**
 * GET /api/ai/settings
 * Devuelve el proveedor activo, modelo y estado de la API Key (enmascarada) del usuario autenticado.
 */
export async function getAiSettings(req: Request, res: Response) {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'No autorizado.' });
    }

    await ensureAiSettingsColumns();

    const result = await query<{
      ai_provider: string | null;
      ai_model: string | null;
      ai_api_key_encrypted: string | null;
      telegram_bot_token_encrypted: string | null;
      telegram_bot_username: string | null;
      telegram_chat_id: string | null;
      telegram_webhook_secret: string | null;
    }>(
      `SELECT
         ai_provider,
         ai_model,
         ai_api_key_encrypted,
         telegram_bot_token_encrypted,
         telegram_bot_username,
         telegram_chat_id,
         telegram_webhook_secret
       FROM user_settings
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    const row = result.rows[0];
    const provider: AIProviderId =
      row?.ai_provider && VALID_PROVIDERS.has(row.ai_provider)
        ? (row.ai_provider as AIProviderId)
        : 'gemini';
    const providerConfig = SUPPORTED_AI_PROVIDERS[provider];
    const rawSavedModel = row?.ai_model?.trim() || '';
    const model =
      provider === 'gemini' &&
      (rawSavedModel.startsWith('gemini-2.') || rawSavedModel.startsWith('gemini-1.'))
        ? providerConfig.defaultModel
        : rawSavedModel || providerConfig.defaultModel;
    const decryptedKey = decryptApiKey(row?.ai_api_key_encrypted);
    const decryptedTelegramToken = decryptApiKey(row?.telegram_bot_token_encrypted);

    // Si estamos en un dominio HTTPS público (Vercel) y ya hay un Bot configurado, asegurar el Webhook 24/7
    const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
    const protoHeader = String(req.headers['x-forwarded-proto'] || 'http').trim();
    const isLocalhost =
      hostHeader.startsWith('localhost') ||
      hostHeader.startsWith('127.0.0.1') ||
      hostHeader === '';

    if (decryptedTelegramToken && !isLocalhost && protoHeader === 'https') {
      const expectedWebhookUrl = `https://${hostHeader}/api/ai/telegram-webhook/${encodeURIComponent(
        userId
      )}`;
      let webhookSecret = row?.telegram_webhook_secret?.trim() || '';
      if (!webhookSecret) {
        webhookSecret = crypto.randomBytes(24).toString('hex');
        await query(
          `UPDATE user_settings
           SET telegram_webhook_secret = $1, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $2`,
          [webhookSecret, userId]
        );
      }
      void fetch(`https://api.telegram.org/bot${decryptedTelegramToken}/getWebhookInfo`)
        .then((r) => r.json() as Promise<{ result?: { url?: string } }>)
        .then((info) => {
          if (String(info?.result?.url || '').trim() !== expectedWebhookUrl) {
            return fetch(`https://api.telegram.org/bot${decryptedTelegramToken}/setWebhook`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: expectedWebhookUrl,
                secret_token: webhookSecret,
                allowed_updates: ['message', 'callback_query'],
              }),
            });
          }
          return null;
        })
        .catch(() => {});
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      provider,
      model,
      hasApiKey: Boolean(decryptedKey),
      maskedApiKey: maskApiKey(decryptedKey),
      providers: Object.values(SUPPORTED_AI_PROVIDERS),
      telegram: {
        hasBotToken: Boolean(decryptedTelegramToken),
        maskedBotToken: maskApiKey(decryptedTelegramToken),
        botUsername: row?.telegram_bot_username || null,
        chatId: row?.telegram_chat_id ? `***${String(row.telegram_chat_id).slice(-4)}` : null,
        isLinked: Boolean(row?.telegram_chat_id),
      },
    });
  } catch (error) {
    console.error('Error al consultar configuración de IA:', error);
    return res.status(500).json({ error: 'Error interno al consultar la configuración de IA.' });
  }
}

/**
 * PUT / POST /api/ai/settings
 * Guarda el proveedor de IA, el modelo y opcionalmente cifra y almacena la API Key del usuario.
 */
export async function updateAiSettings(req: Request, res: Response) {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'No autorizado.' });
    }

    await ensureAiSettingsColumns();

    const rawProvider = String(req.body?.provider || 'gemini')
      .trim()
      .toLowerCase();
    if (!VALID_PROVIDERS.has(rawProvider)) {
      return res.status(400).json({
        error: 'Proveedor de IA inválido. Usa gemini, openai, anthropic u openrouter.',
      });
    }

    const provider = rawProvider as AIProviderId;
    const providerConfig = SUPPORTED_AI_PROVIDERS[provider];
    const requestedModel = String(req.body?.model || '').trim();
    const model =
      requestedModel && requestedModel.length <= 64
        ? requestedModel
        : providerConfig.defaultModel;

    const clearApiKey = req.body?.clearApiKey === true;
    const rawApiKey =
      typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';

    if (rawApiKey && (rawApiKey.length < 10 || rawApiKey.length > 256)) {
      return res.status(400).json({
        error: 'La API Key ingresada no tiene una longitud válida (10 a 256 caracteres).',
      });
    }

    const shouldUpdateKey = clearApiKey || rawApiKey.length > 0;
    const encryptedKey = clearApiKey
      ? null
      : rawApiKey.length > 0
        ? encryptApiKey(rawApiKey)
        : null;

    const upsertRes = await query<{
      ai_provider: string;
      ai_model: string;
      ai_api_key_encrypted: string | null;
    }>(
      `INSERT INTO user_settings (
         user_id, main_currency, exchange_rate_cop_usd, ai_provider, ai_model, ai_api_key_encrypted, updated_at
       )
       VALUES ($1, 'COP', 3266.78, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         ai_provider = EXCLUDED.ai_provider,
         ai_model = EXCLUDED.ai_model,
         ai_api_key_encrypted = CASE
           WHEN $5::boolean THEN EXCLUDED.ai_api_key_encrypted
           ELSE user_settings.ai_api_key_encrypted
         END,
         updated_at = CURRENT_TIMESTAMP
       RETURNING ai_provider, ai_model, ai_api_key_encrypted`,
      [userId, provider, model, encryptedKey, shouldUpdateKey]
    );

    const saved = upsertRes.rows[0];
    const currentDecrypted = decryptApiKey(saved?.ai_api_key_encrypted);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      provider: saved.ai_provider,
      model: saved.ai_model || providerConfig.defaultModel,
      hasApiKey: Boolean(currentDecrypted),
      maskedApiKey: maskApiKey(currentDecrypted),
    });
  } catch (error) {
    console.error('Error al actualizar configuración de IA:', error);
    return res.status(500).json({ error: 'Error interno al guardar la configuración de IA.' });
  }
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface SuggestedTransactionDraft {
  tipo: 'gasto' | 'ingreso' | 'ahorro_inversion' | 'transferencia';
  monto: number;
  moneda: 'COP' | 'USD';
  cuentaOrigenId?: string;
  cuentaOrigenNombre?: string;
  categoriaMacroId: string;
  subcategoria: string;
  descripcion: string;
}

/**
 * Construye el contexto financiero completo y actualizado del usuario desde Neon PostgreSQL.
 */
export async function buildUserFinancialContext(userId: string): Promise<{
  systemInstruction: string;
  accounts: Array<{ id: string; name: string; type: string; currency: string }>;
}> {
  const consolidatedRes = await query<{
    settings: { main_currency?: string; exchange_rate_cop_usd?: string | number } | null;
    accounts: Array<{
      id: string;
      name: string;
      type: string;
      currency: string;
      initial_balance: string | number;
      current_balance: string | number;
      reconciled_balance: string | number | null;
      annual_interest_rate: string | number;
      accumulated_interest: string | number;
      last_interest_date: string | null;
    }>;
    net_worth: Record<string, unknown> | null;
    monthly_canvas: Array<Record<string, unknown>>;
    portfolio: Array<Record<string, unknown>>;
    assets: Array<Record<string, unknown>>;
    liabilities: Array<Record<string, unknown>>;
    category_summary: Array<Record<string, unknown>>;
    recent_transactions: Array<Record<string, unknown>>;
    categories_catalog: Array<Record<string, unknown>>;
  }>(
    `SELECT
       (SELECT row_to_json(s) FROM (
          SELECT main_currency, exchange_rate_cop_usd
          FROM user_settings
          WHERE user_id = $1
          LIMIT 1
        ) s) AS settings,
       COALESCE((SELECT json_agg(row_to_json(a)) FROM (
          SELECT
            id, name, type, currency,
            initial_balance, current_balance, reconciled_balance,
            annual_interest_rate, accumulated_interest,
            TO_CHAR(last_interest_date, 'YYYY-MM-DD') AS last_interest_date
          FROM accounts
          WHERE user_id = $1 AND is_active = TRUE
          ORDER BY created_at ASC
        ) a), '[]'::json) AS accounts,
       (SELECT row_to_json(nw) FROM (
          SELECT liquid_assets, fixed_assets, total_assets, total_liabilities, net_worth
          FROM v_net_worth
          WHERE user_id = $1
          LIMIT 1
        ) nw) AS net_worth,
       COALESCE((SELECT json_agg(row_to_json(mc)) FROM (
          SELECT
            month,
            fixed_income,
            variable_income,
            total_income,
            total_expenses,
            (total_income - total_expenses) AS net_cash_flow,
            total_savings,
            total_investments,
            total_debt_payments
          FROM v_monthly_canvas
          WHERE user_id = $1
          ORDER BY month DESC
        ) mc), '[]'::json) AS monthly_canvas,
       COALESCE((SELECT json_agg(row_to_json(ps)) FROM (
          SELECT
            account_name,
            ticker,
            security_name,
            shares,
            average_buy_price,
            current_price,
            total_cost_basis,
            current_market_value,
            unrealized_pnl,
            pnl_percentage,
            currency
          FROM v_portfolio_summary
          WHERE user_id = $1
          ORDER BY ticker ASC
        ) ps), '[]'::json) AS portfolio,
       COALESCE((SELECT json_agg(row_to_json(ast)) FROM (
          SELECT name, type, estimated_value, currency
          FROM assets
          WHERE user_id = $1
          ORDER BY created_at ASC
        ) ast), '[]'::json) AS assets,
       COALESCE((SELECT json_agg(row_to_json(lb)) FROM (
          SELECT name, type, original_amount, current_balance, interest_rate, currency
          FROM liabilities
          WHERE user_id = $1
          ORDER BY created_at ASC
        ) lb), '[]'::json) AS liabilities,
       COALESCE((SELECT json_agg(row_to_json(cs)) FROM (
          SELECT
            TO_CHAR(date, 'YYYY-MM') AS month,
            category_type,
            category_name,
            sub_category_name,
            ROUND(SUM(amount)::numeric, 2) AS total_amount,
            COUNT(*)::int AS tx_count
          FROM transactions
          WHERE user_id = $1
          GROUP BY 1, 2, 3, 4
          ORDER BY 1 DESC, total_amount DESC
        ) cs), '[]'::json) AS category_summary,
       COALESCE((SELECT json_agg(row_to_json(rt)) FROM (
          SELECT
            TO_CHAR(t.date, 'YYYY-MM-DD') AS date,
            t.description,
            t.amount,
            t.currency,
            t.category_type,
            t.category_name,
            t.sub_category_name,
            a.name AS account_name,
            da.name AS destination_account_name
          FROM transactions t
          LEFT JOIN accounts a ON a.id = t.account_id
          LEFT JOIN accounts da ON da.id = t.destination_account_id
          WHERE t.user_id = $1
          ORDER BY t.date DESC, t.created_at DESC
          LIMIT 120
        ) rt), '[]'::json) AS recent_transactions,
       COALESCE((SELECT json_agg(row_to_json(cat)) FROM (
          SELECT type, category_name, sub_category_name
          FROM categories
          WHERE user_id = $1 AND is_active = TRUE
          ORDER BY type, category_name, sub_category_name
        ) cat), '[]'::json) AS categories_catalog`,
    [userId]
  );

  const ctx = consolidatedRes.rows[0];
  const trm = Number(ctx?.settings?.exchange_rate_cop_usd || 3266.78);
  const todayBogota = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
  }).format(new Date());

  const systemInstruction = `Eres el Copiloto Financiero IA de la plataforma "Financial Management & Cash Flow", conectado en tiempo real a la base de datos Neon PostgreSQL del usuario.
Fecha actual (Colombia): ${todayBogota}.
TRM actual USD/COP: $${trm.toFixed(2)} COP.

REGLAS DE RESPUESTA:
1. Responde siempre en español, de forma clara, precisa, ejecutiva y basada ESTRICTAMENTE en los datos reales del usuario que se incluyen abajo.
2. Formatea las cifras en pesos colombianos como $X.XXX.XXX,XX COP y en dólares como US$X.XXX,XX.
3. Recuerda las reglas contables de la app:
   - Las cuentas Nu ('Nu', 'Nu Meridiano', 'Nu ahorros') capitalizan interés compuesto diario al 9.35% E.A. después de medianoche.
   - Una compra con Tarjeta de Crédito se registra como GASTO en la cuenta tipo 'Tarjeta de crédito' (dejando su saldo negativo como deuda). El pago de la tarjeta se registra como TRANSFERENCIA desde la cuenta bancaria hacia la tarjeta para no duplicar gastos.
4. Si el usuario te pide registrar, anotar o crear un movimiento/gasto/ingreso (ej. "Regístrame un gasto de 45 mil de almuerzo con Nu"), además de tu respuesta amable, incluye AL FINAL de tu mensaje un bloque JSON exactamente con la etiqueta \`\`\`transaction_draft ... \`\`\` mapeado a una de las cuentas y subcategorías oficiales del usuario:
\`\`\`transaction_draft
{
  "tipo": "gasto",
  "monto": 45000,
  "moneda": "COP",
  "cuentaOrigenNombre": "Nu",
  "categoriaMacroId": "Alimentación",
  "subcategoria": "Restaurante",
  "descripcion": "Almuerzo"
}
\`\`\`
(Solo incluye el bloque \`\`\`transaction_draft\`\`\` cuando el usuario explícitamente quiera registrar o preparar una transacción nueva).

=== CONTEXTO EN VIVO DE LA BASE DE DATOS (NEON POSTGRESQL) ===

1. PATRIMONIO NETO CONSOLIDADO (v_net_worth en COP):
${JSON.stringify(ctx?.net_worth || {})}

2. CUENTAS ACTIVAS (accounts):
${JSON.stringify(ctx?.accounts || [])}

3. FLUJO DE CAJA MENSUAL (v_monthly_canvas):
${JSON.stringify(ctx?.monthly_canvas || [])}

4. PORTAFOLIO DE INVERSIONES EN USD (v_portfolio_summary):
${JSON.stringify(ctx?.portfolio || [])}

5. ACTIVOS FIJOS (assets) Y PASIVOS/CRÉDITOS (liabilities):
Activos: ${JSON.stringify(ctx?.assets || [])}
Pasivos: ${JSON.stringify(ctx?.liabilities || [])}

6. CONSOLIDADO DE MOVIMIENTOS POR MES, CATEGORÍA Y SUBCATEGORÍA:
${JSON.stringify(ctx?.category_summary || [])}

7. ÚLTIMOS MOVIMIENTOS REGISTRADOS (hasta 120 transacciones recientes):
${JSON.stringify(ctx?.recent_transactions || [])}

8. CATÁLOGO OFICIAL DE CATEGORÍAS Y SUBCATEGORÍAS:
${JSON.stringify(ctx?.categories_catalog || [])}`;

  return {
    systemInstruction,
    accounts: (ctx?.accounts || []).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      type: String(r.type),
      currency: String(r.currency),
    })),
  };
}

/**
 * Adaptador agnóstico que invoca Gemini, OpenAI, Anthropic u OpenRouter con timeout, soporte multimodal (audio/imagen) y fallback automático.
 */
export async function callAgnosticLLM(params: {
  provider: AIProviderId;
  model: string;
  apiKey: string;
  systemInstruction: string;
  history: ChatTurn[];
  userMessage: string;
  media?: {
    mimeType: string;
    base64Data: string;
  };
}): Promise<string> {
  const { provider, model, apiKey, systemInstruction, history, userMessage, media } = params;

  if (provider === 'gemini') {
    const userParts: Array<Record<string, unknown>> = [{ text: userMessage }];
    if (media?.base64Data && media?.mimeType) {
      userParts.push({
        inlineData: {
          mimeType: media.mimeType,
          data: media.base64Data,
        },
      });
    }

    const contents = [
      ...history.map((turn) => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.content }],
      })),
      {
        role: 'user',
        parts: userParts,
      },
    ];

    const fallbackModels = Array.from(
      new Set([model, 'gemini-3-flash-preview', 'gemini-3.5-flash-lite'])
    );
    let lastErr: Error | null = null;

    for (const candidateModel of fallbackModels) {
      const attemptCtrl = new AbortController();
      const attemptTimeout = setTimeout(() => attemptCtrl.abort(), 16000);
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          candidateModel
        )}:generateContent`;

        const res = await fetch(url, {
          method: 'POST',
          signal: attemptCtrl.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            contents,
            generationConfig: {
              temperature: 0.25,
              maxOutputTokens: 2048,
            },
          }),
        });

        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          error?: { message?: string };
        };

        if (!res.ok) {
          const msg =
            data?.error?.message || `Error del proveedor Gemini (HTTP ${res.status}).`;
          if (res.status === 429 || res.status === 503 || res.status === 404) {
            lastErr = new Error(msg);
            continue;
          }
          throw new Error(msg);
        }

        const reply =
          data.candidates?.[0]?.content?.parts
            ?.map((p) => p.text || '')
            .join('\n')
            .trim() || '';
        if (reply) {
          return reply;
        }
        lastErr = new Error('El modelo Gemini devolvió una respuesta vacía.');
      } catch (err) {
        const isAbort =
          err instanceof Error &&
          (err.name === 'AbortError' || err.message.includes('aborted'));
        lastErr = isAbort
          ? new Error(
              `El modelo ${candidateModel} tardó demasiado por alta demanda en Google AI.`
            )
          : err instanceof Error
            ? err
            : new Error('Error al conectar con Gemini.');
        continue;
      } finally {
        clearTimeout(attemptTimeout);
      }
    }

    throw lastErr || new Error('No se pudo obtener respuesta de Gemini en este momento.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);

  try {

    if (provider === 'openai' || provider === 'openrouter') {
      const endpoint =
        provider === 'openrouter'
          ? 'https://openrouter.ai/api/v1/chat/completions'
          : 'https://api.openai.com/v1/chat/completions';

      const messages = [
        { role: 'system', content: systemInstruction },
        ...history.map((turn) => ({
          role: turn.role,
          content: turn.content,
        })),
        { role: 'user', content: userMessage },
      ];

      const res = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.25,
          max_tokens: 2048,
        }),
      });

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };

      if (!res.ok) {
        throw new Error(
          data?.error?.message || `Error del proveedor ${provider} (HTTP ${res.status}).`
        );
      }

      const reply = data.choices?.[0]?.message?.content?.trim() || '';
      if (!reply) {
        throw new Error(`El modelo ${model} devolvió una respuesta vacía.`);
      }
      return reply;
    }

    if (provider === 'anthropic') {
      const messages = [
        ...history.map((turn) => ({
          role: turn.role,
          content: turn.content,
        })),
        { role: 'user', content: userMessage },
      ];

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: systemInstruction,
          messages,
          temperature: 0.25,
        }),
      });

      const data = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
        error?: { message?: string };
      };

      if (!res.ok) {
        throw new Error(
          data?.error?.message || `Error del proveedor Anthropic (HTTP ${res.status}).`
        );
      }

      const reply =
        data.content
          ?.filter((b) => b.type === 'text')
          .map((b) => b.text || '')
          .join('\n')
          .trim() || '';
      if (!reply) {
        throw new Error('El modelo Claude devolvió una respuesta vacía.');
      }
      return reply;
    }

    throw new Error('Proveedor de IA no soportado.');
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extrae un bloque opcional ```transaction_draft ... ``` de la respuesta del modelo.
 */
export function extractTransactionDraft(
  rawReply: string,
  accounts: Array<{ id: string; name: string }>
): { cleanReply: string; transactionDraft: SuggestedTransactionDraft | null } {
  const regex = /```transaction_draft\s*([\s\S]*?)```/i;
  const match = rawReply.match(regex);
  if (!match) {
    return { cleanReply: rawReply, transactionDraft: null };
  }

  const cleanReply = rawReply.replace(regex, '').trim();
  try {
    const parsed = JSON.parse(match[1].trim()) as Partial<SuggestedTransactionDraft>;
    const monto = Number(parsed.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return { cleanReply, transactionDraft: null };
    }

    const matchedAccount = parsed.cuentaOrigenNombre
      ? accounts.find(
          (a) => a.name.toLowerCase() === String(parsed.cuentaOrigenNombre).trim().toLowerCase()
        )
      : undefined;

    return {
      cleanReply,
      transactionDraft: {
        tipo:
          parsed.tipo === 'ingreso' ||
          parsed.tipo === 'ahorro_inversion' ||
          parsed.tipo === 'transferencia'
            ? parsed.tipo
            : 'gasto',
        monto,
        moneda: parsed.moneda === 'USD' ? 'USD' : 'COP',
        cuentaOrigenId: matchedAccount?.id,
        cuentaOrigenNombre: matchedAccount?.name || parsed.cuentaOrigenNombre,
        categoriaMacroId: String(parsed.categoriaMacroId || 'Alimentación'),
        subcategoria: String(parsed.subcategoria || 'Restaurante'),
        descripcion: String(parsed.descripcion || ''),
      },
    };
  } catch {
    return { cleanReply, transactionDraft: null };
  }
}

/**
 * POST /api/ai/chat
 * Procesa una consulta del usuario con contexto completo de Neon PostgreSQL usando el proveedor
 * y la API Key configurada por el usuario.
 */
export async function chatWithFinancialAi(req: Request, res: Response) {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'No autorizado.' });
    }

    const message = String(req.body?.message || '').trim();
    if (!message || message.length > 2500) {
      return res.status(400).json({
        error: 'Escribe una consulta válida (máximo 2,500 caracteres).',
      });
    }

    const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
    const history: ChatTurn[] = rawHistory
      .slice(-10)
      .filter(
        (item: unknown): item is ChatTurn =>
          Boolean(item) &&
          typeof item === 'object' &&
          ((item as ChatTurn).role === 'user' || (item as ChatTurn).role === 'assistant') &&
          typeof (item as ChatTurn).content === 'string'
      )
      .map((item: ChatTurn) => ({
        role: item.role,
        content: item.content.slice(0, 3000),
      }));

    await ensureAiSettingsColumns();

    const settingsRes = await query<{
      ai_provider: string | null;
      ai_model: string | null;
      ai_api_key_encrypted: string | null;
    }>(
      `SELECT ai_provider, ai_model, ai_api_key_encrypted
       FROM user_settings
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    const row = settingsRes.rows[0];
    const provider: AIProviderId =
      row?.ai_provider && VALID_PROVIDERS.has(row.ai_provider)
        ? (row.ai_provider as AIProviderId)
        : 'gemini';
    const providerConfig = SUPPORTED_AI_PROVIDERS[provider];
    const rawSavedModel = row?.ai_model?.trim() || '';
    const model =
      provider === 'gemini' &&
      (rawSavedModel.startsWith('gemini-2.') || rawSavedModel.startsWith('gemini-1.'))
        ? providerConfig.defaultModel
        : rawSavedModel || providerConfig.defaultModel;
    const apiKey = decryptApiKey(row?.ai_api_key_encrypted);

    if (!apiKey) {
      return res.status(400).json({
        code: 'MISSING_API_KEY',
        error: `Aún no has configurado tu API Key para ${providerConfig.name}. Haz clic en la pestaña "Configurar Modelo / API Key" para guardarla.`,
      });
    }

    const { systemInstruction, accounts } = await buildUserFinancialContext(userId);

    const rawReply = await callAgnosticLLM({
      provider,
      model,
      apiKey,
      systemInstruction,
      history,
      userMessage: message,
    });

    const { cleanReply, transactionDraft } = extractTransactionDraft(rawReply, accounts);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      reply: cleanReply,
      provider,
      model,
      transactionDraft,
    });
  } catch (error) {
    console.error('Error en consulta al Copiloto Financiero IA:', error);
    const safeMessage =
      error instanceof Error
        ? error.message
        : 'No se pudo completar la consulta con el proveedor de IA.';
    return res.status(500).json({ error: safeMessage });
  }
}
