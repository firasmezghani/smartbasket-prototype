import test from 'node:test';
import assert from 'node:assert/strict';

import { captureAccountScope } from './accountScope';
import { prepareShoppingListProductBatch } from './shoppingListBatch';
import {
  CHECKLIST_DRAFT_DEBOUNCE_MS,
  CHECKLIST_DRAFT_SUGGESTION_LIMIT,
  checklistDraftCatalogQuery,
  draftSearchStatusFromResult,
  formatDraftSuggestionDetail,
  linkedInputFromCatalogueProduct,
  resolveDraftSuggestionView,
  shouldAcceptDraftSearchResult,
  shouldCommitDraftListAdd,
  shouldSearchChecklistDraft,
  shouldShowDraftSuggestionPanel,
  shouldShowPersonalNoteAction,
  personalNoteActionMode,
} from './checklistDraftSearch';

test('typed draft searches the existing catalogue endpoint and never invents a product id', () => {
  assert.equal(shouldSearchChecklistDraft('  milk '), true);
  assert.equal(shouldSearchChecklistDraft('   '), false);
  assert.deepEqual(checklistDraftCatalogQuery('  tomate  '), {
    search: 'tomate',
    limit: CHECKLIST_DRAFT_SUGGESTION_LIMIT,
  });
  assert.equal(checklistDraftCatalogQuery(''), null);
  assert.equal(CHECKLIST_DRAFT_DEBOUNCE_MS > 0, true);
  assert.equal(CHECKLIST_DRAFT_SUGGESTION_LIMIT, 5);
  assert.equal(linkedInputFromCatalogueProduct({ id: '  ', name: 'Milk' }), null);
  assert.equal(linkedInputFromCatalogueProduct({ id: 'sku-1', name: '  ' }), null);
});

test('selecting a catalogue suggestion creates the correct linked entry', () => {
  const input = linkedInputFromCatalogueProduct({
    id: 'sku-eggs',
    name: 'Œufs El Mazraa — boîte de 6',
    sourceName: 'Eggs',
  });
  assert.deepEqual(input, {
    productId: 'sku-eggs',
    label: 'Œufs El Mazraa — boîte de 6',
    quantity: 1,
  });
  const result = prepareShoppingListProductBatch([], [input!], {
    createId: () => 'row-1',
    nowIso: () => 't',
  });
  assert.equal(result.added, 1);
  assert.equal(result.nextItems[0].productId, 'sku-eggs');
  assert.equal(result.nextItems[0].label, 'Œufs El Mazraa — boîte de 6');
  assert.equal(result.nextItems[0].checked, false);
});

test('explicit personal-note creation stays unlinked', () => {
  assert.equal(linkedInputFromCatalogueProduct(null), null);
  const merged = prepareShoppingListProductBatch(
    [
      {
        id: 'note',
        label: 'milk',
        quantity: 1,
        checked: false,
        createdAt: 't',
      },
    ],
    [],
    { createId: () => 'x', nowIso: () => 't' },
  );
  assert.equal(merged.nextItems[0].productId, undefined);
  assert.equal(merged.nextItems[0].label, 'milk');
});

test('stale search results and account changes cannot add the wrong entry', () => {
  const started = captureAccountScope('A', 1);
  assert.equal(
    shouldAcceptDraftSearchResult({
      mounted: true,
      requestCurrent: true,
      started,
      current: captureAccountScope('A', 1),
    }),
    true,
  );
  assert.equal(
    shouldAcceptDraftSearchResult({
      mounted: true,
      requestCurrent: false,
      started,
      current: captureAccountScope('A', 1),
    }),
    false,
  );
  assert.equal(
    shouldAcceptDraftSearchResult({
      mounted: true,
      requestCurrent: true,
      started,
      current: captureAccountScope('B', 2),
    }),
    false,
  );
  assert.equal(
    shouldAcceptDraftSearchResult({
      mounted: true,
      requestCurrent: true,
      started,
      current: captureAccountScope('A', 3),
    }),
    false,
  );
  assert.equal(
    shouldCommitDraftListAdd({
      adding: false,
      started,
      current: captureAccountScope('B', 2),
    }),
    false,
  );
  assert.equal(
    shouldCommitDraftListAdd({
      adding: true,
      started,
      current: captureAccountScope('A', 1),
    }),
    false,
  );
});

