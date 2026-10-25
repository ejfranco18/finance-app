import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { query, withTransaction } from '../lib/db';
import {
  SUPPORTED_AI_PROVIDERS,
  VALID_PROVIDERS,
  type AIProviderId,
  type SuggestedTransactionDraft,
  encryptApiKey,
  decryptApiKey,
  maskApiKey,
  ensureAiSettingsColumns,
  buildUserFinancialContext,
  callAgnosticLLM,
  extractTransactionDraft,
} from './aiController';

const TELEGRAM_TOKEN_REGEX = /^\d{5,16}:[A-Za-z0-9_-]{25,64}$/;
const MAX_MEDIA_BYTES = 8 * 1024 * 1024; // 8 MB límite de seguridad para notas de voz y fotos

interface TelegramUserSettingsRow {
  user_id: string;
  ai_provider: string | null;
  ai_model: string | null;
  ai_api_key_encrypted: string | null;
  telegram_bot_token_encrypted: string | null;
  telegram_bot_username: string | null;
  telegram_chat_id: string | null;
  telegram_webhook_secret: string | null;
  telegram_last_update_id: string | number | null;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: {
      id: number | string;
      first_name?: string;
      username?: string;
    };
    text?: string;
    caption?: string;
    voice?: {
      file_id: string;
      mime_type?: string;
      file_size?: number;
      duration?: number;
    };
    audio?: {
      file_id: string;
      mime_type?: string;
      file_size?: number;
    };
    photo?: Array<{
      file_id: string;
      file_size?: number;
      width?: number;
      height?: number;
    }>;
  };
  callback_query?: {
    id: string;
    from: {
      id: number | string;
    };
    message?: {
      message_id: number;
      chat: {
        id: number | string;
      };
      text?: string;
    };
    data?: string;
  };
}

/**
 * Envía un mensaje de texto al chat de Telegram del usuario.
 */
async function sendTelegramMessage(params: {
  botToken: string;
  chatId: string | number;
  text: string;
  replyMarkup?: Record<string, unknown>;
}): Promise<void> {
  const { botToken, chatId, text, replyMarkup } = params;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4000),
      reply_markup: replyMarkup,
    }),
  });
}

/**
 * Descarga un archivo (nota de voz .ogg o foto de recibo) desde los servidores de Telegram en memoria.
 */
async function downloadTelegramMedia(
  botToken: string,
  fileId: string,
  defaultMimeType: string
): Promise<{ mimeType: string; base64Data: string }> {
  const fileInfoRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const fileInfoData = (await fileInfoRes.json()) as {
    ok?: boolean;
    result?: { file_path?: string; file_size?: number };
  };

  if (!fileInfoRes.ok || !fileInfoData.ok || !fileInfoData.result?.file_path) {
    throw new Error('No se pudo obtener la ruta del archivo multimedia en Telegram.');
  }

  const fileSize = Number(fileInfoData.result.file_size || 0);
  if (fileSize > MAX_MEDIA_BYTES) {
    throw new Error('El archivo adjunto supera el límite permitido de 8 MB.');
  }

  const filePath = fileInfoData.result.file_path;
  const downloadRes = await fetch(
    `https://api.telegram.org/file/bot${botToken}/${filePath}`
  );
  if (!downloadRes.ok) {
    throw new Error('No se pudo descargar el archivo multimedia desde Telegram.');
  }

  const arrayBuffer = await downloadRes.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_MEDIA_BYTES) {
    throw new Error('El archivo descargado supera el límite permitido de 8 MB.');
  }

  let mimeType = defaultMimeType;
  if (filePath.endsWith('.ogg') || filePath.endsWith('.oga')) {
    mimeType = 'audio/ogg';
  } else if (filePath.endsWith('.mp3')) {
    mimeType = 'audio/mpeg';
  } else if (filePath.endsWith('.png')) {
    mimeType = 'image/png';
  } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
    mimeType = 'image/jpeg';
  }

  return {
    mimeType,
    base64Data: Buffer.from(arrayBuffer).toString('base64'),
  };
}

/**
 * Inserta automáticamente una transacción detectada por IA en Neon PostgreSQL y actualiza el saldo de la cuenta.
 */
