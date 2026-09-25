import test from 'node:test';
import assert from 'node:assert/strict';

import { STALE_BASKET_THRESHOLD_MS, isStaleBasket } from './basketFreshness';

const HOUR = 60 * 60 * 1000;

test('threshold mirrors the server default (24h)', () => {
  assert.equal(STALE_BASKET_THRESHOLD_MS, 24 * HOUR);
});

test('the server verdict wins when present', () => {
  assert.equal(isStaleBasket({ stale: true, lastActivityAt: new Date().toISOString() }), true);
  assert.equal(
    isStaleBasket({ stale: false, lastActivityAt: '2000-01-01T00:00:00.000Z' }),
    false,
  );
});

test('fallback: compares lastActivityAt age against the threshold', () => {
  const now = Date.parse('2026-09-06T00:00:00.000Z');
  assert.equal(isStaleBasket({ lastActivityAt: '2026-09-04T00:00:00.000Z', now }), true);
  assert.equal(isStaleBasket({ lastActivityAt: '2026-09-05T06:00:00.000Z', now }), false);
  assert.equal(isStaleBasket({ lastActivityAt: '2026-09-05T00:00:00.000Z', now }), true); // exactly 24h
});

test('missing / invalid / future data is never treated as stale', () => {
  const now = Date.parse('2026-09-06T00:00:00.000Z');
  assert.equal(isStaleBasket({ now }), false);
  assert.equal(isStaleBasket({ lastActivityAt: null, now }), false);
  assert.equal(isStaleBasket({ lastActivityAt: '', now }), false);
  assert.equal(isStaleBasket({ lastActivityAt: 'not-a-date', now }), false);
  assert.equal(isStaleBasket({ lastActivityAt: '2026-09-07T00:00:00.000Z', now }), false);
});

test('custom positive threshold honoured; junk threshold falls back to default', () => {
  const now = Date.parse('2026-09-06T00:00:00.000Z');
  assert.equal(
    isStaleBasket({ lastActivityAt: '2026-09-05T20:00:00.000Z', now, thresholdMs: HOUR }),
    true,
  );
  assert.equal(
    isStaleBasket({ lastActivityAt: '2026-09-05T12:00:00.000Z', now, thresholdMs: 0 }),
    false,
  );
});

test('no argument object does not throw', () => {
  assert.equal(isStaleBasket(), false);
});
