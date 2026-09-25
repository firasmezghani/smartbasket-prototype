import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STALE_BASKET_THRESHOLD_MS,
  resolveLastActivityAt,
  basketAgeMs,
  isBasketStale,
  summariseBasketActivity,
} from './basketActivity.js';

const HOUR = 60 * 60 * 1000;

test('STALE_BASKET_THRESHOLD_MS is 24 hours', () => {
  assert.equal(STALE_BASKET_THRESHOLD_MS, 24 * HOUR);
});

test('resolveLastActivityAt: empty / non-array basket has no activity timestamp', () => {
  assert.equal(resolveLastActivityAt([]), null);
  assert.equal(resolveLastActivityAt(null), null);
  assert.equal(resolveLastActivityAt(undefined), null);
});

test('resolveLastActivityAt: picks the newest of updatedAt/createdAt across lines', () => {
  const items = [
    { createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' },
    { createdAt: '2026-09-02T08:00:00.000Z', updatedAt: '2026-09-03T09:30:00.000Z' },
    { createdAt: '2026-09-02T20:00:00.000Z' },
  ];
  assert.equal(resolveLastActivityAt(items), '2026-09-03T09:30:00.000Z');
});

test('resolveLastActivityAt: a line with only createdAt still counts', () => {
  const items = [{ createdAt: '2026-09-05T12:00:00.000Z' }];
  assert.equal(resolveLastActivityAt(items), '2026-09-05T12:00:00.000Z');
});

test('resolveLastActivityAt: unparseable timestamps are ignored, not guessed', () => {
  assert.equal(resolveLastActivityAt([{ createdAt: 'not-a-date', updatedAt: null }]), null);
  const mixed = [
    { createdAt: 'garbage' },
    { createdAt: '2026-09-04T00:00:00.000Z' },
  ];
  assert.equal(resolveLastActivityAt(mixed), '2026-09-04T00:00:00.000Z');
});

test('basketAgeMs: null when no usable timestamp; clamps future skew to 0', () => {
  const now = Date.parse('2026-09-06T00:00:00.000Z');
  assert.equal(basketAgeMs({ lastActivityAt: null, now }), null);
  assert.equal(basketAgeMs({ lastActivityAt: '2026-09-05T00:00:00.000Z', now }), 24 * HOUR);
  assert.equal(basketAgeMs({ lastActivityAt: '2026-09-06T01:00:00.000Z', now }), 0);
});

test('isBasketStale: false when the timestamp is missing or invalid (never guess)', () => {
  assert.equal(isBasketStale({ lastActivityAt: null }), false);
  assert.equal(isBasketStale({ lastActivityAt: '' }), false);
  assert.equal(isBasketStale({ lastActivityAt: 'nope' }), false);
  assert.equal(isBasketStale({}), false);
});

test('isBasketStale: threshold is inclusive at exactly 24h', () => {
  const now = Date.parse('2026-09-06T00:00:00.000Z');
  assert.equal(isBasketStale({ lastActivityAt: '2026-09-05T00:00:00.001Z', now }), false);
  assert.equal(isBasketStale({ lastActivityAt: '2026-09-05T00:00:00.000Z', now }), true);
  assert.equal(isBasketStale({ lastActivityAt: '2026-09-01T00:00:00.000Z', now }), true);
});

test('isBasketStale: a custom positive threshold is honoured; junk falls back to default', () => {
  const now = Date.parse('2026-09-06T00:00:00.000Z');
  assert.equal(
    isBasketStale({ lastActivityAt: '2026-09-05T22:00:00.000Z', now, thresholdMs: HOUR }),
    true,
  );
  assert.equal(
    isBasketStale({ lastActivityAt: '2026-09-05T23:30:00.000Z', now, thresholdMs: HOUR }),
    false,
  );
  // thresholdMs <= 0 or NaN -> default 24h
  assert.equal(
    isBasketStale({ lastActivityAt: '2026-09-05T12:00:00.000Z', now, thresholdMs: 0 }),
    false,
  );
});

test('summariseBasketActivity: bundles lastActivityAt, serverTime, stale, threshold', () => {
  const now = Date.parse('2026-09-06T00:00:00.000Z');
  const fresh = summariseBasketActivity(
    [{ createdAt: '2026-09-05T23:00:00.000Z', updatedAt: '2026-09-05T23:00:00.000Z' }],
    { now },
  );
  assert.deepEqual(fresh, {
    lastActivityAt: '2026-09-05T23:00:00.000Z',
    serverTime: '2026-09-06T00:00:00.000Z',
    stale: false,
    staleThresholdMs: STALE_BASKET_THRESHOLD_MS,
  });

  const old = summariseBasketActivity(
    [{ createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }],
    { now },
  );
  assert.equal(old.stale, true);
  assert.equal(old.lastActivityAt, '2026-09-01T00:00:00.000Z');

  const empty = summariseBasketActivity([], { now });
  assert.equal(empty.lastActivityAt, null);
  assert.equal(empty.stale, false);
});