async function executeAutoTransactionFromDraft(
  userId: string,
  draft: SuggestedTransactionDraft
): Promise<{
  transactionId: string;
  accountName: string;
  newBalance: number;
  currency: string;
  categoryType: string;
}> {
  const dbCategoryType =
    draft.tipo === 'ingreso'
      ? draft.categoriaMacroId.toLowerCase().includes('fijo')
        ? 'INGRESO_FIJO'
        : 'INGRESO_VARIABLE'
      : draft.tipo === 'ahorro_inversion'
        ? draft.categoriaMacroId.toLowerCase().includes('invers')
          ? 'INVERSION'
          : 'AHORRO'
        : draft.tipo === 'transferencia'
          ? 'TRANSFERENCIA'
          : 'GASTO';

  const todayBogota = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
  }).format(new Date());

  return withTransaction(async (client) => {
    // 1. Resolver la cuenta del usuario (por ID, por nombre sugerido o primera cuenta en esa moneda)
    let accountRow: { id: string; name: string; currency: string } | undefined;

    if (draft.cuentaOrigenId) {
      const byId = await client.query<{ id: string; name: string; currency: string }>(
        `SELECT id, name, currency FROM accounts WHERE id = $1::uuid AND user_id = $2 LIMIT 1`,
        [draft.cuentaOrigenId, userId]
      );
      accountRow = byId.rows[0];
    }

    if (!accountRow && draft.cuentaOrigenNombre) {
      const byName = await client.query<{ id: string; name: string; currency: string }>(
        `SELECT id, name, currency
         FROM accounts
         WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND is_active = TRUE
         LIMIT 1`,
        [userId, draft.cuentaOrigenNombre.trim()]
      );
      accountRow = byName.rows[0];
    }

    if (!accountRow) {
      const fallbackAcc = await client.query<{ id: string; name: string; currency: string }>(
        `SELECT id, name, currency
         FROM accounts
         WHERE user_id = $1 AND is_active = TRUE
         ORDER BY CASE WHEN LOWER(name) = 'nu' THEN 0 ELSE 1 END, created_at ASC
         LIMIT 1`,
        [userId]
      );
      accountRow = fallbackAcc.rows[0];
    }

    if (!accountRow) {
      throw new Error('No se encontró ninguna cuenta activa para registrar el movimiento.');
    }

    // 2. Asegurar la categoría en la tabla categories
    const catRes = await client.query<{ id: string }>(
      `INSERT INTO categories (user_id, type, category_name, sub_category_name, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (user_id, type, category_name, sub_category_name)
       DO UPDATE SET is_active = TRUE
       RETURNING id`,
      [userId, dbCategoryType, draft.categoriaMacroId, draft.subcategoria]
    );
    const categoryId = catRes.rows[0]?.id || null;

    // 3. Insertar en transactions
    const insertTx = await client.query<{ id: string }>(
      `INSERT INTO transactions (
         user_id, account_id, category_id, date, amount, currency,
         category_type, category_name, sub_category_name, description, is_recurring
       )
       VALUES ($1, $2::uuid, $3::uuid, $4::date, $5, $6, $7, $8, $9, $10, FALSE)
       RETURNING id`,
      [
        userId,
        accountRow.id,
        categoryId,
        todayBogota,
        draft.monto,
        accountRow.currency,
        dbCategoryType,
        draft.categoriaMacroId,
        draft.subcategoria,
        draft.descripcion || draft.subcategoria,
      ]
    );

    const transactionId = insertTx.rows[0].id;

    // 4. Actualizar current_balance de la cuenta
    const isInflow =
      dbCategoryType === 'INGRESO_FIJO' || dbCategoryType === 'INGRESO_VARIABLE';
    const delta = isInflow ? draft.monto : -draft.monto;

    const updateAcc = await client.query<{ current_balance: string }>(
      `UPDATE accounts
       SET current_balance = current_balance + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2::uuid AND user_id = $3
       RETURNING current_balance`,
      [delta, accountRow.id, userId]
    );

    return {
      transactionId,
      accountName: accountRow.name,
      newBalance: Number(updateAcc.rows[0]?.current_balance || 0),
      currency: accountRow.currency,
      categoryType: dbCategoryType,
    };
  });
}

/**
 * Revierte y elimina una transacción en Neon DB cuando el usuario pulsa "🗑️ Deshacer" en Telegram.
 */
