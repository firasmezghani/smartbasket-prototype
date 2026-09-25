import os from 'node:os';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { closePool } from './config/db.js';

const app = createApp();

// IPv4 addresses a phone on the same Wi-Fi can use to reach this server.
function lanIPv4Addresses() {
  const out = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (info.address.startsWith('169.254.')) continue;
      out.push(info.address);
    }
  }
  return out;
}

const server = app.listen(env.PORT, env.HOST, () => {
  const boundToAll = env.HOST === '0.0.0.0' || env.HOST === '::';
  console.log(`API listening on port ${env.PORT} (bind host ${env.HOST})`);
  console.log(`  local:  http://127.0.0.1:${env.PORT}`);
  if (boundToAll) {
    const lan = lanIPv4Addresses();
    if (lan.length === 0) {
      console.log('  LAN:    (no external IPv4 interface detected — connect to Wi-Fi for device access)');
    }
    for (const address of lan) {
      console.log(
        `  LAN:    http://${address}:${env.PORT}   ` +
          `(set mobile EXPO_PUBLIC_API_BASE_URL to this for a physical phone)`,
      );
    }
  } else {
    console.log(`  Bound to ${env.HOST} only — not reachable from other devices. Set HOST=0.0.0.0 to allow LAN access.`);
  }
});

async function shutdown(signal) {
  console.info(`${signal} received, shutting down`);
  server.close();
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
