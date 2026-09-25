import test from 'node:test';
import assert from 'node:assert/strict';

import { translations } from '../i18n/translations';
import {
  DEFAULT_MAX_BASKET_QUANTITY,
  MIN_BASKET_QUANTITY,
  MAX_BASKET_QUANTITY_LIMIT,
  BASKET_CAPACITY_EXCEEDED_CODE,
  BasketCapacityError,
  basketTotalQuantity,
  extractAuthoritativeMaxFromError,
  isBasketCapacityError,
  parseAppConfig,
  parseAuthoritativeMaxBasketQuantity,
  wouldExceedBasketCapacity,
} from './appConfig';
import type { Cart } from '../types/cart';

function cart(quantities: number[]): Cart {
  return {
    items: quantities.map((q, i) => ({ id: i + 1, productId: `p${i}`, quantity: q })),
    totalQuantity: quantities.reduce((a, b) => a + b, 0),
    grandTotal: 0,
  };
}

test('client constants mirror the server contract', () => {
  assert.equal(DEFAULT_MAX_BASKET_QUANTITY, 100);
  assert.equal(MIN_BASKET_QUANTITY, 1);
  assert.equal(MAX_BASKET_QUANTITY_LIMIT, 500);
  assert.equal(BASKET_CAPACITY_EXCEEDED_CODE, 'BASKET_CAPACITY_EXCEEDED');
});

test('parseAppConfig reads the documented { data: { maxBasketQuantity: { value, source } } } shape', () => {
  const cfg = parseAppConfig({ data: { maxBasketQuantity: { value: 30, min: 1, max: 500, source: 'database' } } });
  assert.equal(cfg.maxBasketQuantity, 30);
  assert.equal(cfg.maxBasketQuantitySource, 'database');
});

test('parseAppConfig accepts a bare { maxBasketQuantity: number } and a numeric string', () => {
  assert.equal(parseAppConfig({ maxBasketQuantity: 42 }).maxBasketQuantity, 42);
  assert.equal(parseAppConfig({ data: { maxBasketQuantity: { value: '75', source: 'database' } } }).maxBasketQuantity, 75);
});

test('parseAppConfig falls back to the default for anything malformed / out of range', () => {
  for (const raw of [
    undefined, null, {}, 'nope', 42, [],
    { data: { maxBasketQuantity: { value: 0 } } },
    { data: { maxBasketQuantity: { value: 501 } } },
    { data: { maxBasketQuantity: { value: -5 } } },
    { data: { maxBasketQuantity: { value: 1.5 } } },
    { data: { maxBasketQuantity: { value: 'abc' } } },
    { data: { maxBasketQuantity: { value: NaN } } },
    { maxBasketQuantity: { value: null } },
  ]) {
    const cfg = parseAppConfig(raw);
    assert.equal(cfg.maxBasketQuantity, DEFAULT_MAX_BASKET_QUANTITY, JSON.stringify(raw));
    assert.equal(cfg.maxBasketQuantitySource, 'default');
  }
});

test('basketTotalQuantity sums line quantities and ignores junk', () => {
  assert.equal(basketTotalQuantity(cart([1, 2, 3])), 6);
  assert.equal(basketTotalQuantity(cart([])), 0);
  assert.equal(basketTotalQuantity(null), 0);
  assert.equal(basketTotalQuantity({ items: [{ id: 1, productId: 'x', quantity: NaN }] } as unknown as Cart), 0);
});

test('wouldExceedBasketCapacity: exact boundary is allowed, one over is not', () => {
  assert.equal(wouldExceedBasketCapacity(99, 1, 100), false); // -> exactly 100
  assert.equal(wouldExceedBasketCapacity(100, 1, 100), true); // -> 101
  assert.equal(wouldExceedBasketCapacity(0, 100, 100), false);
  assert.equal(wouldExceedBasketCapacity(0, 101, 100), true);
});

test('wouldExceedBasketCapacity: reductions (delta <= 0) are always allowed, even when already over', () => {
  assert.equal(wouldExceedBasketCapacity(140, 0, 100), false);
  assert.equal(wouldExceedBasketCapacity(140, -10, 100), false);
  // already over + any increase stays blocked
  assert.equal(wouldExceedBasketCapacity(140, 1, 100), true);
});

test('isBasketCapacityError recognises the client error, the server code and a 409 message', () => {
  assert.equal(isBasketCapacityError(new BasketCapacityError('x')), true);
  assert.equal(isBasketCapacityError({ code: 'BASKET_CAPACITY_EXCEEDED' }), true);
  assert.equal(isBasketCapacityError({ status: 409, message: 'This basket is limited to 100 items in total.' }), true);
  assert.equal(isBasketCapacityError(new Error('network request failed')), false);
  assert.equal(isBasketCapacityError({ status: 400, message: 'bad' }), false);
});

test('errors.basketCapacity exists in EN + FR with a {{max}} placeholder', () => {
  for (const lang of ['en', 'fr'] as const) {
    const s = translations[lang]['errors.basketCapacity'];
    assert.ok(typeof s === 'string' && s.trim().length > 0, lang);
    assert.match(s, /\{\{max\}\}/, `${lang} keeps the {{max}} placeholder`);
  }
});

test('errors.basketCapacityGeneric (the acceptable fallback) exists in EN + FR and never carries a number placeholder', () => {
  for (const lang of ['en', 'fr'] as const) {
    const s = translations[lang]['errors.basketCapacityGeneric'];
    assert.ok(typeof s === 'string' && s.trim().length > 0, lang);
    assert.doesNotMatch(s, /\{\{.*\}\}/, `${lang} must not reference an unavailable number`);
  }
});

// --- reading the server's value (never show a stale cached number) ---

test('parseAuthoritativeMaxBasketQuantity accepts a positive integer in range, rejects everything else', () => {
  assert.equal(parseAuthoritativeMaxBasketQuantity(2), 2);
  assert.equal(parseAuthoritativeMaxBasketQuantity('50'), 50);
  assert.equal(parseAuthoritativeMaxBasketQuantity(500), 500);
  for (const bad of [0, -1, 1.5, 501, 'abc', null, undefined, NaN, {}, []]) {
    assert.equal(parseAuthoritativeMaxBasketQuantity(bad), null, JSON.stringify(bad));
  }
});

test('extractAuthoritativeMaxFromError reads details.maxBasketQuantity from a server 409, validated', () => {
  assert.equal(
    extractAuthoritativeMaxFromError({ status: 409, code: 'BASKET_CAPACITY_EXCEEDED', details: { maxBasketQuantity: 2 } }),
    2,
  );
  // A bogus/invalid details value must not be trusted either.
  assert.equal(
    extractAuthoritativeMaxFromError({ status: 409, details: { maxBasketQuantity: 'not-a-number' } }),
    null,
  );
});

test('extractAuthoritativeMaxFromError returns null (never a guess) when details are unavailable', () => {
  assert.equal(extractAuthoritativeMaxFromError({ status: 409, message: 'This basket is limited to 100 items in total.' }), null);
  assert.equal(extractAuthoritativeMaxFromError(new Error('plain error')), null);
  assert.equal(extractAuthoritativeMaxFromError(null), null);
  assert.equal(extractAuthoritativeMaxFromError('not an object'), null);
});

test('BasketCapacityError carries the server maxBasketQuantity it was built with (or null)', () => {
  const withMax = new BasketCapacityError('limited to 2', 2);
  assert.equal(withMax.maxBasketQuantity, 2);
  const withoutMax = new BasketCapacityError('basket is full');
  assert.equal(withoutMax.maxBasketQuantity, null);
});
