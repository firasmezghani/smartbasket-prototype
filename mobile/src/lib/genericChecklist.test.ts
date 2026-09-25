import test from 'node:test';
import assert from 'node:assert/strict';

import type { ShoppingListItem } from '../types/shoppingList';
import { captureAccountScope } from './accountScope';
import {
  GENERIC_CHECKLIST_EXCLUSIONS,
  GENERIC_CHECKLIST_MEMBERSHIP,
  SUPPORTED_GENERIC_TYPES,
  evaluateAfterAddGenericMatch,
  evaluateGenericMatchCommit,
  evaluateTargetedGenericScan,
  extraItemIdForTargetedGenericAdd,
  genericTypeOfferedForDraft,
  genericTypesOfferedForDraft,
  isSupportedGenericType,
  isUncheckedGenericItem,
  matchingUncheckedGenericItems,
  normaliseGenericType,
  onePackageDoesNotCompleteQuantity,
  productCompatibleWithGenericType,
  shouldOfferGenericDraftChoice,
  shoppingClassificationOf,
} from './genericChecklist';
import {
  applyCollectedMarks,
  extraItemIdForTargetedAdd,
  inspectLinkedCollect,
  isUncheckedManualItem,
  matchingUncheckedLinkedItems,
  normaliseStoredShoppingListItems,
} from './shoppingListBatch';

