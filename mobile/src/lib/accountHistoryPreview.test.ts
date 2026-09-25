import test from 'node:test';
import assert from 'node:assert/strict';

import { captureAccountScope } from './accountScope';
import {
  accountHistoryPreviewState,
  isHistoryResultCurrent,
  pickLatestValidatedBasket,
} from './accountHistoryPreview';
import type { PurchaseHistorySummary } from '../types/purchaseHistory';

function row(overrides: Partial<PurchaseHistorySummary> = {}): PurchaseHistorySummary {
  return {
    id: 'smart-basket-1',
    type: 'smart_basket',
    sourceLabel: 'Cashier-validated basket',
    status: 'validated',
    createdAt: '2026-09-01T10:00:00.000Z',
    completedAt: '2026-09-01T10:05:00.000Z',
    itemCount: 3,
    uniqueProductCount: 2,
    total: 10,
    estimatedTotal: 10,
    summary: '3 recorded items',
    ...overrides,
  };
}

test('latest validated basket is the newest validated record, not an invented receipt', () => {
  const older = row({ id: 'smart-basket-1', completedAt: '2026-08-01T10:00:00.000Z' });
  const newer = row({ id: 'smart-basket-2', completedAt: '2026-09-20T10:00:00.000Z', itemCount: 4 });
  const pending = row({ id: 'smart-basket-3', status: 'pending', completedAt: '2026-09-21T10:00:00.000Z' });
  assert.equal(pickLatestValidatedBasket([older, pending, newer])?.id, 'smart-basket-2');
  assert.equal(pickLatestValidatedBasket([pending]), null);
  assert.equal(pickLatestValidatedBasket([]), null);
});

test('history loading and errors stay distinct from an empty validated history', () => {
  assert.equal(
    accountHistoryPreviewState({ signedIn: false, loading: false, records: [row()] }).kind,
    'hidden',
  );
  assert.equal(
    accountHistoryPreviewState({ signedIn: true, loading: true, records: [] }).kind,
    'loading',
  );
  assert.equal(
    accountHistoryPreviewState({
      signedIn: true,
      loading: false,
      error: 'fail',
      records: [],
    }).kind,
    'unavailable',
  );
  assert.equal(
    accountHistoryPreviewState({ signedIn: true, loading: false, records: [] }).kind,
    'empty',
  );
  const ready = accountHistoryPreviewState({
    signedIn: true,
    loading: false,
    records: [row()],
  });
  assert.equal(ready.kind, 'ready');
  assert.equal(ready.latest?.id, 'smart-basket-1');
});

test('stale or other-account history responses are ignored', () => {
  const started = captureAccountScope('A', 1);
  assert.equal(
    isHistoryResultCurrent({
      mounted: true,
      requestCurrent: true,
      started,
      current: captureAccountScope('A', 1),
    }),
    true,
  );
  assert.equal(
    isHistoryResultCurrent({
      mounted: true,
      requestCurrent: true,
      started,
      current: captureAccountScope('B', 2),
    }),
    false,
  );
  assert.equal(
    isHistoryResultCurrent({
      mounted: true,
      requestCurrent: true,
      started,
      current: captureAccountScope('A', 3),
    }),
    false,
  );
});