test('failed search is distinct from no matches; the panel only appears during entry', () => {
  assert.equal(draftSearchStatusFromResult({ error: true, products: [{ id: 'x' }] }), 'error');
  assert.equal(draftSearchStatusFromResult({ error: false, products: [] }), 'empty');
  assert.equal(draftSearchStatusFromResult({ error: false, products: [{ id: 'x' }] }), 'ready');
  assert.equal(shouldShowDraftSuggestionPanel({ draft: 'milk' }), true);
  assert.equal(shouldShowDraftSuggestionPanel({ draft: 'milk', adding: true }), false);
  assert.equal(shouldShowDraftSuggestionPanel({ draft: '  ' }), false);
  assert.equal(shouldShowPersonalNoteAction({ draft: 'milk' }), true);
  assert.equal(shouldShowPersonalNoteAction({ draft: '  ' }), false);
  assert.equal(
    personalNoteActionMode({
      draft: 'zzbread',
      suggestionStatus: 'empty',
      genericCount: 0,
    }),
    'unmatched',
  );
  assert.equal(
    personalNoteActionMode({
      draft: 'milk',
      suggestionStatus: 'ready',
      genericCount: 1,
    }),
    'quiet',
  );
  assert.equal(
    personalNoteActionMode({
      draft: 'milk',
      suggestionStatus: 'loading',
      genericCount: 1,
    }),
    'quiet',
  );
  assert.equal(
    personalNoteActionMode({
      draft: 'zzbread',
      suggestionStatus: 'error',
      genericCount: 0,
    }),
    'quiet',
  );
  assert.equal(
    personalNoteActionMode({
      draft: 'zzbread',
      suggestionStatus: 'empty',
      genericCount: 0,
      adding: true,
    }),
    'hidden',
  );
  assert.equal(
    formatDraftSuggestionDetail(['El Mazraa', '', 'Eggs', '3.490 TND']),
    'El Mazraa · Eggs · 3.490 TND',
  );
});

test('stale catalogue hits are not shown and cannot be committed as the typed text', () => {
  const stale = resolveDraftSuggestionView({
    enabled: true,
    draft: 'bread',
    debounced: 'milk',
    status: 'ready',
    products: [{ id: 'sku-milk', name: 'Farm Milk 1L' }],
  });
  assert.equal(stale.status, 'loading');
  assert.deepEqual(stale.products, []);
  const empty = resolveDraftSuggestionView({
    enabled: true,
    draft: 'xyzzy',
    debounced: 'xyzzy',
    status: 'empty',
    products: [{ id: 'sku-milk' }],
  });
  assert.equal(empty.status, 'empty');
  assert.deepEqual(empty.products, []);
  const failed = resolveDraftSuggestionView({
    enabled: true,
    draft: 'milk',
    debounced: 'milk',
    status: 'error',
    products: [{ id: 'sku-milk' }],
  });
  assert.equal(failed.status, 'error');
  assert.deepEqual(failed.products, []);
  const ready = resolveDraftSuggestionView({
    enabled: true,
    draft: 'eggs',
    debounced: 'eggs',
    status: 'ready',
    products: [{ id: 'sku-eggs', name: 'Œufs El Mazraa — boîte de 6' }],
  });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.products[0]?.id, 'sku-eggs');
  assert.deepEqual(
    resolveDraftSuggestionView({
      enabled: false,
      draft: 'milk',
      debounced: 'milk',
      status: 'ready',
      products: [{ id: 'sku-milk' }],
    }),
    { status: 'idle', products: [] },
  );
});
