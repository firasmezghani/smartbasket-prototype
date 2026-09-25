#!/usr/bin/env node
// Starts the API on SmartBasketDemo (port 3001) after checking the database.
import dotenv from 'dotenv';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

import {
  DEMO_DB_NAME,
  DEMO_PORT,
  DEMO_PRODUCT_COUNT,
  demoDatabaseGuardResult,
} from '../src/lib/demoDatabaseGuard.js';

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(serverRoot, '.env') });

process.env.DB_NAME = DEMO_DB_NAME;
process.env.PORT = String(DEMO_PORT);

function boolEnv(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function intEnv(name, fallback) {
  const v = parseInt(process.env[name], 10);
  return Number.isNaN(v) ? fallback : v;
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

async function verifyDemoDatabase() {
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_SERVER,
    port: intEnv('DB_PORT', 1433),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: DEMO_DB_NAME,
    options: {
      encrypt: boolEnv('DB_ENCRYPT', true),
      trustServerCertificate: boolEnv('DB_TRUST_SERVER_CERTIFICATE', true),
    },
    connectionTimeout: intEnv('DB_CONNECTION_TIMEOUT_MS', 15_000),
    requestTimeout: intEnv('DB_REQUEST_TIMEOUT_MS', 30_000),
  }).connect();

  try {
    const result = await pool.request().query(`
      SELECT DB_NAME() AS dbName,
             (SELECT COUNT(*) FROM dbo.SB_Products) AS productCount
    `);
    const row = result.recordset[0] ?? {};
    return demoDatabaseGuardResult({
      dbName: row.dbName,
      productCount: row.productCount,
    });
  } finally {
    await pool.close();
  }
}

if (await portInUse(DEMO_PORT)) {
  console.error(
    `Refusing to start: port ${DEMO_PORT} is already in use. Stop the other API first so only one process serves the demonstration.`,
  );
  process.exit(1);
}

let guard;
try {
  guard = await verifyDemoDatabase();
} catch (err) {
  console.error('Refusing to start: could not verify SmartBasketDemo.');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

if (!guard.ok) {
  console.error(`Refusing to start: ${guard.reason}.`);
  process.exit(1);
}

console.log(
  `Demo database verified: ${DEMO_DB_NAME} (${DEMO_PRODUCT_COUNT} products). Starting API on port ${DEMO_PORT}.`,
);

const child = spawn(process.execPath, ['--watch', 'src/server.js'], {
  cwd: serverRoot,
  env: {
    ...process.env,
    DB_NAME: DEMO_DB_NAME,
    PORT: String(DEMO_PORT),
  },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
