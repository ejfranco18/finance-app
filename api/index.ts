import express from 'express';
import cors from 'cors';
import { authenticateUser } from './lib/firebaseAdmin';
import { createTransaction, deleteTransaction } from './controllers/transactionController';
import { createLiabilityPayment } from './controllers/liabilityController';
import { buyInvestment } from './controllers/investmentController';
import {
  getMonthlyCanvasView,
  getNetWorthView,
  getInvestmentsSummaryView,
  getDatabaseOverview,
  getCanvasDashboard,
  createPatrimonyRecord,
  updatePeriodSettings,
} from './controllers/viewsController';
import {
  getUserSettings,
  getUserAccounts,
  createAccount,
} from './controllers/canvasController';

const app = express();
app.use(cors());
app.use(express.json());

// Healthcheck público
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Inspección de base de datos (DBTest.tsx)
app.get('/api/db-overview', getDatabaseOverview);

// 0. Creación de Cuentas (Bancos, Billeteras, Efectivo, Brokers)
app.post('/api/accounts', authenticateUser, createAccount);

// 1. Transacciones Generales
app.post('/api/transactions', authenticateUser, createTransaction);
app.delete('/api/transactions/:transactionId', authenticateUser, deleteTransaction);
app.delete('/api/users/:userId/transactions/:transactionId', authenticateUser, deleteTransaction);

// 2. Pago a Pasivos / Deudas y Gestión Patrimonial (Activos / Pasivos / Cuentas)
app.post('/api/liabilities/payments', authenticateUser, createLiabilityPayment);
app.post('/api/patrimony', authenticateUser, createPatrimonyRecord);
app.post('/api/settings', authenticateUser, updatePeriodSettings);
app.put('/api/settings', authenticateUser, updatePeriodSettings);

// 3. Inversiones (Compra de Acciones / ETFs)
app.post('/api/investments/buy', authenticateUser, buyInvestment);

// 4. Endpoints de Lectura (Vistas Optimizadas de PostgreSQL)
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
  app.listen(PORT, () => {
    console.log(`🚀 API Express escuchando en http://localhost:${PORT}`);
  });
}

export default app;