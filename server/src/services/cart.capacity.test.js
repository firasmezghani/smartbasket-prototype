import test from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../utils/AppError.js';
import {
  assertProjectedWithinCapacity,
  BASKET_CAPACITY_EXCEEDED_CODE,
  planBasketLocks,
} from './cart.service.js';

// Unit tests for the server's basket-limit check. The cart service runs it
// inside a locked transaction; cart.concurrency.integration.test.js tests that part.

test('stable machine-readable code', () => {
  assert.equal(BASKET_CAPACITY_EXCEEDED_CODE, 'BASKET_CAPACITY_EXCEEDED');
});

test('the server limit is echoed in details.maxBasketQuantity (never a client-cached number)', () => {
  try {
    assertProjectedWithinCapacity(3, 2);
    assert.fail('expected a throw');
  } catch (err) {
    assert.equal(err.details?.maxBasketQuantity, 2);
  }
});

test('exact boundary: a projected total equal to the limit is allowed', () => {
  assert.doesNotThrow(() => assertProjectedWithinCapacity(100, 100));
  assert.doesNotThrow(() => assertProjectedWithinCapacity(1, 1));
  assert.doesNotThrow(() => assertProjectedWithinCapacity(0, 100));
});

test('over the limit by one unit is a 409 with BASKET_CAPACITY_EXCEEDED', () => {
  assert.throws(
    () => assertProjectedWithinCapacity(101, 100),
    (err) =>
      err instanceof AppError &&
      err.statusCode === 409 &&
      err.code === 'BASKET_CAPACITY_EXCEEDED' &&
      /limited to 100 items/i.test(err.message),
  );
});

test('already-over-limit: any further increase stays blocked', () => {
  // The basket holds 120 units and the limit is 100, so adding 1 more is still blocked.
  assert.throws(
    () => assertProjectedWithinCapacity(121, 100),
    (err) => err instanceof AppError && err.statusCode === 409,
  );
  // Reducing from 120 -> 118 would project to 118; callers only invoke the
  // check on an increase, so this value is never passed. Documented behaviour:
  assert.doesNotThrow(() => assertProjectedWithinCapacity(118, 200));
});

test('the error message does not leak SQL or schema detail', () => {
  try {
    assertProjectedWithinCapacity(999, 100);
    assert.fail('expected a throw');
  } catch (err) {
    assert.doesNotMatch(err.message, /SELECT|SB_CartItems|dbo\.|TabStock/i);
  }
});

// --- planBasketLocks: sorted order and duplicate check ---

test('planBasketLocks requires at least one identity', () => {
  assert.throws(() => planBasketLocks([]), /at least one basket identity/i);
  assert.throws(() => planBasketLocks(null), /at least one basket identity/i);
});

test('planBasketLocks names each identity and orders them deterministically', () => {
  const customer = { customerId: 7, sessionId: null };
  const guest = { customerId: null, sessionId: 'abc123' };
  const plan = planBasketLocks([customer, guest]);
  assert.deepEqual(
    plan.map((p) => p.lockName),
    ['cart:customer:7', 'cart:session:abc123'], // "customer" < "session" lexicographically
  );
  assert.equal(plan[0].identity, customer);
  assert.equal(plan[1].identity, guest);
});

test('planBasketLocks produces the same order regardless of input order (the deadlock-avoidance property)', () => {
  const customer = { customerId: 7, sessionId: null };
  const guest = { customerId: null, sessionId: 'abc123' };
  const forward = planBasketLocks([customer, guest]).map((p) => p.lockName);
  const reversed = planBasketLocks([guest, customer]).map((p) => p.lockName);
  assert.deepEqual(forward, reversed);
});

test('planBasketLocks sorts three-or-more locks deterministically too', () => {
  const a = { customerId: 9, sessionId: null };
  const b = { customerId: 2, sessionId: null };
  const c = { customerId: null, sessionId: 'zzz' };
  const plan = planBasketLocks([a, b, c]).map((p) => p.lockName);
  assert.deepEqual(plan, ['cart:customer:2', 'cart:customer:9', 'cart:session:zzz']);
});

test('planBasketLocks rejects a duplicate resource name instead of silently locking once', () => {
  const guestA = { customerId: null, sessionId: 'same-session' };
  const guestB = { customerId: null, sessionId: 'same-session' };
  assert.throws(() => planBasketLocks([guestA, guestB]), /duplicate lock resource/i);

  // Same customer expressed twice is a duplicate too, even as distinct objects.
  const cust1 = { customerId: 5, sessionId: null };
  const cust2 = { customerId: 5, sessionId: null };
  assert.throws(() => planBasketLocks([cust1, cust2]), /duplicate lock resource/i);
});

test('single-identity plans behave like the original single-lock helper', () => {
  const identity = { customerId: 3, sessionId: null };
  const plan = planBasketLocks([identity]);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].lockName, 'cart:customer:3');
});
