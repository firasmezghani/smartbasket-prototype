import test from 'node:test';
import assert from 'node:assert/strict';

import type { ShoppingListItem } from '../types/shoppingList';
import {
  applyCollectedMarks,
  evaluateLinkedScanMatch,
  extraItemIdForTargetedAdd,
  inspectLinkedCollect,
  isUncheckedManualItem,
  matchingUncheckedLinkedItems,
  normaliseProductIdForMatch,
  prepareShoppingListProductBatch,
  resolveChecklistRowScanTarget,
  resolveChecklistScanTarget,
  resolveExpectedProductId,
  SHOPPING_LIST_MAX_ITEMS,
} from './shoppingListBatch';
import { buildRecipeChecklistAdditionsFromSelection } from './recipeChecklist';
import type { MissingLinkedProduct } from '../types/recommendations';

function item(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id: 'id-1',
    label: 'Milk',
    quantity: 1,
    checked: false,
    productId: 'prod-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function linked(overrides: Partial<MissingLinkedProduct> = {}): MissingLinkedProduct {
  return {
    ingredientKey: 'tomato',
    label: 'Tomato',
    essential: true,
    productId: 'prod-t',
    productName: 'Fresh Tomatoes',
    confidence: 'exact',
    matchedRule: 'exact_phrase',
    ...overrides,
  };
}

test('adds new products in one snapshot without dropping existing items', () => {
  const current = [item({ id: 'keep', productId: 'keep-1', label: 'Bread' })];
  const result = prepareShoppingListProductBatch(
    current,
    [
      { productId: 'a', label: 'Tomato' },
      { productId: 'b', label: 'Basil' },
    ],
    { createId: () => 'new', nowIso: () => 't' },
  );
  assert.equal(result.added, 2);
  assert.equal(result.merged, 0);
  assert.equal(result.nextItems.length, 3);
  assert.equal(result.nextItems[0].id, 'keep');
  assert.equal(result.nextItems[0].label, 'Bread');
  assert.equal(current.length, 1);
});

test('merges quantities into an existing unchecked item and does not create a duplicate row', () => {
  const current = [item({ quantity: 2 })];
  const result = prepareShoppingListProductBatch(current, [
    { productId: 'prod-1', label: 'Milk', quantity: 3 },
  ]);
  assert.equal(result.added, 0);
  assert.equal(result.merged, 1);
  assert.equal(result.nextItems.length, 1);
  assert.equal(result.nextItems[0].quantity, 5);
  assert.equal(result.nextItems[0].checked, false);
  assert.equal(current[0].quantity, 2);
});

test('matches existing product ids case-insensitively', () => {
  const current = [item({ productId: 'PROD-1', quantity: 1 })];
  const result = prepareShoppingListProductBatch(current, [
    { productId: 'prod-1', label: 'Milk' },
  ]);
  assert.equal(result.merged, 1);
  assert.equal(result.added, 0);
  assert.equal(result.nextItems[0].productId, 'PROD-1');
});

test('deduplicates incoming product ids case-insensitively, keeping the first', () => {
  let n = 0;
  const result = prepareShoppingListProductBatch(
    [],
    [
      { productId: 'PROD-9', label: 'First' },
      { productId: 'prod-9', label: 'Second' },
    ],
    { createId: () => `id-${++n}` },
  );
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.skippedDetails[0].reason, 'duplicateInput');
  assert.equal(result.nextItems[0].label, 'First');
});

test('does not merge into or uncheck a checked item; adds a new unchecked row instead', () => {
  const current = [item({ checked: true, checkedAt: 't', quantity: 1 })];
  const result = prepareShoppingListProductBatch(
    current,
    [{ productId: 'prod-1', label: 'Milk' }],
    { createId: () => 'new-unchecked', nowIso: () => 'now' },
  );
  assert.equal(result.added, 1);
  assert.equal(result.merged, 0);
  assert.equal(result.nextItems[0].checked, true);
  assert.equal(result.nextItems[0].quantity, 1);
  assert.equal(result.nextItems[1].checked, false);
  assert.equal(result.nextItems[1].id, 'new-unchecked');
});

test('enforces the 100-item cap without writing past the limit', () => {
  const current = Array.from({ length: SHOPPING_LIST_MAX_ITEMS }, (_, i) =>
    item({ id: `id-${i}`, productId: `p-${i}`, label: `Item ${i}` }),
  );
  const result = prepareShoppingListProductBatch(current, [
    { productId: 'fresh', label: 'New' },
  ]);
  assert.equal(result.added, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.skippedDetails[0].reason, 'capacity');
  assert.equal(result.nextItems.length, SHOPPING_LIST_MAX_ITEMS);
});

