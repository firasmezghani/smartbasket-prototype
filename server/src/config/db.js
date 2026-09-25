import sql from 'mssql';
import { env } from './env.js';

let poolPromise = null;

export function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool({
      server: env.DB_SERVER,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      options: {
        encrypt: env.DB_ENCRYPT,
        trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30_000,
      },
      connectionTimeout: env.DB_CONNECTION_TIMEOUT_MS,
      requestTimeout: env.DB_REQUEST_TIMEOUT_MS,
    })
      .connect()
      .catch((err) => {
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
}

// Close the connection pool (used by tests and on shutdown).
export async function closePool() {
  if (!poolPromise) return;
  try {
    const pool = await poolPromise;
    await pool.close();
  } finally {
    poolPromise = null;
  }
}
