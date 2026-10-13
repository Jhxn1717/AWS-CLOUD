/**
 * database.ts
 * PostgreSQL connection pool for the administrative database (mycloud_platform).
 * All application queries use this pool.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from './env';

// Singleton pool instance
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      ...(config.DATABASE_URL
        ? { connectionString: config.DATABASE_URL }
        : {
            host: config.DB_HOST,
            port: config.DB_PORT,
            database: config.DB_NAME,
            user: config.DB_USER,
            password: config.DB_PASSWORD,
          }),
      ssl: config.DB_SSL ? { rejectUnauthorized: true } : undefined,
      max: process.env.VERCEL === '1' ? Math.min(config.DB_POOL_MAX, 1) : config.DB_POOL_MAX,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

/**
 * Run a single parameterized query.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const db = getPool();
  return db.query<T>(sql, params);
}

/**
 * Run multiple queries inside a single transaction.
 * Automatically rolls back on error.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Verify connectivity at startup.
 */
export async function testConnection(): Promise<void> {
  const client = await getPool().connect();
  try {
    const res = await client.query('SELECT current_database(), NOW()');
    const { current_database, now } = res.rows[0];
    console.log(`[DB] Connected → database="${current_database}"  time=${now}`);
  } finally {
    client.release();
  }
}

/**
 * Graceful shutdown.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[DB] Pool closed');
  }
}
