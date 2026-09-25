import test from 'node:test';
import assert from 'node:assert/strict';

import type { ShoppingListItem } from '../types/shoppingList';
import { prepareShoppingListProductBatch } from './shoppingListBatch';
import {
  checklistAddResultFromAppend,
  checklistAddResultFromProductBatch,
  indexOfChecklistItem,
  shouldAcceptDraftAddStart,
  shouldScrollChecklistAfterAdd,
} from './checklistAddVisibility';

function item(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id: 'id-1',
    label: 'Milk',
    quantity: 1,
    checked: false,
    createdAt: 't',
    ...overrides,
  };
}

test('in-flight draft adds are ignored until the current action finishes', () => {
  assert.equal(shouldAcceptDraftAddStart({ inFlight: false, startedAccountCurrent: true }), true);
  assert.equal(shouldAcceptDraftAddStart({ inFlight: true, startedAccountCurrent: true }), false);
  assert.equal(shouldAcceptDraftAddStart({ inFlight: false, startedAccountCurrent: false }), false);
});

test('the list does not scroll while the customer is still typing', () => {
  assert.equal(shouldScrollChecklistAfterAdd({ typing: true, itemId: 'row-1' }), false);
  assert.equal(shouldScrollChecklistAfterAdd({ typing: false, itemId: 'row-1' }), true);
  assert.equal(shouldScrollChecklistAfterAdd({ typing: false, itemId: '  ' }), false);
  assert.equal(shouldScrollChecklistAfterAdd({ typing: false, itemId: null }), false);
});

test('appending a personal note or generic type reports a new row', () => {
  const previous = [item({ id: 'old', label: 'Bread' })];
  const next = [...previous, item({ id: 'new', label: 'Chocolate' })];
  assert.deepEqual(checklistAddResultFromAppend({ previousItems: previous, nextItems: next }), {
    id: 'new',
    kind: 'added',
    label: 'Chocolate',
  });
  assert.equal(checklistAddResultFromAppend({ previousItems: next, nextItems: next }), null);
});

test('adding an existing linked product reports an update, not a new row', () => {
  const previous = [item({ id: 'milk', label: 'Farm milk 1L', productId: 'sku-milk', quantity: 1 })];
  const input = { productId: 'sku-milk', label: 'Farm milk 1L', quantity: 1 };
  const batch = prepareShoppingListProductBatch(previous, [input], {
    createId: () => 'should-not-create',
    nowIso: () => 't2',
  });
  assert.equal(batch.merged, 1);
  assert.equal(batch.added, 0);
  const result = checklistAddResultFromProductBatch({
    productId: 'sku-milk',
    previousItems: previous,
    nextItems: batch.nextItems,
    added: batch.added,
    merged: batch.merged,
  });
  assert.deepEqual(result, { id: 'milk', kind: 'updated', label: 'Farm milk 1L' });
  assert.equal(indexOfChecklistItem(batch.nextItems, result?.id), 0);
});

test('a new linked product reports the created row', () => {
  const previous = [item({ id: 'bread', label: 'Bread', productId: 'sku-bread' })];
  const batch = prepareShoppingListProductBatch(
    previous,
    [{ productId: 'sku-eggs', label: 'Eggs 6', quantity: 1 }],
    { createId: () => 'eggs-row', nowIso: () => 't' },
  );
  assert.equal(batch.added, 1);
  assert.deepEqual(
    checklistAddResultFromProductBatch({
      productId: 'sku-eggs',
      previousItems: previous,
      nextItems: batch.nextItems,
      added: batch.added,
      merged: batch.merged,
    }),
    { id: 'eggs-row', kind: 'added', label: 'Eggs 6' },
  );
});
