#!/usr/bin/env node
// Starts a second API on SmartBasketDemo with its own database, port and host settings.
import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(serverRoot, '.env') });

const childEnv = {
  ...process.env,
  DB_NAME: 'SmartBasketDemo',
  PORT: process.env.DEMO_API_PORT || '3002',
  HOST: process.env.DEMO_API_HOST || '127.0.0.1',
  CATALOGUE_MODE: process.env.DEMO_CATALOGUE_MODE || process.env.CATALOGUE_MODE || 'curated',
};

const child = spawn(process.execPath, ['src/server.js'], {
  cwd: serverRoot,
  env: childEnv,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
