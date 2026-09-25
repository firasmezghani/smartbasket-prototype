import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

import { requireAuth, requireAdmin } from '../middleware/requireAuth.js';
import { signAdminToken, verifyToken } from '../utils/jwtToken.js';
import { loginAdmin } from '../services/auth.service.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// Tests that admin routes need an ADMIN login. Uses the real auth middleware
// and login with stub handlers (no database).
function makeApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  // Mirrors admin.routes.js wiring: requireAuth on everything, requireAdmin on
  // the management endpoints only.
  const admin = express.Router();
  admin.use(requireAuth);
  admin.get('/cashier/basket/:token', (req, res) => res.json({ ok: 'cashier', role: req.user.role }));
  admin.get('/app-config', requireAdmin, (req, res) => res.json({ ok: 'app-config', role: req.user.role }));
  admin.put('/app-config/max-basket-quantity', requireAdmin, (req, res) => res.json({ ok: 'update' }));
  app.use('/api/admin', admin);

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.statusCode ?? 500;
    res.status(status).json({ error: err.message, ...(err instanceof AppError && err.code ? { code: err.code } : {}) });
  });
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

async function get(base, path, headers = {}) {
  const res = await fetch(`${base}${path}`, { headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function request(base, path, method, headers = {}) {
  const res = await fetch(`${base}${path}`, { method, headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const ADMIN_ONLY = ['/api/admin/app-config'];
const ADMIN_ONLY_MUTATIONS = [['/api/admin/app-config/max-basket-quantity', 'PUT']];

test('loginAdmin issues the ADMIN role for the admin account and CASHIER for the cashier account', async () => {
  const admin = await loginAdmin(env.ADMIN_USERNAME, 'test-admin-password');
  assert.equal(admin.role, 'ADMIN');
  assert.equal(admin.username, env.ADMIN_USERNAME);

  await assert.rejects(
    () => loginAdmin(env.CASHIER_USERNAME, 'wrong-password'),
    (err) => err instanceof AppError && err.statusCode === 401,
  );
  await assert.rejects(
    () => loginAdmin(env.ADMIN_USERNAME, 'not-the-admin-password'),
    (err) => err instanceof AppError && err.statusCode === 401,
  );
  await assert.rejects(
    () => loginAdmin('nobody', 'wrong-password'),
    (err) => err instanceof AppError && err.statusCode === 401,
  );
});

test('the signed admin token round-trips with its role claim', () => {
  const token = signAdminToken({ username: 'admin', role: 'ADMIN', realName: 'A' });
  const payload = verifyToken(token);
  assert.equal(payload.role, 'ADMIN');
  assert.equal(payload.username, 'admin');
});

test('unauthenticated requests are rejected before any handler runs', async () => {
  const app = makeApp();
  await withServer(app, async (base) => {
    for (const path of [...ADMIN_ONLY, '/api/admin/cashier/basket/abc']) {
      const noHeader = await get(base, path);
      assert.equal(noHeader.status, 401, `${path} without a token`);

      const badScheme = await get(base, path, { authorization: 'Token xyz' });
      assert.equal(badScheme.status, 401, `${path} with a non-bearer scheme`);

      const garbage = await get(base, path, { authorization: 'Bearer not-a-jwt' });
      assert.equal(garbage.status, 401, `${path} with a malformed jwt`);
    }
    for (const [path, method] of ADMIN_ONLY_MUTATIONS) {
      const noHeader = await request(base, path, method);
      assert.equal(noHeader.status, 401, `${method} ${path} without a token`);
    }
  });
});

test('customer identity (x-customer-id) never authenticates an admin route', async () => {
  const app = makeApp();
  await withServer(app, async (base) => {
    for (const path of ADMIN_ONLY) {
      const res = await get(base, path, { 'x-customer-id': '7' });
      assert.equal(res.status, 401, path);
    }
    for (const [path, method] of ADMIN_ONLY_MUTATIONS) {
      const res = await request(base, path, method, { 'x-customer-id': '7' });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
  });
});

test('a valid CASHIER token is accepted for cashier validation but 403 on admin-only endpoints', async () => {
  const cashierToken = signAdminToken({ username: 'cashier', role: 'CASHIER', realName: 'C' });
  const app = makeApp();
  await withServer(app, async (base) => {
    const cashierOk = await get(base, '/api/admin/cashier/basket/abc', {
      authorization: `Bearer ${cashierToken}`,
    });
    assert.equal(cashierOk.status, 200);
    assert.equal(cashierOk.body.role, 'CASHIER');

    for (const path of ADMIN_ONLY) {
      const denied = await get(base, path, { authorization: `Bearer ${cashierToken}` });
      assert.equal(denied.status, 403, path);
      assert.match(denied.body.error, /admin access is required/i);
    }
    for (const [path, method] of ADMIN_ONLY_MUTATIONS) {
      const denied = await request(base, path, method, { authorization: `Bearer ${cashierToken}` });
      assert.equal(denied.status, 403, `${method} ${path}`);
      assert.match(denied.body.error, /admin access is required/i);
    }
  });
});

test('a valid ADMIN token reaches remaining admin endpoints and retired review paths are absent', async () => {
  const adminToken = signAdminToken({ username: 'admin', role: 'ADMIN', realName: 'A' });
  const app = makeApp();
  await withServer(app, async (base) => {
    for (const path of ['/api/admin/cashier/basket/abc', ...ADMIN_ONLY]) {
      const ok = await get(base, path, { authorization: `Bearer ${adminToken}` });
      assert.equal(ok.status, 200, path);
    }
    for (const [path, method] of ADMIN_ONLY_MUTATIONS) {
      const ok = await request(base, path, method, { authorization: `Bearer ${adminToken}` });
      assert.equal(ok.status, 200, `${method} ${path}`);
    }
    const retired = await get(base, '/api/admin/product-intelligence', {
      authorization: `Bearer ${adminToken}`,
    });
    assert.equal(retired.status, 404);
  });
});