test('merges still succeed when the list is at capacity', () => {
  const current = Array.from({ length: SHOPPING_LIST_MAX_ITEMS }, (_, i) =>
    item({ id: `id-${i}`, productId: `p-${i}`, label: `Item ${i}`, quantity: 1 }),
  );
  const result = prepareShoppingListProductBatch(current, [
    { productId: 'p-0', label: 'Item 0', quantity: 2 },
  ]);
  assert.equal(result.merged, 1);
  assert.equal(result.added, 0);
  assert.equal(result.nextItems.length, SHOPPING_LIST_MAX_ITEMS);
  assert.equal(result.nextItems[0].quantity, 3);
});

test('skips invalid entries and still applies valid ones in the same snapshot', () => {
  const result = prepareShoppingListProductBatch(
    [],
    [
      { productId: '', label: 'Nope' },
      { productId: 'ok', label: '  Basil  ' },
      { productId: 'x', label: '' },
    ],
    { createId: () => 'n', nowIso: () => 't' },
  );
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 2);
  assert.equal(result.nextItems[0].label, 'Basil');
  assert.ok(result.skippedDetails.every((s) => s.reason === 'invalid'));
});

test('does not mutate the current list or the input array', () => {
  const current = Object.freeze([Object.freeze(item())]);
  const inputs = Object.freeze([Object.freeze({ productId: 'prod-2', label: 'Oil' })]);
  assert.doesNotThrow(() =>
    prepareShoppingListProductBatch(current, inputs, { createId: () => 'x', nowIso: () => 't' }),
  );
  assert.equal(current.length, 1);
  assert.equal(current[0].productId, 'prod-1');
});

test('normaliseProductIdForMatch trims and lower-cases, and rejects non-strings', () => {
  assert.equal(normaliseProductIdForMatch('  PROD-1 '), 'prod-1');
  assert.equal(normaliseProductIdForMatch('prod-1'), 'prod-1');
  assert.equal(normaliseProductIdForMatch(''), '');
  assert.equal(normaliseProductIdForMatch('   '), '');
  assert.equal(normaliseProductIdForMatch(undefined), '');
  assert.equal(normaliseProductIdForMatch(null), '');
  assert.equal(normaliseProductIdForMatch(42), '');
});

test('a single-item batch (what addProductItem delegates to) merges case-insensitively and keeps the stored casing', () => {
  const current = [item({ productId: ' Prod-1 '.trim(), quantity: 1 })];
  const result = prepareShoppingListProductBatch(current, [{ productId: '  prod-1  ', label: 'Milk', quantity: 4 }]);
  assert.equal(result.merged, 1);
  assert.equal(result.added, 0);
  assert.equal(result.nextItems[0].quantity, 5);
  // The stored identifier's casing is left as it is.
  assert.equal(result.nextItems[0].productId, 'Prod-1');
});

test('a single-item batch creates a new item preserving the caller-supplied casing (trimmed, not lower-cased)', () => {
  const result = prepareShoppingListProductBatch([], [{ productId: '  Prod-New  ', label: 'Basil' }], {
    createId: () => 'id-new',
  });
  assert.equal(result.added, 1);
  assert.equal(result.nextItems[0].productId, 'Prod-New');
});

test('checklist conversion plus batch merge stays compatible', () => {
  const current = [item({ productId: 'prod-t', label: 'Tomatoes', quantity: 1 })];
  const conversion = buildRecipeChecklistAdditionsFromSelection(
    'r-pasta',
    [linked(), linked({ ingredientKey: 'basil', productId: 'prod-b', productName: 'Basil' })],
    new Set(['tomato', 'basil']),
  );
  const result = prepareShoppingListProductBatch(current, conversion.additions, {
    createId: () => 'new-b',
    nowIso: () => 't',
  });
  assert.equal(conversion.additions.length, 2);
  assert.equal(result.merged, 1);
  assert.equal(result.added, 1);
  assert.equal(result.nextItems[0].quantity, 2);
  assert.equal(result.nextItems[1].productId, 'prod-b');
});

// --- total-quantity limit (same as the server's max_basket_quantity) ---

