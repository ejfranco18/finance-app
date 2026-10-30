import express from 'express';
import cors from 'cors';
import { authenticateUser } from './lib/firebaseAdmin';
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from './controllers/transactionController';
import { createLiabilityPayment } from './controllers/liabilityController';
import { buyInvestment } from './controllers/investmentController';
import {
  getMonthlyCanvasView,
  getNetWorthView,
  getInvestmentsSummaryView,
  getDatabaseOverview,
  getCanvasDashboard,
  createPatrimonyRecord,
  updatePatrimonyRecord,
  deletePatrimonyRecord,
  updatePeriodSettings,
} from './controllers/viewsController';
import {
  getUserSettings,
  getUserAccounts,
  createAccount,
  reconcileAccount,
  runDailyInterestCron,
} from './controllers/canvasController';
import {
  getAiSettings,
  updateAiSettings,
  chatWithFinancialAi,
} from './controllers/aiController';
import {
  updateTelegramBotSettings,
  handleTelegramWebhook,
  syncTelegramUpdates,
  startLocalTelegramPoller,
} from './controllers/telegramController';

const app = express();
app.use(cors());
app.use(express.json());

// Healthcheck público
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Cron Job automático de interés compuesto diario (ejecutado después de medianoche por Vercel Cron)
app.get('/api/cron/daily-interest', runDailyInterestCron);
app.post('/api/cron/daily-interest', runDailyInterestCron);

// Inspección de base de datos (DBTest.tsx)
app.get('/api/db-overview', authenticateUser, getDatabaseOverview);

// 0. Creación y Conciliación de Cuentas (Bancos, Billeteras, Efectivo, Brokers)
app.post('/api/accounts', authenticateUser, createAccount);
app.put('/api/accounts/:accountId/reconcile', authenticateUser, reconcileAccount);
app.post('/api/accounts/:accountId/reconcile', authenticateUser, reconcileAccount);

// 1. Transacciones Generales
app.post('/api/transactions', authenticateUser, createTransaction);
app.put('/api/transactions/:transactionId', authenticateUser, updateTransaction);
app.put('/api/users/:userId/transactions/:transactionId', authenticateUser, updateTransaction);
app.delete('/api/transactions/:transactionId', authenticateUser, deleteTransaction);
app.delete('/api/users/:userId/transactions/:transactionId', authenticateUser, deleteTransaction);

// 2. Pago a Pasivos / Deudas y Gestión Patrimonial (Activos / Pasivos / Cuentas)
app.post('/api/liabilities/payments', authenticateUser, createLiabilityPayment);
app.post('/api/patrimony', authenticateUser, createPatrimonyRecord);
app.put('/api/patrimony/:id', authenticateUser, updatePatrimonyRecord);
app.post('/api/patrimony/:id', authenticateUser, updatePatrimonyRecord);
app.delete('/api/patrimony/:id', authenticateUser, deletePatrimonyRecord);
app.post('/api/settings', authenticateUser, updatePeriodSettings);
app.put('/api/settings', authenticateUser, updatePeriodSettings);

// 3. Inversiones (Compra de Acciones / ETFs)
app.post('/api/investments/buy', authenticateUser, buyInvestment);

// 4. Copiloto Financiero IA Agnóstico (BYOK por usuario + Contexto Neon DB + Telegram Bot 24/7)
app.get('/api/ai/settings', authenticateUser, getAiSettings);
app.put('/api/ai/settings', authenticateUser, updateAiSettings);
app.post('/api/ai/settings', authenticateUser, updateAiSettings);
app.post('/api/ai/chat', authenticateUser, chatWithFinancialAi);
app.put('/api/ai/telegram/settings', authenticateUser, updateTelegramBotSettings);
app.post('/api/ai/telegram/settings', authenticateUser, updateTelegramBotSettings);
app.post('/api/ai/telegram/sync', authenticateUser, syncTelegramUpdates);
app.post('/api/ai/telegram-webhook/:userId', handleTelegramWebhook);

// 5. Endpoints de Lectura (Vistas Optimizadas de PostgreSQL)
app.get('/api/canvas-dashboard', authenticateUser, getCanvasDashboard);
app.get('/api/canvas/:month', authenticateUser, getMonthlyCanvasView);
app.get('/api/net-worth', authenticateUser, getNetWorthView);
app.get('/api/investments/summary', authenticateUser, getInvestmentsSummaryView);

// Endpoints auxiliares de usuario
app.get('/api/users/:userId/canvas-dashboard', authenticateUser, getCanvasDashboard);
app.get('/api/users/:userId/canvas/:month', authenticateUser, getMonthlyCanvasView);
app.get('/api/users/:userId/settings', authenticateUser, getUserSettings);
app.get('/api/users/:userId/accounts', authenticateUser, getUserAccounts);

if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
  const PORT = 4000;
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`🚀 API Express escuchando en http://127.0.0.1:${PORT}`);
    startLocalTelegramPoller();
  });
}

export default app;