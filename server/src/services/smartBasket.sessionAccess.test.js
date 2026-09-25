import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countSessionUnitsAndProducts,
  describeSessionSuperseded,
  parsePositiveSessionId,
  sessionRowOwnedByCustomer,
} from './smartBasket.sessionAccess.js';

test('parsePositiveSessionId accepts a strict positive integer', () => {
  assert.equal(parsePositiveSessionId(12), 12);
  assert.equal(parsePositiveSessionId('12'), 12);
  assert.equal(parsePositiveSessionId(' 7 '), 7);
});

test('parsePositiveSessionId rejects current, zero, and non-integers', () => {
  assert.equal(parsePositiveSessionId('current'), null);
  assert.equal(parsePositiveSessionId('0'), null);
  assert.equal(parsePositiveSessionId('-1'), null);
  assert.equal(parsePositiveSessionId('12abc'), null);
  assert.equal(parsePositiveSessionId('1.5'), null);
  assert.equal(parsePositiveSessionId(''), null);
  assert.equal(parsePositiveSessionId(null), null);
});

test('ownership requires the same positive customer id', () => {
  assert.equal(sessionRowOwnedByCustomer({ customerId: 63 }, 63), true);
  assert.equal(sessionRowOwnedByCustomer({ CustomerId: 63 }, 63), true);
  assert.equal(sessionRowOwnedByCustomer({ customerId: 62 }, 63), false);
  assert.equal(sessionRowOwnedByCustomer({ customerId: 63 }, 99), false);
  assert.equal(sessionRowOwnedByCustomer(null, 63), false);
});

test('superseded is only a cancelled session with a strictly newer id', () => {
  assert.deepEqual(describeSessionSuperseded({ status: 'cancelled', sessionId: 10, newerSessionId: 11 }), {
    superseded: true,
    newerSessionId: 11,
  });
  assert.equal(describeSessionSuperseded({ status: 'validated', sessionId: 10, newerSessionId: 11 }).superseded, false);
  assert.equal(describeSessionSuperseded({ status: 'cancelled', sessionId: 10, newerSessionId: 10 }).superseded, false);
  assert.equal(describeSessionSuperseded({ status: 'cancelled', sessionId: 10, newerSessionId: null }).superseded, false);
});

test('unit and product counts ignore another session payload', () => {
  const counts = countSessionUnitsAndProducts([
    { productId: 'A', quantity: 2 },
    { productId: 'a', quantity: 1 },
    { productId: 'B', quantity: 3 },
  ]);
  assert.deepEqual(counts, { itemCount: 6, uniqueProductCount: 2 });
});