test('recipe batch atomicity: an early ingredient that would fit is not applied when a later one exceeds capacity', () => {
  // The first item fits but the second goes over the limit, so the whole batch
  // is rejected and the list stays the same.
  const currentItems: ShoppingListItem[] = [];
  const inputs = [
    { productId: 'egg', label: 'Eggs', quantity: 3 },
    { productId: 'olive-oil', label: 'Olive oil', quantity: 3 },
  ];
  const result = prepareShoppingListProductBatch(currentItems, inputs, {
    maxTotalQuantity: 5,
    createId: () => 'x',
    nowIso: () => 't',
  });

  assert.equal(result.added, 0);
  assert.equal(result.merged, 0);
  assert.deepEqual(result.nextItems, currentItems.map((i) => ({ ...i })));
  assert.equal(result.nextItems.length, 0);
  // Both entries are reported, including the egg that would have fit on its own.
  assert.equal(result.skipped, 2);
  assert.ok(result.skippedDetails.every((d) => d.reason === 'capacity'));
  assert.deepEqual(
    result.skippedDetails.map((d) => d.productId),
    ['egg', 'olive-oil'],
  );
});

test('maxItems (row cap) is also all-or-nothing across the batch, not just maxTotalQuantity', () => {
  const current = Array.from({ length: SHOPPING_LIST_MAX_ITEMS - 1 }, (_, i) =>
    item({ id: `id-${i}`, productId: `p-${i}`, label: `Item ${i}` }),
  );
  // Room for one more row. Two new products are asked for, so neither is applied.
  const result = prepareShoppingListProductBatch(current, [
    { productId: 'new-1', label: 'New 1' },
    { productId: 'new-2', label: 'New 2' },
  ]);
  assert.equal(result.added, 0);
  assert.equal(result.merged, 0);
  assert.equal(result.nextItems.length, SHOPPING_LIST_MAX_ITEMS - 1);
  assert.deepEqual(
    result.nextItems.map((i) => i.id),
    current.map((i) => i.id),
  );
  assert.equal(result.skipped, 2);
  assert.ok(result.skippedDetails.every((d) => d.reason === 'capacity'));
});

test('maxTotalQuantity: exact boundary is allowed', () => {
  const result = prepareShoppingListProductBatch(
    [item({ id: 'i0', productId: 'p0', label: 'P0', quantity: 4 })],
    [{ productId: 'p1', label: 'P1', quantity: 1 }],
    { maxTotalQuantity: 5, createId: () => 'x', nowIso: () => 't' },
  );
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 0);
});

test('maxTotalQuantity blocks a MERGE that would exceed the limit and leaves the quantity untouched', () => {
  const current = [item({ id: 'i0', productId: 'p0', label: 'P0', quantity: 4 })];
  const result = prepareShoppingListProductBatch(
    current,
    [{ productId: 'p0', label: 'P0', quantity: 3 }],
    { maxTotalQuantity: 5, createId: () => 'x', nowIso: () => 't' },
  );
  assert.equal(result.merged, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.skippedDetails[0].reason, 'capacity');
  assert.equal(result.nextItems[0].quantity, 4); // unchanged
});

test('maxTotalQuantity defaults to no ceiling (unchanged behaviour when omitted)', () => {
  const result = prepareShoppingListProductBatch(
    [],
    [{ productId: 'a', label: 'A', quantity: 50 }],
    { createId: () => 'x', nowIso: () => 't' },
  );
  assert.equal(result.added, 1);
  assert.equal(result.nextItems[0].quantity, 50);
});

test('maxTotalQuantity ignores checked ("already collected") items when measuring the total', () => {
  const current = [
    item({ id: 'done', productId: 'p-done', label: 'Done', quantity: 40, checked: true, checkedAt: 't' }),
    item({ id: 'act', productId: 'p-act', label: 'Active', quantity: 2 }),
  ];
  const result = prepareShoppingListProductBatch(
    current,
    [{ productId: 'p-new', label: 'New', quantity: 2 }],
    { maxTotalQuantity: 5, createId: () => 'x', nowIso: () => 't' }, // active total 2 + 2 = 4 <= 5
  );
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 0);
});

test('invalid / duplicate entries keep their own reason even inside a batch-level capacity failure', () => {
  const result = prepareShoppingListProductBatch(
    [],
    [
      { productId: '', label: 'No id' }, // invalid
      { productId: 'egg', label: 'Eggs', quantity: 3 },
      { productId: 'egg', label: 'Eggs again', quantity: 1 }, // duplicate input
      { productId: 'olive-oil', label: 'Olive oil', quantity: 3 }, // pushes batch over the cap
    ],
    { maxTotalQuantity: 5, createId: () => 'x', nowIso: () => 't' },
  );
  assert.equal(result.added, 0);
  assert.equal(result.merged, 0);
  assert.equal(result.nextItems.length, 0);
  assert.deepEqual(result.skippedDetails, [
    { productId: null, reason: 'invalid' },
    { productId: 'egg', reason: 'capacity' },
    { productId: 'egg', reason: 'duplicateInput' },
    { productId: 'olive-oil', reason: 'capacity' },
  ]);
});