async function undoTransactionFromTelegram(
  userId: string,
  transactionId: string
): Promise<{
  deletedDescription: string;
  amount: number;
  accountName: string;
  restoredBalance: number;
  currency: string;
}> {
  return withTransaction(async (client) => {
    const txRes = await client.query<{
      id: string;
      account_id: string;
      amount: string;
      currency: string;
      category_type: string;
      description: string | null;
      sub_category_name: string | null;
    }>(
      `SELECT id, account_id, amount, currency, category_type, description, sub_category_name
       FROM transactions
       WHERE id = $1::uuid AND user_id = $2
       LIMIT 1`,
      [transactionId, userId]
    );

    const tx = txRes.rows[0];
    if (!tx) {
      throw new Error('Este movimiento ya fue eliminado o no existe.');
    }

    const amount = Number(tx.amount);
    const wasInflow =
      tx.category_type === 'INGRESO_FIJO' || tx.category_type === 'INGRESO_VARIABLE';
    const reverseDelta = wasInflow ? -amount : amount;

    const accRes = await client.query<{ name: string; current_balance: string }>(
      `UPDATE accounts
       SET current_balance = current_balance + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2::uuid AND user_id = $3
       RETURNING name, current_balance`,
      [reverseDelta, tx.account_id, userId]
    );

    await client.query(`DELETE FROM transactions WHERE id = $1::uuid AND user_id = $2`, [
      transactionId,
      userId,
    ]);

    return {
      deletedDescription: tx.description || tx.sub_category_name || 'Movimiento',
      amount,
      accountName: accRes.rows[0]?.name || 'Cuenta',
      restoredBalance: Number(accRes.rows[0]?.current_balance || 0),
      currency: tx.currency,
    };
  });
}

// Candados en memoria para evitar ejecuciones simultáneas de sync/webhook por usuario
const activeSyncLocksByUser = new Set<string>();
const claimedUpdateKeys = new Set<string>();

/**
 * Reclama atómicamente un `update_id` de Telegram en memoria y en PostgreSQL ANTES de llamar al modelo de IA.
 * Devuelve `true` solo para la primera petición que reclama ese `update_id` y `false` si otra petición paralela ya lo tomó.
 */
async function claimTelegramUpdateAtomically(userId: string, updateId: number): Promise<boolean> {
  const memKey = `${userId}:${updateId}`;
  if (claimedUpdateKeys.has(memKey)) {
    console.log(
      `[TelegramBot] ⏭️ Update #${updateId} ya está en curso en memoria para user=${userId}, omitiendo duplicado.`
    );
    return false;
  }
  claimedUpdateKeys.add(memKey);

  // Limpieza preventiva del Set en memoria si crece demasiado
  if (claimedUpdateKeys.size > 1000) {
    const oldest = claimedUpdateKeys.values().next().value;
    if (oldest) claimedUpdateKeys.delete(oldest);
  }

  const claimRes = await query<{ telegram_last_update_id: string }>(
    `UPDATE user_settings
     SET telegram_last_update_id = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $2
       AND COALESCE(telegram_last_update_id, 0) < $1
     RETURNING telegram_last_update_id`,
    [updateId, userId]
  );

  if ((claimRes.rowCount || 0) === 0) {
    console.log(
      `[TelegramBot] ⏭️ Update #${updateId} ya había sido procesado en BD (telegram_last_update_id >= ${updateId}), omitiendo duplicado.`
    );
    return false;
  }

  return true;
}

/**
 * Procesa un Update de Telegram (nota de voz, foto, texto o botón de deshacer) para un usuario.
 */
