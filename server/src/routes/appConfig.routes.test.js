import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

import { appConfigRoutes } from './appConfig.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { DEFAULT_MAX_BASKET_QUANTITY } from '../services/appConfig.service.js';
import { closePool } from '../config/db.js';

// Close the database pool at the end so the test process can exit.
after(async () => {
  await closePool();
});

// The public app-config endpoint always returns a usable value. Without a
// database it falls back to the default and reports source = 'default'.
function makeApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api/app-config', appConfigRoutes);
  app.use(errorHandler);
  return app;
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('GET /api/app-config returns the deterministic default when no config row is available', async () => {
  await withServer(makeApp(), async (base) => {
    const res = await fetch(`${base}/api/app-config`);
    assert.equal(res.status, 200);
    const body = await res.json();
    const mbq = body.data.maxBasketQuantity;
    assert.equal(mbq.min, 1);
    assert.equal(mbq.max, 500);
    assert.ok(['database', 'default'].includes(mbq.source));
    assert.ok(Number.isInteger(mbq.value) && mbq.value >= 1 && mbq.value <= 500);
    // With no migration applied in the test environment the row is absent and
    // the service returns the documented default deterministically.
    if (mbq.source === 'default') {
      assert.equal(mbq.value, DEFAULT_MAX_BASKET_QUANTITY);
    }
    // No auth needed; nothing sensitive leaks.
    const blob = JSON.stringify(body);
    assert.doesNotMatch(blob, /SELECT|SB_AppConfig|password|stack/i);
  });
});

test('GET /api/app-config needs no authentication header', async () => {
  await withServer(makeApp(), async (base) => {
    const res = await fetch(`${base}/api/app-config`, { headers: { 'x-customer-id': '5' } });
    assert.equal(res.status, 200);
  });
});