test('single-item batch behaviour is unchanged by the atomicity fix (fits / does not fit)', () => {
  const fits = prepareShoppingListProductBatch([], [{ productId: 'a', label: 'A', quantity: 5 }], {
    maxTotalQuantity: 5,
    createId: () => 'x',
    nowIso: () => 't',
  });
  assert.equal(fits.added, 1);
  assert.equal(fits.nextItems.length, 1);

  const doesNotFit = prepareShoppingListProductBatch([], [{ productId: 'a', label: 'A', quantity: 6 }], {
    maxTotalQuantity: 5,
    createId: () => 'x',
    nowIso: () => 't',
  });
  assert.equal(doesNotFit.added, 0);
  assert.equal(doesNotFit.nextItems.length, 0);
  assert.equal(doesNotFit.skippedDetails[0].reason, 'capacity');
});

test('matchingUncheckedLinkedItems uses exact product id only, never the label', () => {
  const current = [
    item({ id: 'manual', productId: undefined, label: 'Eggs El Mazraa' }),
    item({ id: 'linked', productId: 'egg-sku', label: 'Eggs El Mazraa', checked: false }),
    item({ id: 'done', productId: 'egg-sku', label: 'Eggs El Mazraa', checked: true }),
  ];
  const matches = matchingUncheckedLinkedItems(current, 'EGG-SKU');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'linked');
  assert.deepEqual(matchingUncheckedLinkedItems(current, 'not-on-list'), []);
  assert.equal(normaliseProductIdForMatch('EGG-SKU'), 'egg-sku');
});

test('inspectLinkedCollect reports newly checked eggs without treating leftover Rice as a match', () => {
  const current = [
    item({ id: 'eggs', productId: 'sku-eggs', label: 'Eggs' }),
    item({ id: 'rice', productId: undefined, label: 'Rice' }),
  ];
  const inspect = inspectLinkedCollect(current, { productId: 'sku-eggs', nowIso: 't' });
  assert.equal(inspect.kind, 'newly_checked');
  assert.equal(inspect.marked, 1);
  assert.equal(inspect.nextItems.find((row) => row.id === 'eggs')?.checked, true);
  assert.equal(inspect.nextItems.find((row) => row.id === 'rice')?.checked, false);
  assert.equal(inspect.remainingUnchecked, 1);
  assert.equal(inspect.eligibleManualCount, 1);
  const already = inspectLinkedCollect(
    current.map((row) => (row.id === 'eggs' ? { ...row, checked: true } : row)),
    { productId: 'sku-eggs', nowIso: 't' },
  );
  assert.equal(already.kind, 'already_checked');
  assert.equal(already.marked, 0);
});

test('resolveChecklistScanTarget requires an explicit unchecked manual row id', () => {
  const current = [
    item({ id: 'manual', productId: undefined, label: 'Eggs', quantity: 3 }),
    item({ id: 'linked', productId: 'egg-sku', label: 'Eggs' }),
    item({ id: 'done-manual', productId: undefined, label: 'Butter', checked: true }),
  ];
  assert.equal(resolveChecklistScanTarget(current, undefined), null);
  assert.equal(resolveChecklistScanTarget(current, ''), null);
  assert.equal(resolveChecklistScanTarget(current, 'linked'), null);
  assert.equal(resolveChecklistScanTarget(current, 'done-manual'), null);
  assert.equal(resolveChecklistScanTarget(current, 'missing'), null);
  assert.equal(resolveChecklistScanTarget(current, '  manual  ')?.id, 'manual');
  assert.equal(isUncheckedManualItem(current[0]), true);
  assert.equal(isUncheckedManualItem(current[1]), false);
});

test('resolveChecklistRowScanTarget accepts any still-unchecked row', () => {
  const current = [
    item({ id: 'manual', productId: undefined, label: 'Eggs', quantity: 3 }),
    item({ id: 'linked', productId: 'egg-sku', label: 'Eggs El Mazraa' }),
    item({ id: 'done-linked', productId: 'butter-sku', label: 'Butter', checked: true }),
  ];
  assert.equal(resolveChecklistRowScanTarget(current, 'manual')?.id, 'manual');
  assert.equal(resolveChecklistRowScanTarget(current, 'linked')?.id, 'linked');
  assert.equal(resolveChecklistRowScanTarget(current, 'done-linked'), null);
  assert.equal(resolveChecklistRowScanTarget(current, 'missing'), null);
  assert.equal(extraItemIdForTargetedAdd(current[0]), 'manual');
  assert.equal(extraItemIdForTargetedAdd(current[1]), undefined);
});

