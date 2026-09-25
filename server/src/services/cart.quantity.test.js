import test from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../utils/AppError.js';
import {
  parseCartQuantityInput,
  MAX_CART_LINE_QUANTITY,
  INVALID_CART_QUANTITY_CODE,
} from './cart.service.js';

// An invalid quantity is rejected (400, INVALID_CART_QUANTITY), not turned into 1.
// The default of 1 is only used when the field is missing and `allowOmitted` is set.

test('documented bound + stable code', () => {
  assert.equal(MAX_CART_LINE_QUANTITY, 1000);
  assert.equal(INVALID_CART_QUANTITY_CODE, 'INVALID_CART_QUANTITY');
});

test('omitted (undefined) defaults to 1 only when allowOmitted is true', () => {
  assert.equal(parseCartQuantityInput(undefined, { allowOmitted: true }), 1);
  assert.throws(
    () => parseCartQuantityInput(undefined, { allowOmitted: false }),
    (err) => err instanceof AppError && err.statusCode === 400 && err.code === 'INVALID_CART_QUANTITY',
  );
  // default option is allowOmitted: false
  assert.throws(() => parseCartQuantityInput(undefined));
});

test('valid quantities: integers and digit-only strings within the bound', () => {
  assert.equal(parseCartQuantityInput(1, { allowOmitted: true }), 1);
  assert.equal(parseCartQuantityInput(42), 42);
  assert.equal(parseCartQuantityInput(MAX_CART_LINE_QUANTITY), MAX_CART_LINE_QUANTITY);
  assert.equal(parseCartQuantityInput('7'), 7);
  assert.equal(parseCartQuantityInput('  3 '), 3);
  assert.equal(parseCartQuantityInput('007'), 7);
});

test('explicitly invalid quantities are rejected, never coerced to 1 — even when omission is allowed', () => {
  const bad = [
    null, '', '   ', 0, '0', -1, '-1', -100,
    1.5, '1.5', '2.0', NaN, Infinity, -Infinity,
    '1e3', '0x10', 'abc', '12abc', true, false, {}, [], [5],
    MAX_CART_LINE_QUANTITY + 1, String(MAX_CART_LINE_QUANTITY + 1),
  ];
  for (const value of bad) {
    for (const allowOmitted of [true, false]) {
      assert.throws(
        () => parseCartQuantityInput(value, { allowOmitted }),
        (err) =>
          err instanceof AppError &&
          err.statusCode === 400 &&
          err.code === 'INVALID_CART_QUANTITY' &&
          err.details?.max === MAX_CART_LINE_QUANTITY,
        `expected ${JSON.stringify(value)} (allowOmitted=${allowOmitted}) to be rejected, never defaulted to 1`,
      );
    }
  }
});

test('the invalid-quantity error message does not leak SQL detail', () => {
  try {
    parseCartQuantityInput('abc');
    assert.fail('expected a throw');
  } catch (err) {
    assert.doesNotMatch(err.message, /SELECT|SB_CartItems|dbo\./i);
  }
});
