import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

test('GET session by id is customer-owned, includes terminal states, and never returns TokenHash', () => {
  const service = readFileSync(join(root, 'smartBasket.service.js'), 'utf8');
  const start = service.indexOf('export async function getSessionForCustomer');
  const end = service.indexOf('export async function getCurrentSessionForCustomer');
  assert.ok(start >= 0 && end > start);
  const fn = service.slice(start, end);
  assert.match(fn, /WHERE Id = @id AND CustomerId = @customerId/);
  assert.match(fn, /sessionRowOwnedByCustomer/);
  assert.match(fn, /expireSessionIfNeeded/);
  assert.match(fn, /describeSessionSuperseded/);
  assert.doesNotMatch(fn, /TokenHash/);
  assert.doesNotMatch(fn, /plainToken/);
  assert.doesNotMatch(fn, /formatSmartBasketQrValue/);

  const routes = readFileSync(join(root, '../routes/smartBasket.routes.js'), 'utf8');
  const currentIdx = routes.indexOf("smartBasketRoutes.get('/session/current'");
  const idIdx = routes.indexOf("smartBasketRoutes.get('/session/:id'");
  assert.ok(currentIdx >= 0 && idIdx > currentIdx, '/session/current must be registered before /session/:id');
});