test('linked targeted scan matches product ids, including alternate barcodes of the same product', () => {
  const linked = item({ id: 'linked', productId: 'SKU-Milk', label: 'Milk 1L' });
  const expected = resolveExpectedProductId({
    target: linked,
    sessionExpectedProductId: 'sku-milk',
  });
  assert.equal(expected, 'sku-milk');
  assert.equal(
    evaluateLinkedScanMatch({ expectedProductId: expected, scannedProductId: 'SKU-MILK' }).kind,
    'match',
  );
  assert.equal(
    evaluateLinkedScanMatch({ expectedProductId: expected, scannedProductId: 'sku-other' }).kind,
    'mismatch',
  );
  assert.equal(
    evaluateLinkedScanMatch({ expectedProductId: expected, scannedProductId: '' }).kind,
    'mismatch',
  );
  assert.equal(
    evaluateLinkedScanMatch({ expectedProductId: undefined, scannedProductId: 'sku-milk' }).kind,
    'not_applicable',
  );
  const manual = item({ id: 'manual', label: 'Milk', productId: undefined });
  assert.equal(
    resolveExpectedProductId({ target: manual, sessionExpectedProductId: 'sku-milk' }),
    undefined,
  );
});

test('a linked mismatch plan is never applied; a match checks the linked row without binding a manual name', () => {
  const current = [
    item({ id: 'manual', productId: undefined, label: 'Milk' }),
    item({ id: 'linked', productId: 'sku-milk', label: 'Milk 1L' }),
  ];
  assert.equal(
    evaluateLinkedScanMatch({ expectedProductId: 'sku-milk', scannedProductId: 'sku-bread' }).kind,
    'mismatch',
  );
  assert.equal(current[0].checked, false);
  assert.equal(current[1].checked, false);

  const matched = applyCollectedMarks(current, { productId: 'SKU-MILK', nowIso: 't' });
  assert.equal(matched.nextItems.find((row) => row.id === 'linked')?.checked, true);
  assert.equal(matched.nextItems.find((row) => row.id === 'manual')?.checked, false);
  assert.equal(matched.nextItems.find((row) => row.id === 'manual')?.productId, undefined);
});

test('applyCollectedMarks checks exact linked ids plus one confirmed manual row without binding a product id', () => {
  const current = [
    item({ id: 'manual', productId: undefined, label: 'Eggs', quantity: 3 }),
    item({ id: 'other-manual', productId: undefined, label: 'Milk' }),
    item({ id: 'linked', productId: 'egg-sku', label: 'Eggs El Mazraa' }),
  ];
  const result = applyCollectedMarks(current, {
    productId: 'EGG-SKU',
    extraItemId: 'manual',
    nowIso: 'now',
  });
  assert.equal(result.marked, 2);
  assert.equal(result.extraMarked, true);
  const manual = result.nextItems.find((row) => row.id === 'manual');
  const other = result.nextItems.find((row) => row.id === 'other-manual');
  const linked = result.nextItems.find((row) => row.id === 'linked');
  assert.equal(manual?.checked, true);
  assert.equal(manual?.productId, undefined);
  assert.equal(manual?.quantity, 3);
  assert.equal(other?.checked, false);
  assert.equal(linked?.checked, true);
  assert.equal(current[0].checked, false);
});

test('applyCollectedMarks without extraItemId never checks a similar-named manual row', () => {
  const current = [
    item({ id: 'manual', productId: undefined, label: 'Eggs El Mazraa' }),
    item({ id: 'linked', productId: 'egg-sku', label: 'Eggs El Mazraa' }),
  ];
  const result = applyCollectedMarks(current, { productId: 'egg-sku', nowIso: 't' });
  assert.equal(result.extraMarked, false);
  assert.equal(result.nextItems.find((row) => row.id === 'manual')?.checked, false);
  assert.equal(result.nextItems.find((row) => row.id === 'linked')?.checked, true);
});

test('a discarded or failed targeted plan leaves the original snapshot unchecked', () => {
  const current = [item({ id: 'manual', productId: undefined, label: 'Eggs', checked: false })];
  const plan = applyCollectedMarks(current, { extraItemId: 'manual', nowIso: 't' });
  assert.equal(plan.extraMarked, true);
  assert.equal(plan.nextItems[0].checked, true);
  assert.equal(current[0].checked, false);
});
