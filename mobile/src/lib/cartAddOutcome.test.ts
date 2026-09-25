import test from 'node:test';
import assert from 'node:assert/strict';

import {
  listCollectMeta,
  listSyncFailed,
  retryFailedListSyncOnly,
  shouldRetryBasketAdd,
  shouldRetryListSyncOnly,
  type AddItemResult,
} from './cartAddOutcome';

const ok: AddItemResult = { basketAdded: true, listSync: { status: 'ok', marked: 1 } };
const listFail: AddItemResult = {
  basketAdded: true,
  listSync: { status: 'failed', message: 'Could not save your shopping list. Please try again.' },
};

test('list collect meta is taken from the add result and does not invent a new check', () => {
  assert.deepEqual(listCollectMeta(undefined), {
    collectKind: 'none',
    remainingUnchecked: 0,
    eligibleManualCount: 0,
    extraMarked: false,
    extraDecremented: false,
  });
  assert.deepEqual(
    listCollectMeta({
      status: 'ok',
      marked: 1,
      collectKind: 'newly_checked',
      remainingUnchecked: 1,
      eligibleManualCount: 1,
    }),
    {
      collectKind: 'newly_checked',
      remainingUnchecked: 1,
      eligibleManualCount: 1,
      extraMarked: false,
      extraDecremented: false,
    },
  );
  assert.equal(listCollectMeta({ status: 'failed', message: 'x', collectKind: 'newly_checked' }).collectKind, 'newly_checked');
});

test('confirmed basket add with list failure is not a basket retry', () => {
  assert.equal(listSyncFailed(listFail), true);
  assert.equal(listSyncFailed(ok), false);
  assert.equal(shouldRetryBasketAdd(listFail), false);
  assert.equal(shouldRetryListSyncOnly(listFail), true);
  assert.equal(shouldRetryBasketAdd(ok), false);
  assert.equal(shouldRetryListSyncOnly(ok), false);
});

test('a missing result may offer a basket add; a successful add must not', () => {
  assert.equal(shouldRetryBasketAdd(null), true);
  assert.equal(shouldRetryListSyncOnly(null), false);
});

test('list-only retry prefers markList and never calls addToBasket', async () => {
  let posts = 0;
  let marks = 0;
  const retry = await retryFailedListSyncOnly({
    basketAdded: true,
    listSynced: false,
    markList: async () => {
      marks += 1;
    },
    addToBasket: async () => {
      posts += 1;
    },
  });
  assert.equal(retry.didMark, true);
  assert.equal(retry.didAddToBasket, false);
  assert.equal(marks, 1);
  assert.equal(posts, 0);
});

test('a successful list persist is not retried, so remaining packages are not decremented twice', async () => {
  let marks = 0;
  const skipped = await retryFailedListSyncOnly({
    basketAdded: true,
    listSynced: true,
    markList: async () => {
      marks += 1;
    },
    addToBasket: async () => {
      throw new Error('must not add');
    },
  });
  assert.equal(skipped.didMark, false);
  assert.equal(skipped.didAddToBasket, false);
  assert.equal(marks, 0);
});