function item(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id: 'id-1',
    label: 'Milk',
    quantity: 1,
    checked: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('supported generic types are the 19 reviewed visible CanonicalType keys', () => {
  assert.equal(SUPPORTED_GENERIC_TYPES.length, 19);
  assert.equal(isSupportedGenericType('milk'), true);
  assert.equal(isSupportedGenericType('non_food'), false);
  assert.equal(isSupportedGenericType('water'), false);
  assert.equal(normaliseGenericType(' Milk '), 'milk');
  assert.equal(normaliseGenericType('soy_milk'), null);
  assert.ok(GENERIC_CHECKLIST_MEMBERSHIP.milk.includes('Dairy'));
  assert.ok(GENERIC_CHECKLIST_EXCLUSIONS.some((row) => row.includes('non_food')));
});

test('draft text may offer a generic choice but is never itself a conversion', () => {
  assert.equal(genericTypeOfferedForDraft('lait'), 'milk');
  assert.equal(genericTypeOfferedForDraft('Milk'), 'milk');
  assert.equal(genericTypeOfferedForDraft('beurre'), 'butter');
  assert.equal(genericTypeOfferedForDraft('beurre de cacahuete'), 'peanut_butter');
  assert.equal(genericTypeOfferedForDraft('fromage'), 'cheese');
  assert.equal(genericTypeOfferedForDraft('mozzarella'), 'mozzarella');
  assert.equal(genericTypeOfferedForDraft('oeufs'), 'egg');
  assert.equal(genericTypeOfferedForDraft('need milk tomorrow'), null);
  assert.equal(shouldOfferGenericDraftChoice({ draft: 'milk' }), true);
  assert.equal(shouldOfferGenericDraftChoice({ draft: 'milk', adding: true }), false);
  assert.deepEqual(genericTypesOfferedForDraft('lait'), ['milk']);
  assert.deepEqual(genericTypesOfferedForDraft('spaghetti'), ['pasta']);
  assert.deepEqual(genericTypesOfferedForDraft('mozzarella'), ['mozzarella']);
  assert.deepEqual(genericTypesOfferedForDraft('fromage'), ['cheese']);
  assert.deepEqual(genericTypesOfferedForDraft('need milk tomorrow'), []);
});

test('several matching generic types require an explicit choice and never pick the first', () => {
  assert.equal(genericTypeOfferedForDraft('milk'), 'milk');
  assert.equal(genericTypesOfferedForDraft('milk').length === 1, true);
  const unique = new Set(genericTypesOfferedForDraft('beurre'));
  assert.equal(unique.size, 1);
  assert.equal(genericTypeOfferedForDraft(''), null);
  assert.equal(genericTypesOfferedForDraft('cheese and milk').length, 0);
});

test('shopping classification honours exclusions, unknown types and non-food', () => {
  assert.deepEqual(shoppingClassificationOf({ canonicalType: 'milk', classificationStatus: 'typed' }), {
    canonicalType: 'milk',
    status: 'typed',
  });
  assert.deepEqual(shoppingClassificationOf({ canonicalType: 'milk', classificationStatus: 'excluded' }), {
    canonicalType: null,
    status: 'excluded',
  });
  assert.deepEqual(shoppingClassificationOf({ canonicalType: 'non_food', classificationStatus: 'non_food' }), {
    canonicalType: null,
    status: 'non_food',
  });
  assert.deepEqual(shoppingClassificationOf({ canonicalType: 'mystery', classificationStatus: 'typed' }), {
    canonicalType: null,
    status: 'unknown',
  });
  assert.deepEqual(shoppingClassificationOf({}), { canonicalType: null, status: 'unknown' });
});

test('milk does not match plant drinks, butter does not match peanut butter, cheese does not match mozzarella', () => {
  const milk = { canonicalType: 'milk', classificationStatus: 'typed' as const };
  const peanut = { canonicalType: 'peanut_butter', classificationStatus: 'typed' as const };
  const mozzarella = { canonicalType: 'mozzarella', classificationStatus: 'typed' as const };
  const cheese = { canonicalType: 'cheese', classificationStatus: 'typed' as const };
  assert.equal(productCompatibleWithGenericType(milk, 'milk'), true);
  assert.equal(productCompatibleWithGenericType({ canonicalType: 'oat_drink' }, 'milk'), false);
  assert.equal(productCompatibleWithGenericType(peanut, 'butter'), false);
  assert.equal(productCompatibleWithGenericType(peanut, 'peanut_butter'), true);
  assert.equal(productCompatibleWithGenericType(mozzarella, 'cheese'), false);
  assert.equal(productCompatibleWithGenericType(cheese, 'cheese'), true);
});

test('excluded or unknown classifications never auto-complete a generic entry', () => {
  const generic = item({ id: 'g-milk', genericType: 'milk', label: 'Milk' });
  assert.equal(
    evaluateTargetedGenericScan({
      target: generic,
      product: { canonicalType: 'milk', classificationStatus: 'excluded' },
    }).kind,
    'incompatible',
  );
  assert.equal(
    evaluateTargetedGenericScan({
      target: generic,
      product: { canonicalType: 'milk', classificationStatus: 'unknown' },
    }).kind,
    'incompatible',
  );
  assert.equal(extraItemIdForTargetedGenericAdd(generic, { canonicalType: 'milk' }), 'g-milk');
  assert.equal(
    extraItemIdForTargetedGenericAdd(generic, { canonicalType: 'milk', classificationStatus: 'excluded' }),
    undefined,
  );
});

test('stored lists keep notes as notes and persist an explicit genericType', () => {
  const loaded = normaliseStoredShoppingListItems([
    { id: 'note', label: 'milk', quantity: 1, checked: false, createdAt: 't' },
    {
      id: 'generic',
      label: 'Milk',
      quantity: 1,
      checked: false,
      genericType: 'milk',
      createdAt: 't',
    },
    {
      id: 'linked',
      label: 'Lait Délice',
      quantity: 1,
      checked: false,
      productId: 'sku-milk',
      genericType: 'milk',
      createdAt: 't',
    },
    { id: 'bad', label: 'X', genericType: 'not_a_type', createdAt: 't' },
  ]);
  assert.equal(loaded[0]?.genericType, undefined);
  assert.equal(loaded[0]?.productId, undefined);
  assert.equal(isUncheckedManualItem(loaded[0]), true);
  assert.equal(isUncheckedGenericItem(loaded[0]), false);
  assert.equal(loaded[1]?.genericType, 'milk');
  assert.equal(isUncheckedGenericItem(loaded[1]), true);
  assert.equal(isUncheckedManualItem(loaded[1]), false);
  assert.equal(loaded[2]?.productId, 'sku-milk');
  assert.equal(loaded[2]?.genericType, undefined);
  assert.equal(loaded[3]?.genericType, undefined);
  assert.equal(isUncheckedManualItem(loaded[3]), true);
});

test('exact product-id matching still takes priority over a compatible generic row', () => {
  const current = [
    item({ id: 'generic', genericType: 'egg', label: 'Eggs' }),
    item({ id: 'linked', productId: 'sku-eggs-6', label: 'Œufs El Mazraa — boîte de 6' }),
    item({ id: 'note', label: 'eggs' }),
  ];
  const inspect = inspectLinkedCollect(current, { productId: 'sku-eggs-6', nowIso: 't' });
  assert.equal(inspect.kind, 'newly_checked');
  assert.equal(inspect.nextItems.find((row) => row.id === 'linked')?.checked, true);
  assert.equal(inspect.nextItems.find((row) => row.id === 'generic')?.checked, false);
  assert.equal(inspect.nextItems.find((row) => row.id === 'note')?.checked, false);
  assert.equal(matchingUncheckedLinkedItems(current, 'sku-eggs-6')[0]?.id, 'linked');
  assert.equal(
    evaluateAfterAddGenericMatch({
      items: inspect.nextItems,
      product: { canonicalType: 'egg', classificationStatus: 'typed' },
      collectKind: inspect.kind,
    }).kind,
    'none',
  );
});

test('a compatible generic product offers confirmation; several entries require selection', () => {
  const one = [item({ id: 'g1', genericType: 'milk', label: 'Milk' })];
  const many = [
    item({ id: 'g1', genericType: 'milk', label: 'Milk' }),
    item({ id: 'g2', genericType: 'milk', label: 'Milk', quantity: 2 }),
  ];
  const product = { canonicalType: 'milk', classificationStatus: 'typed' as const };
  const single = evaluateAfterAddGenericMatch({ items: one, product, collectKind: 'none' });
  assert.equal(single.kind, 'confirm');
  const several = evaluateAfterAddGenericMatch({ items: many, product, collectKind: 'none' });
  assert.equal(several.kind, 'select');
  assert.equal(several.kind === 'select' ? several.candidates.length : 0, 2);
  assert.equal(
    evaluateAfterAddGenericMatch({
      items: one,
      product,
      collectKind: 'none',
      targetedAlreadyConfirmed: true,
    }).kind,
    'none',
  );
});

test('incompatible targeted generic scans do not check the entry', () => {
  const generic = item({ id: 'g-milk', genericType: 'milk', label: 'Milk' });
  const result = evaluateTargetedGenericScan({
    target: generic,
    product: { canonicalType: 'peanut_butter', classificationStatus: 'typed' },
  });
  assert.equal(result.kind, 'incompatible');
  const plan = applyCollectedMarks([generic], { productId: 'sku-pb', extraItemId: undefined, nowIso: 't' });
  assert.equal(plan.marked, 0);
  assert.equal(plan.nextItems[0]?.checked, false);
  assert.equal(extraItemIdForTargetedAdd(generic), undefined);
});

test('confirming a generic package checks only that entry and never binds a product id', () => {
  const current = [
    item({ id: 'g-milk', genericType: 'milk', label: 'Milk' }),
    item({ id: 'g-egg', genericType: 'egg', label: 'Eggs' }),
    item({ id: 'note', label: 'milk' }),
  ];
  const result = applyCollectedMarks(current, { extraItemId: 'g-milk', nowIso: 't' });
  assert.equal(result.extraMarked, true);
  assert.equal(result.nextItems.find((row) => row.id === 'g-milk')?.checked, true);
  assert.equal(result.nextItems.find((row) => row.id === 'g-milk')?.productId, undefined);
  assert.equal(result.nextItems.find((row) => row.id === 'g-milk')?.genericType, 'milk');
  assert.equal(result.nextItems.find((row) => row.id === 'g-egg')?.checked, false);
  assert.equal(result.nextItems.find((row) => row.id === 'note')?.checked, false);
  assert.equal(isUncheckedManualItem(current[2]), true);
});

test('one confirmed package does not complete a larger planned generic quantity', () => {
  const current = [item({ id: 'g-egg', genericType: 'egg', label: 'Eggs', quantity: 2 })];
  assert.equal(onePackageDoesNotCompleteQuantity(2), true);
  const result = applyCollectedMarks(current, { extraItemId: 'g-egg', nowIso: 't' });
  assert.equal(result.extraMarked, true);
  assert.equal(result.extraDecremented, true);
  const row = result.nextItems[0];
  assert.equal(row?.checked, false);
  assert.equal(row?.quantity, 1);
  assert.equal(row?.genericType, 'egg');
  const done = applyCollectedMarks(result.nextItems, { extraItemId: 'g-egg', nowIso: 't2' });
  assert.equal(done.nextItems[0]?.checked, true);
  assert.equal(done.nextItems[0]?.quantity, 1);
});

test('quantity is remaining planned packages; a failed persist is retried from unchanged items', () => {
  const current = [item({ id: 'g-egg', genericType: 'egg', label: 'Eggs', quantity: 2 })];
  const first = applyCollectedMarks(current, { extraItemId: 'g-egg', nowIso: 't1' });
  assert.equal(first.nextItems[0]?.quantity, 1);
  assert.equal(first.nextItems[0]?.checked, false);
  const retryAfterFailedPersist = applyCollectedMarks(current, { extraItemId: 'g-egg', nowIso: 't1b' });
  assert.equal(retryAfterFailedPersist.nextItems[0]?.quantity, 1);
  assert.equal(retryAfterFailedPersist.nextItems[0]?.checked, false);
  assert.equal(current[0]?.quantity, 2);
});

test('failed or unconfirmed generic extras do not decrement remaining packages', () => {
  const current = [item({ id: 'g-egg', genericType: 'egg', label: 'Eggs', quantity: 2 })];
  const skipped = applyCollectedMarks(current, { productId: 'sku-eggs-6', nowIso: 't' });
  assert.equal(skipped.extraDecremented, false);
  assert.equal(skipped.nextItems[0]?.quantity, 2);
  assert.equal(skipped.nextItems[0]?.checked, false);
});

test('6-egg and 30-egg packs are different products even when both are type egg', () => {
  const generic = item({ id: 'g-egg', genericType: 'egg', label: 'Eggs' });
  const pack6 = { canonicalType: 'egg', classificationStatus: 'typed' as const, id: 'sku-6' };
  const pack30 = { canonicalType: 'egg', classificationStatus: 'typed' as const, id: 'sku-30' };
  assert.equal(productCompatibleWithGenericType(pack6, 'egg'), true);
  assert.equal(productCompatibleWithGenericType(pack30, 'egg'), true);
  assert.notEqual(pack6.id, pack30.id);
  const afterSix = applyCollectedMarks([generic], { extraItemId: 'g-egg', nowIso: 't' });
  assert.equal(afterSix.nextItems[0]?.checked, true);
  assert.equal(matchingUncheckedGenericItems(afterSix.nextItems, 'egg').length, 0);
});

test('personal notes named milk stay notes and are not generic entries', () => {
  const note = item({ id: 'note', label: 'milk' });
  assert.equal(isUncheckedManualItem(note), true);
  assert.equal(isUncheckedGenericItem(note), false);
  assert.equal(genericTypeOfferedForDraft(note.label), 'milk');
  assert.equal(
    evaluateTargetedGenericScan({
      target: note,
      product: { canonicalType: 'milk', classificationStatus: 'typed' },
    }).kind,
    'not_applicable',
  );
});

test('generic confirmation is discarded on account change and cancelled without checking', () => {
  const current = [item({ id: 'g-milk', genericType: 'milk', label: 'Milk' })];
  const started = captureAccountScope('A', 1);
  assert.equal(
    evaluateGenericMatchCommit({
      started,
      current: captureAccountScope('B', 2),
      items: current,
      entryId: 'g-milk',
      expectedType: 'milk',
    }).ok,
    false,
  );
  const ok = evaluateGenericMatchCommit({
    started,
    current: started,
    items: current,
    entryId: 'g-milk',
    expectedType: 'milk',
  });
  assert.equal(ok.ok, true);
  assert.equal(current[0]?.checked, false);
});

test('cancelling a targeted generic scan leaves the entry unchecked', () => {
  const current = [item({ id: 'g-egg', genericType: 'egg', label: 'Eggs' })];
  const cancelled = applyCollectedMarks(current, { productId: 'sku-eggs-6', nowIso: 't' });
  assert.equal(cancelled.marked, 0);
  assert.equal(cancelled.nextItems[0]?.checked, false);
  assert.equal(current[0]?.checked, false);
});