async function processTelegramUpdateForUser(
  userRow: TelegramUserSettingsRow,
  update: TelegramUpdate
): Promise<void> {
  const userId = userRow.user_id;
  const botToken = decryptApiKey(userRow.telegram_bot_token_encrypted);
  const aiApiKey = decryptApiKey(userRow.ai_api_key_encrypted);

  if (!botToken) return;

  // 1. Manejar botón interactivo "🗑️ Deshacer registro" (callback_query)
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message?.chat?.id;
    if (!chatId) return;

    if (userRow.telegram_chat_id && String(chatId) !== String(userRow.telegram_chat_id)) {
      return;
    }

    if (cb.data?.startsWith('undo_tx:')) {
      const txId = cb.data.slice('undo_tx:'.length).trim();
      console.log(`[TelegramBot] 🗑️ Solicitud de deshacer transacción txId=${txId} (update #${update.update_id})`);
      try {
        const undone = await undoTransactionFromTelegram(userId, txId);
        await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: cb.id,
            text: 'Movimiento eliminado y saldo revertido.',
          }),
        });
        await sendTelegramMessage({
          botToken,
          chatId,
          text: `🗑️ Movimiento deshecho en Neon DB:\n• Concepto: ${undone.deletedDescription}\n• Monto revertido: $${undone.amount.toLocaleString('es-CO')} ${undone.currency}\n• Cuenta: ${undone.accountName}\n• Saldo restaurado: $${undone.restoredBalance.toLocaleString('es-CO')} ${undone.currency}`,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'No se pudo deshacer el movimiento.';
        await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: cb.id,
            text: errMsg,
          }),
        }).catch(() => {});
        await sendTelegramMessage({
          botToken,
          chatId,
          text: `⚠️ ${errMsg}`,
        });
      }
    }
    return;
  }

  // 2. Manejar mensajes entrantes (texto, nota de voz o foto)
  const msg = update.message;
  if (!msg || !msg.chat?.id) return;

  const incomingChatId = String(msg.chat.id);
  const kind = msg.voice
    ? 'VOICE'
    : msg.audio
      ? 'AUDIO'
      : Array.isArray(msg.photo) && msg.photo.length > 0
        ? 'PHOTO'
        : 'TEXT';

  console.log(
    `[TelegramBot] 📩 Procesando Update #${update.update_id} [${kind}] chat=${incomingChatId}`
  );

  // Si aún no hay chat vinculado, el primer mensaje al bot personal vincula automáticamente el chat_id
  if (!userRow.telegram_chat_id) {
    await query(
      `UPDATE user_settings
       SET telegram_chat_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2`,
      [incomingChatId, userId]
    );
    userRow.telegram_chat_id = incomingChatId;
  } else if (String(userRow.telegram_chat_id) !== incomingChatId) {
    // Bloquear cualquier otro chat_id distinto al dueño de la cuenta
    await sendTelegramMessage({
      botToken,
      chatId: incomingChatId,
      text: '🔒 Este bot financiero está vinculado de forma privada a otra cuenta.',
    });
    return;
  }

  const rawText = (msg.text || msg.caption || '').trim();

  if (rawText === '/start') {
    await sendTelegramMessage({
      botToken,
      chatId: incomingChatId,
      text:
        '✅ ¡Tu cuenta de Financial Management & Cash Flow ya está vinculada a este chat de Telegram!\n\n' +
        'Puedes enviarme:\n' +
        '🎙️ Una nota de voz: "Pagué 45 mil de almuerzo con la cuenta Nu"\n' +
        '📸 Una foto de una factura o comprobante de transferencia\n' +
        '💬 Cualquier pregunta: "¿Cuánto he gastado en restaurantes este mes o cuánto tengo en Nu?"\n\n' +
        'Cuando me dictes o escribas un gasto o ingreso, lo registraré automáticamente en Neon DB y te daré un botón por si quieres deshacerlo.',
    });
    return;
  }

  if (!aiApiKey) {
    await sendTelegramMessage({
      botToken,
      chatId: incomingChatId,
      text: '⚠️ Aún no has guardado tu API Key de IA (Gemini / OpenAI / Claude) en la pestaña "Configurar Modelo / API Key" de la aplicación web.',
    });
    return;
  }

  // Mostrar estado "escribiendo..." en Telegram
  await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: incomingChatId, action: 'typing' }),
  }).catch(() => {});

  try {
    const startMs = Date.now();
    let media: { mimeType: string; base64Data: string } | undefined;
    let effectivePrompt = rawText;

    if (msg.voice?.file_id) {
      media = await downloadTelegramMedia(
        botToken,
        msg.voice.file_id,
        msg.voice.mime_type || 'audio/ogg'
      );
      effectivePrompt =
        rawText ||
        'Escucha esta nota de voz del usuario. Si menciona que hizo un gasto, compra, pago o recibió un ingreso, extráelo con el bloque ```transaction_draft``` para registrarlo en la base de datos y confirma los detalles en español. Si hace una pregunta sobre sus finanzas, respóndela con precisión usando el contexto de Neon PostgreSQL.';
    } else if (msg.audio?.file_id) {
      media = await downloadTelegramMedia(
        botToken,
        msg.audio.file_id,
        msg.audio.mime_type || 'audio/mpeg'
      );
      effectivePrompt =
        rawText ||
        'Escucha este audio del usuario. Si menciona un movimiento financiero (gasto/ingreso), genera el bloque ```transaction_draft``` para registrarlo. Si es una consulta, respóndela con los datos de Neon DB.';
    } else if (Array.isArray(msg.photo) && msg.photo.length > 0) {
      const largestPhoto = msg.photo[msg.photo.length - 1];
      media = await downloadTelegramMedia(botToken, largestPhoto.file_id, 'image/jpeg');
      effectivePrompt =
        rawText ||
        'Analiza esta imagen (recibo, factura o comprobante de transferencia). Extrae el monto, comercio/descripción y categoría, y genera el bloque ```transaction_draft``` para registrarlo en Neon DB.';
    }

    if (!effectivePrompt && !media) {
      return;
    }

    const provider: AIProviderId =
      userRow.ai_provider && VALID_PROVIDERS.has(userRow.ai_provider)
        ? (userRow.ai_provider as AIProviderId)
        : 'gemini';
    const providerConfig = SUPPORTED_AI_PROVIDERS[provider];
    const rawSavedModel = userRow.ai_model?.trim() || '';
    const model =
      provider === 'gemini' &&
      (rawSavedModel.startsWith('gemini-2.') || rawSavedModel.startsWith('gemini-1.'))
        ? providerConfig.defaultModel
        : rawSavedModel || providerConfig.defaultModel;

    const { systemInstruction, accounts } = await buildUserFinancialContext(userId);

    const rawReply = await callAgnosticLLM({
      provider,
      model,
      apiKey: aiApiKey,
      systemInstruction,
      history: [],
      userMessage: effectivePrompt,
      media,
    });

    const { cleanReply, transactionDraft } = extractTransactionDraft(rawReply, accounts);

    if (transactionDraft) {
      const created = await executeAutoTransactionFromDraft(userId, transactionDraft);
      console.log(
        `[TelegramBot] ✅ Update #${update.update_id} insertó tx=${created.transactionId} ($${transactionDraft.monto} en ${created.accountName}) en ${Date.now() - startMs}ms`
      );
      const fullTelegramText =
        `${cleanReply}\n\n` +
        `✅ Guardado automáticamente en Neon DB:\n` +
        `• Tipo: ${created.categoryType}\n` +
        `• Monto: $${transactionDraft.monto.toLocaleString('es-CO')} ${created.currency}\n` +
        `• Categoría: ${transactionDraft.categoriaMacroId} → ${transactionDraft.subcategoria}\n` +
        `• Cuenta: ${created.accountName}\n` +
        `• Nuevo saldo en ${created.accountName}: $${created.newBalance.toLocaleString('es-CO')} ${created.currency}`;

      await sendTelegramMessage({
        botToken,
        chatId: incomingChatId,
        text: fullTelegramText,
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: '🗑️ Deshacer este registro',
                callback_data: `undo_tx:${created.transactionId}`,
              },
            ],
          ],
        },
      });
    } else {
      console.log(
        `[TelegramBot] 💬 Update #${update.update_id} respondido como consulta en ${Date.now() - startMs}ms`
      );
      await sendTelegramMessage({
        botToken,
        chatId: incomingChatId,
        text: cleanReply,
      });
    }
  } catch (err) {
    const errMsg =
      err instanceof Error ? err.message : 'Error al procesar tu mensaje en Telegram.';
    console.error(`[TelegramBot] ❌ Error en Update #${update.update_id}:`, errMsg);
    await sendTelegramMessage({
      botToken,
      chatId: incomingChatId,
      text: `⚠️ Ocurrió un error al procesar tu solicitud: ${errMsg}`,
    });
  }
}

