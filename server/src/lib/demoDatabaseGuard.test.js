import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEMO_DB_NAME,
  DEMO_PORT,
  DEMO_PRODUCT_COUNT,
  demoDatabaseGuardResult,
} from './demoDatabaseGuard.js';

test('demo constants: SmartBasketDemo on 3001 with 91 products', () => {
  assert.equal(DEMO_DB_NAME, 'SmartBasketDemo');
  assert.equal(DEMO_PORT, 3001);
  assert.equal(DEMO_PRODUCT_COUNT, 91);
});

test('accepts SmartBasketDemo with 91 products', () => {
  assert.deepEqual(demoDatabaseGuardResult({ dbName: 'SmartBasketDemo', productCount: 91 }), {
    ok: true,
  });
  assert.equal(demoDatabaseGuardResult({ dbName: ' SmartBasketDemo ', productCount: '91' }).ok, true);
});

test('refuses historical SmartBasket even when the HTTP catalogue would still be 91', () => {
  const result = demoDatabaseGuardResult({ dbName: 'SmartBasket', productCount: 23220 });
  assert.equal(result.ok, false);
  assert.match(result.reason, /SmartBasket/);
});

test('refuses SmartBasketDemo with the wrong product count', () => {
  const result = demoDatabaseGuardResult({ dbName: 'SmartBasketDemo', productCount: 0 });
  assert.equal(result.ok, false);
  assert.match(result.reason, /0/);
});
