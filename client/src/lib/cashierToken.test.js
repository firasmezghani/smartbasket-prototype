import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCashierToken, SMART_BASKET_QR_PREFIX } from './cashierToken.js';

test('prefix constant is the documented QR prefix', () => {
  assert.equal(SMART_BASKET_QR_PREFIX, 'SMART_BASKET:');
});

test('strips a leading SMART_BASKET: prefix, any case, with surrounding whitespace', () => {
  assert.equal(normalizeCashierToken('SMART_BASKET:abc123'), 'abc123');
  assert.equal(normalizeCashierToken('smart_basket:abc123'), 'abc123');
  assert.equal(normalizeCashierToken('  SMART_BASKET: abc123  '), 'abc123');
  assert.equal(normalizeCashierToken('Smart_Basket:  TOKEN-xyz '), 'TOKEN-xyz');
});

test('passes a bare token through unchanged', () => {
  assert.equal(normalizeCashierToken('abc123'), 'abc123');
  assert.equal(normalizeCashierToken('  abc123 '), 'abc123');
});

test('only a LEADING prefix is stripped', () => {
  assert.equal(normalizeCashierToken('x-SMART_BASKET:abc'), 'x-SMART_BASKET:abc');
});

test('empty / nullish input yields an empty string', () => {
  assert.equal(normalizeCashierToken(''), '');
  assert.equal(normalizeCashierToken('   '), '');
  assert.equal(normalizeCashierToken(null), '');
  assert.equal(normalizeCashierToken(undefined), '');
  assert.equal(normalizeCashierToken('SMART_BASKET:'), '');
  assert.equal(normalizeCashierToken('SMART_BASKET:   '), '');
});