/**
 * PUT / POST /api/ai/telegram/settings
 * Guarda o desconecta el Bot de Telegram del usuario y registra automáticamente el Webhook si hay URL HTTPS pública.
 */
export async function updateTelegramBotSettings(req: Request, res: Response) {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'No autorizado.' });
    }

    await ensureAiSettingsColumns();

    const clearBot = req.body?.clearBot === true || req.body?.clearBotToken === true;
    const unlinkChat = req.body?.unlinkChat === true;

    if (clearBot) {
      await query(
        `UPDATE user_settings
         SET telegram_bot_token_encrypted = NULL,
             telegram_bot_username = NULL,
             telegram_chat_id = NULL,
             telegram_webhook_secret = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [userId]
      );
      return res.status(200).json({
        success: true,
        message: 'Bot de Telegram desconectado.',
        telegram: {
          hasBotToken: false,
          maskedBotToken: null,
          botUsername: null,
          chatId: null,
          isLinked: false,
        },
      });
    }

    if (unlinkChat) {
      await query(
        `UPDATE user_settings
         SET telegram_chat_id = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [userId]
      );
      return res.status(200).json({
        success: true,
        message: 'Vínculo de chat reiniciado. Envía /start a tu bot desde Telegram para vincularlo.',
      });
    }

    const rawBotToken = String(req.body?.botToken || '').trim();
    if (!TELEGRAM_TOKEN_REGEX.test(rawBotToken)) {
      return res.status(400).json({
        error:
          'El Token de Telegram no tiene el formato válido de @BotFather (ej. 123456789:ABCdefGHIjklMNOpqrsTUVwxyz).',
      });
    }

    // 1. Verificar el token contra la API oficial de Telegram (getMe)
    const getMeRes = await fetch(`https://api.telegram.org/bot${rawBotToken}/getMe`);
    const getMeData = (await getMeRes.json()) as {
      ok?: boolean;
      result?: { username?: string; first_name?: string };
      description?: string;
    };

    if (!getMeRes.ok || !getMeData.ok || !getMeData.result?.username) {
      return res.status(400).json({
        error:
          getMeData.description ||
          'Telegram rechazó el token. Verifica que lo copiaste completo desde @BotFather.',
      });
    }

    const botUsername = getMeData.result.username;
    const encryptedToken = encryptApiKey(rawBotToken);
    const webhookSecret = crypto.randomBytes(24).toString('hex');

    await query(
      `INSERT INTO user_settings (
         user_id, main_currency, exchange_rate_cop_usd, ai_provider,
         telegram_bot_token_encrypted, telegram_bot_username, telegram_webhook_secret, updated_at
       )
       VALUES ($1, 'COP', 3266.78, 'gemini', $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         telegram_bot_token_encrypted = EXCLUDED.telegram_bot_token_encrypted,
         telegram_bot_username = EXCLUDED.telegram_bot_username,
         telegram_webhook_secret = EXCLUDED.telegram_webhook_secret,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, encryptedToken, botUsername, webhookSecret]
    );

    // 2. Si estamos en un dominio público HTTPS (ej. Vercel), registrar el Webhook 24/7 automáticamente
    const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
    const protoHeader = String(req.headers['x-forwarded-proto'] || 'http').trim();
    const isLocalhost =
      hostHeader.startsWith('localhost') ||
      hostHeader.startsWith('127.0.0.1') ||
      hostHeader === '';

    let webhookRegistered = false;
    let webhookUrl: string | null = null;

    if (!isLocalhost && protoHeader === 'https') {
      webhookUrl = `https://${hostHeader}/api/ai/telegram-webhook/${encodeURIComponent(userId)}`;
      const whRes = await fetch(`https://api.telegram.org/bot${rawBotToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: webhookSecret,
          allowed_updates: ['message', 'callback_query'],
        }),
      });
      const whData = (await whRes.json()) as { ok?: boolean };
      webhookRegistered = Boolean(whData.ok);
      usersWithActiveCloudWebhook.add(userId);
    } else {
      // En localhost verificamos primero si ya hay un Webhook HTTPS activo en producción (Vercel).
      // Solo lo borramos si no había Webhook HTTPS o si el usuario pidió explícitamente forceLocalPolling.
      const infoRes = await fetch(`https://api.telegram.org/bot${rawBotToken}/getWebhookInfo`).catch(
        () => null
      );
      const infoData = infoRes
        ? ((await infoRes.json().catch(() => null)) as { result?: { url?: string } } | null)
        : null;
      const existingWebhookUrl = String(infoData?.result?.url || '').trim();

      if (existingWebhookUrl.startsWith('https://') && req.body?.forceLocalPolling !== true) {
        webhookRegistered = true;
        webhookUrl = existingWebhookUrl;
        usersWithActiveCloudWebhook.add(userId);
      } else {
        await fetch(`https://api.telegram.org/bot${rawBotToken}/deleteWebhook`).catch(() => {});
        usersWithActiveCloudWebhook.delete(userId);
      }
    }

    return res.status(200).json({
      success: true,
      webhookRegistered,
      webhookUrl,
      isLocalhost,
      message: webhookRegistered
        ? `Bot @${botUsername} conectado con Webhook HTTPS 24/7 (${webhookUrl}).`
        : `Bot @${botUsername} conectado en modo local. Envía /start en Telegram para vincular tu chat.`,
      telegram: {
        hasBotToken: true,
        maskedBotToken: maskApiKey(rawBotToken),
        botUsername,
        chatId: null,
        isLinked: false,
      },
    });
  } catch (error) {
    console.error('Error al configurar Bot de Telegram:', error);
    return res.status(500).json({
      error: 'Error interno al configurar el Bot de Telegram.',
    });
  }
}

