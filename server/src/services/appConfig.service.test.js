import test from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../utils/AppError.js';
import {
  DEFAULT_MAX_BASKET_QUANTITY,
  MIN_BASKET_QUANTITY,
  MAX_BASKET_QUANTITY_LIMIT,
  MAX_BASKET_QUANTITY_KEY,
  parseBasketQuantitySetting,
  coerceStoredBasketQuantity,
  resolveMaxBasketQuantityConfig,
  defaultMaxBasketQuantityConfig,
} from './appConfig.service.js';

test('documented contract: default 100, range 1..500, key max_basket_quantity', () => {
  assert.equal(DEFAULT_MAX_BASKET_QUANTITY, 100);
  assert.equal(MIN_BASKET_QUANTITY, 1);
  assert.equal(MAX_BASKET_QUANTITY_LIMIT, 500);
  assert.equal(MAX_BASKET_QUANTITY_KEY, 'max_basket_quantity');
});

test('parseBasketQuantitySetting accepts integers and digit strings inside the range', () => {
  assert.equal(parseBasketQuantitySetting(1), 1);
  assert.equal(parseBasketQuantitySetting(100), 100);
  assert.equal(parseBasketQuantitySetting(500), 500);
  assert.equal(parseBasketQuantitySetting('1'), 1);
  assert.equal(parseBasketQuantitySetting('250'), 250);
  assert.equal(parseBasketQuantitySetting('  42 '), 42);
  assert.equal(parseBasketQuantitySetting('007'), 7);
});

test('parseBasketQuantitySetting rejects everything else with AppError 400 + INVALID_BASKET_CAPACITY', () => {
  const bad = [
    null, undefined, '', '   ', 0, '0', -1, '-1', 501, '501', 1000, 1.5, '1.5', '2.0',
    NaN, Infinity, -Infinity, '1e3', '0x10', 'abc', '12abc', true, false, {}, [], [5],
  ];
  for (const value of bad) {
    assert.throws(
      () => parseBasketQuantitySetting(value),
      (err) => err instanceof AppError && err.statusCode === 400 && err.code === 'INVALID_BASKET_CAPACITY',
      `expected ${JSON.stringify(value)} to be rejected`,
    );
  }
});

test('coerceStoredBasketQuantity is lenient and returns null for unusable stored values', () => {
  assert.equal(coerceStoredBasketQuantity('100'), 100);
  assert.equal(coerceStoredBasketQuantity(250), 250);
  assert.equal(coerceStoredBasketQuantity('1'), 1);
  for (const value of [null, undefined, '', 'abc', '0', 0, -5, '600', 600, 1.5, '1.5', {}, []]) {
    assert.equal(coerceStoredBasketQuantity(value), null, `expected ${JSON.stringify(value)} -> null`);
  }
});

test('resolveMaxBasketQuantityConfig: absent row -> deterministic default, source "default"', () => {
  for (const row of [null, undefined, {}, { ConfigValue: null }, { ConfigValue: 'oops' }, { ConfigValue: '900' }]) {
    const cfg = resolveMaxBasketQuantityConfig(row);
    assert.equal(cfg.value, 100);
    assert.equal(cfg.source, 'default');
    assert.equal(cfg.min, 1);
    assert.equal(cfg.max, 500);
    assert.equal(cfg.updatedAt, null);
    assert.equal(cfg.updatedBy, null);
  }
  assert.deepEqual(resolveMaxBasketQuantityConfig(null), defaultMaxBasketQuantityConfig());
});

test('resolveMaxBasketQuantityConfig: valid row -> database source + audit fields', () => {
  const cfg = resolveMaxBasketQuantityConfig({
    ConfigValue: '30',
    UpdatedAt: new Date('2026-09-04T10:00:00.000Z'),
    UpdatedBy: 'admin',
  });
  assert.equal(cfg.value, 30);
  assert.equal(cfg.source, 'database');
  assert.equal(cfg.updatedAt, '2026-09-04T10:00:00.000Z');
  assert.equal(cfg.updatedBy, 'admin');
});
