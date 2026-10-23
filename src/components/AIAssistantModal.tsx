import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Sparkles,
  Send,
  KeyRound,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Bot,
  RefreshCw,
  Mic,
  Camera,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { auth } from '../lib/firebaseClient';
import type { InitialTransactionDraft } from './FinanceForms';
import styles from './FinanceForms.module.css';

export type AIProviderId = 'gemini' | 'openai' | 'anthropic' | 'openrouter';

interface ProviderOption {
  id: AIProviderId;
  name: string;
  defaultModel: string;
  models: Array<{ id: string; label: string }>;
  keyPlaceholder: string;
  docsUrl: string;
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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  model?: string;
  transactionDraft?: SuggestedTransactionDraft | null;
}

interface TelegramConfigState {
  hasBotToken: boolean;
  maskedBotToken: string | null;
  botUsername: string | null;
  chatId: string | null;
  isLinked: boolean;
}

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTransactionDraft: (draft: InitialTransactionDraft) => void;
}

const DEFAULT_PROVIDERS: ProviderOption[] = [
  {
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
  {
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
  {
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
  {
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
];

const QUICK_PROMPTS = [
  '¿Cuánto me están rentando al mes y al año mis 3 cuentas Nu al 9.35% E.A.?',
  '¿Cuáles son mis 5 categorías de mayor gasto y qué porcentaje de mis ingresos ahorré?',
  'Haz un resumen de mi patrimonio neto, liquidez en COP/USD y nivel de endeudamiento.',
  'Regístrame un gasto de 45.000 hoy en restaurante con la cuenta Nu',
];

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (auth.currentUser?.uid) {
    headers['x-user-id'] = auth.currentUser.uid;
  }
  return headers;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onClose,
  onOpenTransactionDraft,
}) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'chat' | 'telegram' | 'settings'>('chat');
  const [providers, setProviders] = useState<ProviderOption[]>(DEFAULT_PROVIDERS);
  const [provider, setProvider] = useState<AIProviderId>('gemini');
  const [model, setModel] = useState<string>('gemini-3-flash-preview');
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [maskedApiKey, setMaskedApiKey] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');

  const [telegramConfig, setTelegramConfig] = useState<TelegramConfigState>({
    hasBotToken: false,
    maskedBotToken: null,
    botUsername: null,
    chatId: null,
    isLinked: false,
  });
  const [telegramTokenInput, setTelegramTokenInput] = useState<string>('');
  const [isSavingTelegram, setIsSavingTelegram] = useState<boolean>(false);
  const [isSyncingTelegram, setIsSyncingTelegram] = useState<boolean>(false);
  const [telegramMsg, setTelegramMsg] = useState<string | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(false);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        '¡Hola! Soy tu Copiloto Financiero IA conectado en tiempo real a tu base de datos en Neon PostgreSQL.\n\nPuedes preguntarme sobre tus cuentas, interés compuesto de Nu, gastos por categoría o mes, patrimonio neto, o pedirme que prepare una transacción en lenguaje natural.',
    },
  ]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const selectedProviderConfig =
    providers.find((p) => p.id === provider) || DEFAULT_PROVIDERS[0];

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadAiSettings = async () => {
      setIsLoadingSettings(true);
      setSettingsError(null);
      try {
        const headers = await buildAuthHeaders();
        const res = await fetch('/api/ai/settings', { headers });
        const data = await res.json();
        if (!cancelled && res.ok) {
          if (Array.isArray(data.providers) && data.providers.length > 0) {
            setProviders(data.providers);
          }
          if (data.provider) {
            setProvider(data.provider as AIProviderId);
          }
          if (data.model) {
            setModel(String(data.model));
          }
          setHasApiKey(Boolean(data.hasApiKey));
          setMaskedApiKey(data.maskedApiKey || null);
          if (data.telegram) {
            setTelegramConfig({
              hasBotToken: Boolean(data.telegram.hasBotToken),
              maskedBotToken: data.telegram.maskedBotToken || null,
              botUsername: data.telegram.botUsername || null,
              chatId: data.telegram.chatId || null,
              isLinked: Boolean(data.telegram.isLinked),
            });
          }
        }
      } catch {
        // Mantiene valores por defecto si aún no se ha sincronizado
      } finally {
        if (!cancelled) {
          setIsLoadingSettings(false);
        }
      }
    };

    loadAiSettings();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab, isSendingChat]);

  const isSyncInFlightRef = useRef<boolean>(false);

  // En desarrollo local (localhost), mientras la pestaña de Telegram esté abierta y haya un Bot conectado,
  // sincroniza automáticamente cada 5 segundos para procesar notas de voz, fotos o /start sin necesitar HTTPS público.
  useEffect(() => {
    if (!isOpen || activeTab !== 'telegram' || !telegramConfig.hasBotToken) return;
    const isLocalhost =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocalhost) return;

    const timer = window.setInterval(async () => {
      if (isSyncInFlightRef.current) return;
      isSyncInFlightRef.current = true;
      try {
        const headers = await buildAuthHeaders();
        const res = await fetch('/api/ai/telegram/sync', {
          method: 'POST',
          headers,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.processedCount > 0) {
          setTelegramConfig((prev) => ({
            ...prev,
            chatId: data.chatId || prev.chatId,
            isLinked: Boolean(data.isLinked),
          }));
          setTelegramMsg(
            `¡Se procesaron ${data.processedCount} mensaje(s) desde Telegram en tiempo real!`
          );
          queryClient.invalidateQueries({ queryKey: ['canvas-dashboard'] });
        } else if (data.isLinked && !telegramConfig.isLinked) {
          setTelegramConfig((prev) => ({
            ...prev,
            chatId: data.chatId || prev.chatId,
            isLinked: true,
          }));
        }
      } catch {
        // Silencioso en auto-poll
      } finally {
        isSyncInFlightRef.current = false;
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [isOpen, activeTab, telegramConfig.hasBotToken, telegramConfig.isLinked, queryClient]);

  if (!isOpen) return null;

  const handleProviderChange = (newProvider: AIProviderId) => {
    setProvider(newProvider);
    const found = providers.find((p) => p.id === newProvider);
    if (found) {
      setModel(found.defaultModel);
    }
    setSettingsMsg(null);
    setSettingsError(null);
  };

  const handleSaveTelegram = async (e: React.FormEvent, clearToken = false) => {
    e.preventDefault();
    setIsSavingTelegram(true);
    setTelegramMsg(null);
    setTelegramError(null);

    try {
      const headers = await buildAuthHeaders();
      const res = await fetch('/api/ai/telegram/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          botToken: clearToken ? '' : telegramTokenInput.trim(),
          clearBotToken: clearToken,
          webhookBaseUrl: window.location.origin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo configurar el Bot de Telegram.');
      }

      if (data.telegram) {
        setTelegramConfig({
          hasBotToken: Boolean(data.telegram.hasBotToken),
          maskedBotToken: data.telegram.maskedBotToken || null,
          botUsername: data.telegram.botUsername || null,
          chatId: data.telegram.chatId || null,
          isLinked: Boolean(data.telegram.isLinked),
        });
      }
      setTelegramTokenInput('');
      setTelegramMsg(data.message || 'Configuración de Telegram actualizada.');
    } catch (err) {
      setTelegramError(
        err instanceof Error ? err.message : 'Error al guardar el Bot de Telegram.'
      );
    } finally {
      setIsSavingTelegram(false);
    }
  };

  const handleManualTelegramSync = async () => {
    setIsSyncingTelegram(true);
    setTelegramError(null);
    setTelegramMsg(null);
    try {
      const headers = await buildAuthHeaders();
      const res = await fetch('/api/ai/telegram/sync', {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo sincronizar con Telegram.');
      }

      setTelegramConfig((prev) => ({
        ...prev,
        chatId: data.chatId || prev.chatId,
        isLinked: Boolean(data.isLinked),
      }));

      if (data.processedCount > 0) {
        setTelegramMsg(
          `✅ Se procesaron ${data.processedCount} mensaje(s) de Telegram y se actualizó tu base de datos.`
        );
        queryClient.invalidateQueries({ queryKey: ['canvas-dashboard'] });
      } else {
        setTelegramMsg('No hay mensajes nuevos pendientes en Telegram.');
      }
    } catch (err) {
      setTelegramError(
        err instanceof Error ? err.message : 'Error al sincronizar mensajes de Telegram.'
      );
    } finally {
      setIsSyncingTelegram(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent, clearKey = false) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSettingsMsg(null);
    setSettingsError(null);

    try {
      const headers = await buildAuthHeaders();
      const res = await fetch('/api/ai/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          provider,
          model,
          apiKey: clearKey ? '' : apiKeyInput.trim(),
          clearApiKey: clearKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo guardar la configuración de IA.');
      }

      setHasApiKey(Boolean(data.hasApiKey));
      setMaskedApiKey(data.maskedApiKey || null);
      setApiKeyInput('');
      setSettingsMsg(
        clearKey
          ? 'API Key eliminada correctamente de tu cuenta.'
          : 'Configuración de modelo y API Key guardada de forma cifrada (AES-256-GCM).'
      );
      setChatError(null);
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : 'Error al guardar la configuración.'
      );
    } finally {
      setIsSavingSettings(false);
    }
  };

  const sendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || isSendingChat) return;

    setChatError(null);
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    const historyForApi = messages
      .filter((m) => m.id !== 'welcome')
      .slice(-8)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsSendingChat(true);

    try {
      const headers = await buildAuthHeaders();
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: trimmed,
          history: historyForApi,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data?.code === 'MISSING_API_KEY') {
          setChatError(data.error);
          return;
        }
        throw new Error(data.error || 'No se pudo obtener respuesta del modelo de IA.');
      }

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: String(data.reply || ''),
        provider: data.provider,
        model: data.model,
        transactionDraft: data.transactionDraft || null,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : 'Error al consultar al Copiloto Financiero.'
      );
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuestion(inputMessage);
  };

  return (
    <div className={styles.overlay}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-assistant-title"
        className={styles.modalCard}
        style={{ maxWidth: '50rem' }}
      >
        <div className={styles.topGlowPurple} />

        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.iconBoxPurple}>
              <Sparkles className={styles.headerIcon} />
            </div>
            <div>
              <h2 id="ai-assistant-title" className={styles.modalTitle}>
                Copiloto Financiero IA · Web + Telegram 24/7
              </h2>
              <p className={styles.modalSubtitle}>
                Proveedor activo: <strong>{selectedProviderConfig.name}</strong> ({model}){' '}
                {hasApiKey ? `· Key ${maskedApiKey || 'Activa'}` : '· Sin API Key configurada'}
                {telegramConfig.botUsername
                  ? ` · Bot @${telegramConfig.botUsername} ${
                      telegramConfig.isLinked ? '(Vinculado)' : '(Pendiente /start)'
                    }`
                  : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar Copiloto IA" className={styles.closeBtn}>
            <X className={styles.closeIcon} />
          </button>
        </div>

        {/* Selector de Pestañas (Chat vs Telegram Bot 24/7 vs Configuración BYOK) */}
        <div className={styles.segmentedGrid} style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`${styles.segBtn} ${
              activeTab === 'chat' ? styles.segBtnActivePurple : ''
            }`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
            }}
          >
            <MessageSquare style={{ width: '0.95rem', height: '0.95rem' }} />
            <span>Chat en Web</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('telegram')}
            className={`${styles.segBtn} ${
              activeTab === 'telegram' ? styles.segBtnActiveEmerald : ''
            }`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
            }}
          >
            <Bot style={{ width: '0.95rem', height: '0.95rem' }} />
            <span>
              Telegram Bot 24/7 {telegramConfig.isLinked ? '🟢' : telegramConfig.hasBotToken ? '🟡' : ''}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`${styles.segBtn} ${
              activeTab === 'settings' ? styles.segBtnActiveCyan : ''
            }`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
            }}
          >
            <KeyRound style={{ width: '0.95rem', height: '0.95rem' }} />
            <span>
              Modelo / API Key {hasApiKey ? '✓' : '⚠️'}
            </span>
          </button>
        </div>

        {activeTab === 'telegram' ? (
          <form onSubmit={(e) => handleSaveTelegram(e, false)} className={styles.form}>
            <div
              style={{
                padding: '0.9rem 1rem',
                borderRadius: '0.85rem',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.28)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.55rem',
                fontSize: '0.8rem',
                color: '#cbd5e1',
                lineHeight: 1.48,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: '#34d399',
                  fontWeight: 700,
                }}
              >
                <Bot style={{ width: '1.1rem', height: '1.1rem' }} />
                <span>
                  Asistente Multimodal en Telegram 24/7 (100% Serverless en Vercel)
                </span>
              </div>
              <div>
                Envía <strong>notas de voz</strong> (<em>&quot;Gasté 38.000 en almuerzo con tarjeta de crédito&quot;</em>),{' '}
                <strong>fotos de recibos/facturas</strong> o <strong>preguntas financieras</strong> desde tu celular.
                El bot transcribirá el audio o leerá la factura con Gemini, registrará el movimiento en Neon DB, actualizará el saldo y te responderá con un botón <strong>🗑️ Deshacer</strong> por si quieres revertirlo con 1 toque.
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: '0.5rem',
                  marginTop: '0.2rem',
                }}
              >
                <div
                  style={{
                    padding: '0.5rem 0.65rem',
                    borderRadius: '0.6rem',
                    backgroundColor: 'rgba(8, 13, 22, 0.7)',
                    border: '1px solid #1e2f47',
                    fontSize: '0.73rem',
                  }}
                >
                  <strong style={{ color: '#6ee7b7', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Mic style={{ width: '0.8rem', height: '0.8rem' }} /> Notas de Voz
                  </strong>
                  Audio nativo <code>.ogg</code> procesado por Gemini Multimodal.
                </div>
                <div
                  style={{
                    padding: '0.5rem 0.65rem',
                    borderRadius: '0.6rem',
                    backgroundColor: 'rgba(8, 13, 22, 0.7)',
                    border: '1px solid #1e2f47',
                    fontSize: '0.73rem',
                  }}
                >
                  <strong style={{ color: '#67e8f9', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Camera style={{ width: '0.8rem', height: '0.8rem' }} /> Fotos de Recibos
                  </strong>
                  Extrae comercio, total y categoría desde la foto del ticket.
                </div>
                <div
                  style={{
                    padding: '0.5rem 0.65rem',
                    borderRadius: '0.6rem',
                    backgroundColor: 'rgba(8, 13, 22, 0.7)',
                    border: '1px solid #1e2f47',
                    fontSize: '0.73rem',
                  }}
                >
                  <strong style={{ color: '#d8b4fe', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Sparkles style={{ width: '0.8rem', height: '0.8rem' }} /> Consultas 24/7
                  </strong>
                  Pregunta saldos, Nu o gastos sin tener tu PC encendido.
                </div>
              </div>
            </div>

            {/* Guía rápida de 3 pasos */}
            <div
              style={{
                padding: '0.75rem 0.95rem',
                borderRadius: '0.75rem',
                backgroundColor: '#080d16',
                border: '1px solid #1b2b40',
                fontSize: '0.76rem',
                color: '#94a3b8',
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: '#e2e8f0' }}>¿Cómo conectarlo en 30 segundos?</strong>
              <ol style={{ margin: '0.35rem 0 0 1.1rem', padding: 0 }}>
                <li>
                  Abre{' '}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 600 }}
                  >
                    @BotFather en Telegram ↗
                  </a>{' '}
                  y envíale el comando <code>/newbot</code>.
                </li>
                <li>
                  Ponle un nombre (ej. <em>Mis Finanzas IA</em>) y un usuario terminado en <code>bot</code>, y pega aquí abajo el <strong>HTTP API Token</strong> que te entrega.
                </li>
                <li>
                  Abre tu nuevo bot en Telegram y envíale <code>/start</code> para vincular tu chat privado.
                </li>
              </ol>
            </div>

            <div>
              <label htmlFor="telegram-bot-token" className={styles.label}>
                Token del Bot de Telegram (@BotFather){' '}
                {telegramConfig.hasBotToken && telegramConfig.maskedBotToken && (
                  <span style={{ color: '#34d399', fontWeight: 600 }}>
                    (Guardado: {telegramConfig.maskedBotToken})
                  </span>
                )}
              </label>
              <input
                id="telegram-bot-token"
                type="password"
                autoComplete="off"
                placeholder={
                  telegramConfig.hasBotToken
                    ? `Deja vacío para conservar el token actual (${telegramConfig.maskedBotToken}) o pega uno nuevo...`
                    : 'Pega el token de @BotFather (ej. 789123456:AAH...)'
                }
                value={telegramTokenInput}
                onChange={(e) => setTelegramTokenInput(e.target.value)}
                className={styles.inputMono}
              />
            </div>

            {/* Estado del Bot conectado */}
            {telegramConfig.hasBotToken && (
              <div
                style={{
                  padding: '0.8rem 1rem',
                  borderRadius: '0.85rem',
                  backgroundColor: '#091322',
                  border: '1px solid #1e2f47',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div style={{ fontSize: '0.8rem', color: '#e2e8f0' }}>
                  <div>
                    <strong>Bot conectado:</strong>{' '}
                    {telegramConfig.botUsername ? (
                      <a
                        href={`https://t.me/${telegramConfig.botUsername}?start=vincular`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#34d399', fontWeight: 700, textDecoration: 'none' }}
                      >
                        @{telegramConfig.botUsername} ↗
                      </a>
                    ) : (
                      'Activo'
                    )}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                    Estado del Chat:{' '}
                    {telegramConfig.isLinked ? (
                      <span style={{ color: '#34d399', fontWeight: 600 }}>
                        ✓ Vinculado (Chat ID #{telegramConfig.chatId})
                      </span>
                    ) : (
                      <span style={{ color: '#fbbf24', fontWeight: 600 }}>
                        Pendiente — Abre @{telegramConfig.botUsername} en Telegram y envía /start
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {telegramConfig.botUsername && (
                    <a
                      href={`https://t.me/${telegramConfig.botUsername}?start=vincular`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.secondaryActionBtn}
                      style={{
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        color: '#6ee7b7',
                      }}
                    >
                      <span>Abrir Bot</span>
                      <ExternalLink style={{ width: '0.8rem', height: '0.8rem' }} />
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={isSyncingTelegram}
                    onClick={handleManualTelegramSync}
                    className={styles.secondaryActionBtn}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    {isSyncingTelegram ? (
                      <Loader2 className={styles.spinIcon} />
                    ) : (
                      <RefreshCw style={{ width: '0.82rem', height: '0.82rem' }} />
                    )}
                    <span>Sincronizar Mensajes Ahora</span>
                  </button>
                </div>
              </div>
            )}

            {telegramError && (
              <div className={styles.submitErrorBox}>
                <AlertCircle className={styles.errorIcon} />
                <span>{telegramError}</span>
              </div>
            )}

            {telegramMsg && (
              <div className={styles.successBannerEmerald}>
                <CheckCircle2 className={styles.successIconEmerald} />
                <div style={{ fontSize: '0.82rem', color: '#d1fae5' }}>{telegramMsg}</div>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                marginTop: '0.35rem',
              }}
            >
              {telegramConfig.hasBotToken ? (
                <button
                  type="button"
                  disabled={isSavingTelegram}
                  onClick={(e) => handleSaveTelegram(e, true)}
                  className={styles.secondaryActionBtn}
                  style={{
                    color: '#fda4af',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <Trash2 style={{ width: '0.9rem', height: '0.9rem' }} />
                  <span>Desconectar Bot</span>
                </button>
              ) : (
                <div />
              )}

              <button
                type="submit"
                disabled={isSavingTelegram || (!telegramTokenInput.trim() && !telegramConfig.hasBotToken)}
                className={styles.doneBtnEmerald}
                style={{
                  padding: '0.65rem 1.25rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.82rem',
                }}
              >
                {isSavingTelegram ? (
                  <>
                    <Loader2 className={styles.spinIcon} /> Conectando con Telegram...
                  </>
                ) : (
                  <>
                    <CheckCircle2 style={{ width: '1rem', height: '1rem' }} />{' '}
                    {telegramConfig.hasBotToken ? 'Actualizar / Re-Vincular Webhook' : 'Conectar Bot 24/7'}
                  </>
                )}
              </button>
            </div>
          </form>
        ) : activeTab === 'settings' ? (
          <form onSubmit={(e) => handleSaveSettings(e, false)} className={styles.form}>
            <div
              style={{
                padding: '0.85rem 1rem',
                borderRadius: '0.85rem',
                backgroundColor: 'rgba(6, 182, 212, 0.08)',
                border: '1px solid rgba(6, 182, 212, 0.25)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.65rem',
                fontSize: '0.8rem',
                color: '#cbd5e1',
                lineHeight: 1.45,
              }}
            >
              <ShieldCheck
                style={{
                  width: '1.15rem',
                  height: '1.15rem',
                  color: '#22d3ee',
                  flexShrink: 0,
                  marginTop: '0.1rem',
                }}
              />
              <div>
                <strong>Arquitectura Agnóstica por Usuario (BYOK):</strong> Cada usuario puede
                elegir su propio proveedor (Gemini, OpenAI, Claude u OpenRouter) y su propia API
                Key. Tu clave se cifra con <strong>AES-256-GCM</strong> en el servidor antes de
                guardarse en <code>user_settings</code> y nunca se expone en el navegador.
              </div>
            </div>

            <div className={styles.gridTwoCols}>
              <div>
                <label htmlFor="ai-provider-select" className={styles.label}>
                  Proveedor de IA
                </label>
                <select
                  id="ai-provider-select"
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value as AIProviderId)}
                  className={styles.input}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ai-model-select" className={styles.label}>
                  Modelo
                </label>
                <select
                  id="ai-model-select"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className={styles.inputMono}
                >
                  {selectedProviderConfig.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.35rem',
                }}
              >
                <label htmlFor="ai-api-key-input" className={styles.label} style={{ margin: 0 }}>
                  API Key de {selectedProviderConfig.name}{' '}
                  {hasApiKey && maskedApiKey && (
                    <span style={{ color: '#34d399', fontWeight: 600 }}>
                      (Guardada: {maskedApiKey})
                    </span>
                  )}
                </label>
                <a
                  href={selectedProviderConfig.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '0.75rem',
                    color: '#38bdf8',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    textDecoration: 'none',
                  }}
                >
                  <span>Obtener API Key</span>
                  <ExternalLink style={{ width: '0.75rem', height: '0.75rem' }} />
                </a>
              </div>
              <input
                id="ai-api-key-input"
                type="password"
                autoComplete="off"
                placeholder={
                  hasApiKey
                    ? `Deja vacío para conservar tu clave actual (${maskedApiKey}) o pega una nueva...`
                    : `Pega tu API Key (${selectedProviderConfig.keyPlaceholder})`
                }
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className={styles.inputMono}
              />
            </div>

            {settingsError && (
              <div className={styles.submitErrorBox}>
                <AlertCircle className={styles.errorIcon} />
                <span>{settingsError}</span>
              </div>
            )}

            {settingsMsg && (
              <div className={styles.successBannerEmerald}>
                <CheckCircle2 className={styles.successIconEmerald} />
                <div style={{ fontSize: '0.82rem', color: '#d1fae5' }}>{settingsMsg}</div>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                marginTop: '0.5rem',
              }}
            >
              {hasApiKey ? (
                <button
                  type="button"
                  disabled={isSavingSettings}
                  onClick={(e) => handleSaveSettings(e, true)}
                  className={styles.secondaryActionBtn}
                  style={{
                    color: '#fda4af',
                    borderColor: 'rgba(244, 63, 94, 0.35)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <Trash2 style={{ width: '0.9rem', height: '0.9rem' }} />
                  <span>Borrar API Key</span>
                </button>
              ) : (
                <div />
              )}

              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('chat')}
                  className={styles.secondaryActionBtn}
                >
                  Ir al Chat
                </button>
                <button
                  type="submit"
                  disabled={isSavingSettings || isLoadingSettings}
                  className={styles.submitBtnPurple}
                  style={{ width: 'auto', padding: '0.65rem 1.25rem' }}
                >
                  {isSavingSettings ? (
                    <>
                      <Loader2 className={styles.spinIcon} /> Guardando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className={styles.btnIcon} /> Guardar Configuración IA
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* Banner si aún no tiene API Key */}
            {!hasApiKey && !isLoadingSettings && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '0.85rem',
                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  fontSize: '0.8rem',
                  color: '#fde68a',
                }}
              >
                <span>
                  Configura tu API Key personal ({selectedProviderConfig.name}, OpenAI, Claude u
                  OpenRouter) para activar las consultas en vivo.
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className={styles.secondaryActionBtn}
                  style={{
                    whiteSpace: 'nowrap',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.75rem',
                  }}
                >
                  Configurar API Key →
                </button>
              </div>
            )}

            {/* Sugerencias rápidas */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.4rem',
              }}
            >
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={isSendingChat}
                  onClick={() => sendQuestion(prompt)}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '9999px',
                    backgroundColor: '#111c2e',
                    border: '1px solid #1e2f47',
                    color: '#cbd5e1',
                    fontSize: '0.72rem',
                    cursor: isSendingChat ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  ✨ {prompt}
                </button>
              ))}
            </div>

            {/* Historial de conversación */}
            <div
              style={{
                height: '22rem',
                overflowY: 'auto',
                padding: '0.85rem',
                borderRadius: '1rem',
                backgroundColor: '#080e1a',
                border: '1px solid #18263a',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: isUser ? 'flex-end' : 'flex-start',
                      maxWidth: '88%',
                      padding: '0.75rem 1rem',
                      borderRadius: isUser
                        ? '1rem 1rem 0.25rem 1rem'
                        : '1rem 1rem 1rem 0.25rem',
                      backgroundColor: isUser
                        ? 'rgba(168, 85, 247, 0.2)'
                        : 'rgba(17, 28, 46, 0.95)',
                      border: isUser
                        ? '1px solid rgba(192, 132, 252, 0.4)'
                        : '1px solid #1e2f47',
                      color: '#f1f5f9',
                      fontSize: '0.84rem',
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    <div>{msg.content}</div>

                    {/* Si el modelo detectó y estructuró una transacción para registrar */}
                    {msg.transactionDraft && (
                      <div
                        style={{
                          marginTop: '0.75rem',
                          padding: '0.75rem',
                          borderRadius: '0.75rem',
                          backgroundColor: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.45rem',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: '#34d399',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          Borrador de Movimiento Detectado
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#e2e8f0' }}>
                          <strong>Monto:</strong> ${msg.transactionDraft.monto.toLocaleString('es-CO')}{' '}
                          {msg.transactionDraft.moneda} ·{' '}
                          <strong>Cuenta:</strong>{' '}
                          {msg.transactionDraft.cuentaOrigenNombre || 'Principal'} ·{' '}
                          <strong>Categoría:</strong> {msg.transactionDraft.categoriaMacroId} →{' '}
                          {msg.transactionDraft.subcategoria}
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => {
                              const draft = msg.transactionDraft!;
                              onOpenTransactionDraft({
                                tipo: draft.tipo,
                                monto: draft.monto,
                                moneda: draft.moneda,
                                cuentaOrigenId: draft.cuentaOrigenId,
                                categoriaMacroId: draft.categoriaMacroId,
                                subcategoria: draft.subcategoria,
                                descripcion: draft.descripcion,
                              });
                            }}
                            style={{
                              padding: '0.4rem 0.85rem',
                              borderRadius: '0.5rem',
                              backgroundColor: '#10b981',
                              color: '#042f2e',
                              border: 'none',
                              fontWeight: 700,
                              fontSize: '0.76rem',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                            }}
                          >
                            <Plus style={{ width: '0.85rem', height: '0.85rem' }} />
                            <span>Abrir en Formulario para Confirmar</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {isSendingChat && (
                <div
                  style={{
                    alignSelf: 'flex-start',
                    padding: '0.65rem 0.95rem',
                    borderRadius: '0.85rem',
                    backgroundColor: 'rgba(17, 28, 46, 0.95)',
                    border: '1px solid #1e2f47',
                    color: '#94a3b8',
                    fontSize: '0.8rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <Loader2 className={styles.spinIcon} />
                  <span>
                    Consultando Neon DB y analizando con {selectedProviderConfig.name} ({model})...
                  </span>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {chatError && (
              <div className={styles.submitErrorBox}>
                <AlertCircle className={styles.errorIcon} />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    gap: '0.75rem',
                  }}
                >
                  <span>{chatError}</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    className={styles.secondaryActionBtn}
                    style={{
                      padding: '0.25rem 0.65rem',
                      fontSize: '0.74rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Configurar Key
                  </button>
                </div>
              </div>
            )}

            {/* Barra de envío */}
            <form
              onSubmit={handleChatSubmit}
              style={{
                display: 'flex',
                gap: '0.6rem',
                alignItems: 'center',
              }}
            >
              <input
                type="text"
                placeholder="Pregúntale a tu base de datos o escribe un gasto a registrar..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                disabled={isSendingChat}
                className={styles.input}
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                disabled={isSendingChat || !inputMessage.trim()}
                className={styles.submitBtnPurple}
                style={{
                  width: 'auto',
                  padding: '0.7rem 1.15rem',
                  marginTop: 0,
                }}
              >
                {isSendingChat ? (
                  <Loader2 className={styles.spinIcon} />
                ) : (
                  <>
                    <Send className={styles.btnIcon} />
                    <span>Enviar</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
