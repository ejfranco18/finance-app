import dns from 'node:dns';
import pg from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

const { Pool } = pg;

// Evita timeouts de resolución IPv6 hacia endpoints de Neon en entornos dual-stack
dns.setDefaultResultOrder('ipv4first');

const rawDatabaseUrl = process.env.DATABASE_URL?.trim().replace(/^['"]|['"]$/g, '');

if (!rawDatabaseUrl) {
  console.error('⚠️ DATABASE_URL no está definido en las variables de entorno.');
}

// Garantiza validación estricta del certificado TLS y del hostname de Neon (sslmode=verify-full),
// evitando el warning de deprecación de pg-connection-string en local y en producción (Vercel).
const normalizedDatabaseUrl = rawDatabaseUrl
  ? rawDatabaseUrl.replace(/([?&])sslmode=(?:require|prefer|verify-ca)\b/i, '$1sslmode=verify-full')
  : undefined;

export const pool = new Pool({
  connectionString: normalizedDatabaseUrl,
  ssl: {
    rejectUnauthorized: true,
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 25000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Error inesperado en un cliente inactivo del Pool de PostgreSQL:', err);
});

function isTransientConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('timeout exceeded when trying to connect') ||
    msg.includes('connection terminated unexpectedly') ||
    msg.includes('econnreset') ||
    msg.includes('socket hang up') ||
    msg.includes('client has encountered a connection error')
  );
}

/**
 * Helper para ejecutar consultas parametrizadas con reintento automático ante conexiones inactivas/cold-start.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params);
  } catch (error) {
    if (isTransientConnectionError(error)) {
      console.warn('⚠️ Reconectando al Pool de Neon PostgreSQL tras inactividad/cold-start...');
      try {
        return await pool.query<T>(text, params);
      } catch (retryError) {
        console.error('Error ejecutando consulta SQL tras reintento:', { text, error: retryError });
        throw retryError;
      }
    }
    console.error('Error ejecutando consulta SQL:', { text, error });
    throw error;
  }
}

/**
 * Helper para ejecutar múltiples operaciones dentro de una transacción SQL (BEGIN ... COMMIT)
 * con ROLLBACK automático en caso de error.
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error al ejecutar ROLLBACK:', rollbackError);
    }
    console.error('Transacción SQL revertida por error:', error);
    throw error;
  } finally {
    client.release();
  }
}

let reconciliationColumnsReady: Promise<void> | null = null;

/**
 * Asegura de forma idempotente que la tabla `accounts` cuente con las columnas:
 * - `reconciled_balance` y `reconciled_at` (conciliación de saldos reales vs calculados)
 * - `annual_interest_rate`, `accumulated_interest` y `last_interest_date` (interés compuesto diario)
 * Configura por defecto 9.35% E.A. en las 3 cuentas Nu ('Nu', 'Nu Meridiano', 'Nu ahorros').
 */
export function ensureAccountReconciliationColumns(): Promise<void> {
  if (!reconciliationColumnsReady) {
    reconciliationColumnsReady = (async () => {
      await query(
        `ALTER TABLE accounts
         ADD COLUMN IF NOT EXISTS reconciled_balance NUMERIC(15, 2) DEFAULT NULL,
         ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
         ADD COLUMN IF NOT EXISTS annual_interest_rate NUMERIC(6, 4) NOT NULL DEFAULT 0,
         ADD COLUMN IF NOT EXISTS accumulated_interest NUMERIC(15, 2) NOT NULL DEFAULT 0,
         ADD COLUMN IF NOT EXISTS last_interest_date DATE DEFAULT NULL`
      );

      await query(
        `ALTER TABLE transactions
         ADD COLUMN IF NOT EXISTS destination_amount NUMERIC(15, 2) DEFAULT NULL`
      );

      // Inicializar 9.35% E.A. en las 3 cuentas de Nu si aún no tienen fecha de inicio de interés
      await query(
        `UPDATE accounts
         SET
           annual_interest_rate = 9.3500,
           last_interest_date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date
         WHERE LOWER(name) IN ('nu', 'nu meridiano', 'nu ahorros')
           AND annual_interest_rate = 0
           AND last_interest_date IS NULL`
      );
    })().catch((error) => {
      reconciliationColumnsReady = null;
      console.error('Error asegurando columnas de conciliación e interés en accounts:', error);
    });
  }
  return reconciliationColumnsReady;
}

export interface DailyInterestAccrualResult {
  accountId: string;
  accountName: string;
  daysApplied: number;
  interestEarned: number;
  newAccumulatedInterest: number;
  newBalance: number;
}

/**
 * Aplica el interés compuesto diario a todas las cuentas activas con `annual_interest_rate > 0`
 * y saldo positivo cuya `last_interest_date` sea anterior a la fecha actual en Colombia ('America/Bogota').
 *
 * Fórmula de Tasa Efectiva Anual (E.A.) a interés compuesto por `d` días:
 *   factor = (1 + (annual_interest_rate / 100)) ^ (d / 365) - 1
 *   interés_ganado = ROUND(current_balance * factor, 2)
 */
export async function applyDailyCompoundInterest(
  userId?: string
): Promise<DailyInterestAccrualResult[]> {
  await ensureAccountReconciliationColumns();

  // Inicializar last_interest_date en cuentas con tasa > 0 que aún tengan last_interest_date NULL
  await query(
    `UPDATE accounts
     SET last_interest_date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date
     WHERE annual_interest_rate > 0
       AND last_interest_date IS NULL
       AND ($1::text IS NULL OR user_id = $1)`,
    [userId || null]
  );

  // Aplicar capitalización compuesta diaria para las cuentas con días pendientes después de medianoche (Bogotá)
  const result = await query<{
    id: string;
    name: string;
    days_applied: number;
    interest_earned: string;
    accumulated_interest: string;
    current_balance: string;
  }>(
    `WITH pending AS (
       SELECT
         a.id,
         a.name,
         ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date - a.last_interest_date) AS days_applied,
         ROUND(
           (
             a.current_balance * (
               POWER(
                 1.0 + (a.annual_interest_rate::double precision / 100.0),
                 (((CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date - a.last_interest_date)::double precision / 365.0)
               ) - 1.0
             )
           )::numeric,
           2
         ) AS interest_earned
       FROM accounts a
       WHERE a.is_active = TRUE
         AND a.annual_interest_rate > 0
         AND a.current_balance > 0
         AND a.last_interest_date < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date
         AND ($1::text IS NULL OR a.user_id = $1)
     )
     UPDATE accounts a
     SET
       accumulated_interest = COALESCE(a.accumulated_interest, 0) + p.interest_earned,
       current_balance = a.current_balance + p.interest_earned,
       last_interest_date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date,
       updated_at = CURRENT_TIMESTAMP
     FROM pending p
     WHERE a.id = p.id
     RETURNING
       a.id,
       a.name,
       p.days_applied,
       p.interest_earned,
       a.accumulated_interest,
       a.current_balance`,
    [userId || null]
  );

  return result.rows.map((r) => ({
    accountId: r.id,
    accountName: r.name,
    daysApplied: Number(r.days_applied),
    interestEarned: Number(r.interest_earned),
    newAccumulatedInterest: Number(r.accumulated_interest),
    newBalance: Number(r.current_balance),
  }));
}