const verifiedProductionWebhooksByUser = new Map<string, string>();
const usersWithActiveCloudWebhook = new Set<string>();

/**
 * Si la petición entra desde un dominio HTTPS público (ej. Vercel), verifica y registra
 * automáticamente el Webhook 24/7 de Telegram hacia ese dominio sin requerir que el usuario
 * vuelva a pegar el Token del Bot manualmente.
 */
export async function ensureProductionTelegramWebhook(
  userId: string,
  req: Request
): Promise<string | null> {
  try {
    if (!userId) return null;
    const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
    const protoHeader = String(req.headers['x-forwarded-proto'] || 'http').trim();
    const isLocalhost =
      hostHeader.startsWith('localhost') ||
      hostHeader.startsWith('127.0.0.1') ||
      hostHeader === '';

    if (isLocalhost || protoHeader !== 'https') {
      return null;
    }

    const expectedWebhookUrl = `https://${hostHeader}/api/ai/telegram-webhook/${encodeURIComponent(
      userId
    )}`;

    if (verifiedProductionWebhooksByUser.get(userId) === expectedWebhookUrl) {
      return expectedWebhookUrl;
    }

    await ensureAiSettingsColumns();

    const userRes = await query<{
      telegram_bot_token_encrypted: string | null;
      telegram_webhook_secret: string | null;
    }>(
      `SELECT telegram_bot_token_encrypted, telegram_webhook_secret
       FROM user_settings
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    const row = userRes.rows[0];
    const botToken = decryptApiKey(row?.telegram_bot_token_encrypted);
    if (!botToken) return null;

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

    const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const infoData = (await infoRes.json()) as {
      ok?: boolean;
      result?: { url?: string };
    };

    const currentUrl = String(infoData?.result?.url || '').trim();
    if (currentUrl !== expectedWebhookUrl) {
      const whRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: expectedWebhookUrl,
          secret_token: webhookSecret,
          allowed_updates: ['message', 'callback_query'],
        }),
      });
      const whData = (await whRes.json()) as { ok?: boolean };
      if (whData.ok) {
        console.log(
          `☁️ [TelegramBot] Webhook 24/7 auto-registrado en producción: ${expectedWebhookUrl}`
        );
      }
    }

    verifiedProductionWebhooksByUser.set(userId, expectedWebhookUrl);
    usersWithActiveCloudWebhook.add(userId);
    return expectedWebhookUrl;
  } catch (err) {
    console.error('Error auto-verificando Webhook de Telegram en producción:', err);
    return null;
  }
}

/**
 * POST /api/ai/telegram-webhook/:userId
 * Endpoint público 24/7 invocado directamente por los servidores de Telegram en producción (Vercel).
 */
export async function handleTelegramWebhook(req: Request, res: Response) {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) {
      return res.status(400).json({ ok: false });
    }

    await ensureAiSettingsColumns();

    const userRes = await query<TelegramUserSettingsRow>(
      `SELECT
         user_id, ai_provider, ai_model, ai_api_key_encrypted,
         telegram_bot_token_encrypted, telegram_bot_username,
         telegram_chat_id, telegram_webhook_secret, telegram_last_update_id
       FROM user_settings
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    const userRow = userRes.rows[0];
    if (!userRow || !userRow.telegram_bot_token_encrypted) {
      return res.status(404).json({ ok: false });
    }

    // Verificar el secret_token de Telegram si está configurado
    if (userRow.telegram_webhook_secret) {
      const headerSecret = String(
        req.headers['x-telegram-bot-api-secret-token'] || ''
      ).trim();
      const expectedBuf = Buffer.from(userRow.telegram_webhook_secret, 'utf8');
      const receivedBuf = Buffer.from(headerSecret, 'utf8');
      if (
        expectedBuf.length !== receivedBuf.length ||
        !crypto.timingSafeEqual(expectedBuf, receivedBuf)
      ) {
        return res.status(401).json({ ok: false, error: 'Invalid webhook secret token' });
      }
    }

    const update = req.body as TelegramUpdate;
    if (update && typeof update.update_id === 'number') {
      const claimed = await claimTelegramUpdateAtomically(userId, update.update_id);
      if (claimed) {
        await processTelegramUpdateForUser(userRow, update);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error en webhook de Telegram:', error);
    return res.status(200).json({ ok: true });
  }
}

/**
 * Sincroniza actualizaciones de Telegram (`message` + `callback_query`) para un `userId` específico,
 * protegido con candado en memoria y reclamo atómico en PostgreSQL.
 */
export async function syncTelegramUpdatesForUserId(userId: string): Promise<{
  processedCount: number;
  isLinked: boolean;
  chatId: string | null;
  skippedConcurrent?: boolean;
  webhookActive?: boolean;
}> {
  if (activeSyncLocksByUser.has(userId)) {
    return {
      processedCount: 0,
      isLinked: true,
      chatId: null,
      skippedConcurrent: true,
    };
  }

  activeSyncLocksByUser.add(userId);

  try {
    await ensureAiSettingsColumns();

    const userRes = await query<TelegramUserSettingsRow>(
      `SELECT
         user_id, ai_provider, ai_model, ai_api_key_encrypted,
         telegram_bot_token_encrypted, telegram_bot_username,
         telegram_chat_id, telegram_webhook_secret, telegram_last_update_id
       FROM user_settings
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    const userRow = userRes.rows[0];
    const botToken = decryptApiKey(userRow?.telegram_bot_token_encrypted);
    if (!userRow || !botToken) {
      throw new Error('Primero configura tu Token de Bot de Telegram.');
    }

    const lastUpdateId = Number(userRow.telegram_last_update_id || 0);
    const offsetParam = lastUpdateId > 0 ? `&offset=${lastUpdateId + 1}` : '';
    const allowedParam = `&allowed_updates=${encodeURIComponent(
      JSON.stringify(['message', 'callback_query'])
    )}`;

    const updatesRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getUpdates?timeout=1&limit=10${offsetParam}${allowedParam}`
    );
    const updatesData = (await updatesRes.json()) as {
      ok?: boolean;
      error_code?: number;
      result?: TelegramUpdate[];
      description?: string;
    };

    if (!updatesRes.ok || !updatesData.ok) {
      // Si devuelve 409 Conflict significa que el Webhook HTTPS 24/7 en Vercel ya está activo
      if (
        updatesRes.status === 409 ||
        updatesData.error_code === 409 ||
        String(updatesData.description || '').toLowerCase().includes('webhook')
      ) {
        if (!usersWithActiveCloudWebhook.has(userId)) {
          usersWithActiveCloudWebhook.add(userId);
          console.log(
            `☁️ [TelegramBot] Webhook 24/7 activo en la nube (Vercel) para user=${userId}. El listener local cede el paso a Vercel.`
          );
        }
        return {
          processedCount: 0,
          isLinked: Boolean(userRow.telegram_chat_id),
          chatId: userRow.telegram_chat_id
            ? `***${String(userRow.telegram_chat_id).slice(-4)}`
            : null,
          webhookActive: true,
        };
      }

      throw new Error(
        updatesData.description || 'No se pudieron consultar los mensajes de Telegram.'
      );
    }

    const updates = updatesData.result || [];
    let processedCount = 0;

    for (const upd of updates) {
      // Reclama atómicamente el update_id en PostgreSQL ANTES de invocar a Gemini o tocar saldos
      const claimed = await claimTelegramUpdateAtomically(userId, upd.update_id);
      if (!claimed) continue;

      processedCount += 1;
      await processTelegramUpdateForUser(userRow, upd);
    }

    const refreshedRes = await query<{ telegram_chat_id: string | null }>(
      `SELECT telegram_chat_id FROM user_settings WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    const linkedChatId = refreshedRes.rows[0]?.telegram_chat_id || null;

    return {
      processedCount,
      isLinked: Boolean(linkedChatId),
      chatId: linkedChatId ? `***${String(linkedChatId).slice(-4)}` : null,
    };
  } finally {
    activeSyncLocksByUser.delete(userId);
  }
}

/**
 * POST /api/ai/telegram/sync
 * Sincroniza y procesa mensajes pendientes del Bot de Telegram mediante `getUpdates` (o asegura Webhook en Vercel).
 */
export async function syncTelegramUpdates(req: Request, res: Response) {
  const userId = req.user?.uid;
  if (!userId) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  try {
    const cloudWebhookUrl = await ensureProductionTelegramWebhook(userId, req);
    if (cloudWebhookUrl) {
      const refreshedRes = await query<{ telegram_chat_id: string | null }>(
        `SELECT telegram_chat_id FROM user_settings WHERE user_id = $1 LIMIT 1`,
        [userId]
      );
      const linkedChatId = refreshedRes.rows[0]?.telegram_chat_id || null;
      return res.status(200).json({
        success: true,
        processedCount: 0,
        isLinked: Boolean(linkedChatId),
        chatId: linkedChatId ? `***${String(linkedChatId).slice(-4)}` : null,
        webhookActive: true,
        webhookUrl: cloudWebhookUrl,
      });
    }

    const result = await syncTelegramUpdatesForUserId(userId);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : 'Error interno al sincronizar con Telegram.';
    return res.status(400).json({ error: msg });
  }
}

let localPollerStarted = false;
let allUsersOnCloudWebhook = false;

/**
 * En desarrollo local (`npm run dev`), ejecuta un listener en segundo plano dentro del servidor Express
 * cada 3 segundos únicamente para usuarios que NO tengan un Webhook HTTPS 24/7 activo en Vercel.
 */
export function startLocalTelegramPoller(): void {
  if (localPollerStarted) return;
  localPollerStarted = true;

  console.log('🤖 [TelegramBot] Listener local activo en segundo plano (cada 3s)');

  let isTickRunning = false;
  setInterval(async () => {
    if (isTickRunning || allUsersOnCloudWebhook) return;
    isTickRunning = true;
    try {
      await ensureAiSettingsColumns();
      const activeUsers = await query<{ user_id: string }>(
        `SELECT user_id
         FROM user_settings
         WHERE telegram_bot_token_encrypted IS NOT NULL`
      );
      const pendingLocalUsers = activeUsers.rows.filter(
        (r) => !usersWithActiveCloudWebhook.has(r.user_id)
      );
      if (activeUsers.rows.length > 0 && pendingLocalUsers.length === 0) {
        allUsersOnCloudWebhook = true;
        return;
      }
      for (const row of pendingLocalUsers) {
        await syncTelegramUpdatesForUserId(row.user_id).catch(() => {});
      }
    } catch {
      // Silencioso si aún no hay conexión o tabla lista
    } finally {
      isTickRunning = false;
    }
  }, 3000);
}
