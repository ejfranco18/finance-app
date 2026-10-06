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

export const pool = new Pool({
  connectionString: rawDatabaseUrl,
  ssl: {
    rejectUnauthorized: true,
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Error inesperado en un cliente inactivo del Pool de PostgreSQL:', err);
});

/**
 * Helper para ejecutar consultas parametrizadas con manejo y registro automático de errores.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params);
  } catch (error) {
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
