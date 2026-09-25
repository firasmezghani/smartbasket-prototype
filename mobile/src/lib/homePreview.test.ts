import test from 'node:test';
import assert from 'node:assert/strict';

import { captureAccountScope } from './accountScope';
import type { ShoppingListItem } from '../types/shoppingList';
import {
  HOME_LIST_PREVIEW_LIMIT,
  HOME_RECIPE_DEBOUNCE_MS,
  basketEvidenceKey,
  homeBasketSummaryState,
  homeListCardState,
  isRecipeResultCurrent,
  shouldHideBasketRecipeWhileRefreshing,
  homeGreetingFirstName,
  homeBasketUnitsDifferFromProducts,
  selectHomeExploreProducts,
  HOME_EXPLORE_PRODUCT_IDS,
  HOME_EXPLORE_LIMIT,
  HOME_EXPLORE_FETCH_LIMIT,
  shouldSkipFocusRefresh,
} from './homePreview';

function item(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id: '1',
    label: 'Milk',
    quantity: 1,
    checked: false,
    createdAt: 't',
    ...overrides,
  };
}

test('empty lists are never completed; signed-out and loading stay distinct', () => {
  assert.equal(
    homeListCardState({ ready: true, signedIn: true, items: [], basketUnits: 2, basketKnown: true }).kind,
    'empty',
  );
  assert.equal(
    homeListCardState({ ready: false, signedIn: true, items: [item()], basketUnits: 0, basketKnown: true }).kind,
    'loading',
  );
  assert.equal(
    homeListCardState({ ready: true, signedIn: false, items: [item()], basketUnits: 0, basketKnown: false }).kind,
    'signedOut',
  );
});

test('incomplete lists expose remaining entries; completed lists depend on a known basket', () => {
  const incomplete = homeListCardState({
    ready: true,
    signedIn: true,
    items: [item({ id: 'a', checked: true }), item({ id: 'b', label: 'Rice' }), item({ id: 'c', label: 'Eggs' })],
    basketUnits: 0,
    basketKnown: true,
  });
  assert.equal(incomplete.kind, 'incomplete');
  assert.equal(incomplete.remaining, 2);
  assert.deepEqual(incomplete.preview.map((row) => row.label), ['Rice', 'Eggs']);
  assert.equal(incomplete.moreUnchecked, 0);
  assert.equal(HOME_LIST_PREVIEW_LIMIT, 2);

  const longList = homeListCardState({
    ready: true,
    signedIn: true,
    items: [
      item({ id: 'a', label: 'A' }),
      item({ id: 'b', label: 'B' }),
      item({ id: 'c', label: 'C' }),
      item({ id: 'd', label: 'D', checked: true }),
    ],
    basketUnits: 0,
    basketKnown: true,
  });
  assert.equal(longList.remaining, 3);
  assert.deepEqual(longList.preview.map((row) => row.label), ['A', 'B']);
  assert.equal(longList.moreUnchecked, 1);

  const doneWithBasket = homeListCardState({
    ready: true,
    signedIn: true,
    items: [item({ checked: true })],
    basketUnits: 3,
    basketKnown: true,
  });
  assert.equal(doneWithBasket.kind, 'completeWithBasket');

  const doneEmpty = homeListCardState({
    ready: true,
    signedIn: true,
    items: [item({ checked: true })],
    basketUnits: 0,
    basketKnown: true,
  });
  assert.equal(doneEmpty.kind, 'completeEmptyBasket');

  const doneUnknownBasket = homeListCardState({
    ready: true,
    signedIn: true,
    items: [item({ checked: true })],
    basketUnits: 0,
    basketKnown: false,
  });
  assert.equal(doneUnknownBasket.kind, 'completeEmptyBasket');
});

test('unavailable or loading baskets are not presented as a confirmed empty basket or zero total', () => {
  assert.equal(
    homeBasketSummaryState({ signedIn: false, loading: false, cart: { items: [], totalQuantity: 0, grandTotal: 0 } }).kind,
    'hidden',
  );
  assert.equal(
    homeBasketSummaryState({ signedIn: true, loading: true, cart: { items: [], totalQuantity: 0, grandTotal: 0 } }).kind,
    'loading',
  );
  assert.equal(
    homeBasketSummaryState({
      signedIn: true,
      loading: false,
      error: 'fail',
      cart: { items: [], totalQuantity: 0, grandTotal: 0 },
    }).kind,
    'unavailable',
  );
  const empty = homeBasketSummaryState({
    signedIn: true,
    loading: false,
    cart: { items: [], totalQuantity: 0, grandTotal: 0 },
  });
  assert.equal(empty.kind, 'empty');
  assert.equal(empty.amount, null);

  const ready = homeBasketSummaryState({
    signedIn: true,
    loading: false,
    cart: {
      items: [
        { productId: 'a', quantity: 2 },
        { productId: 'b', quantity: 1 },
      ],
      totalQuantity: 3,
      grandTotal: 10.08,
    },
  });
  assert.equal(ready.kind, 'ready');
  assert.equal(ready.uniqueProducts, 2);
  assert.equal(ready.units, 3);
  assert.equal(ready.amount, 10.08);
});

test('basket evidence key changes with product identity and quantity, not render identity', () => {
  const a = {
    items: [
      { productId: 'Milk', quantity: 1 },
      { productId: 'rice', quantity: 2 },
    ],
  };
  const sameOrder = {
    items: [
      { productId: 'rice', quantity: 2 },
      { productId: 'milk', quantity: 1 },
    ],
  };
  const qtyChanged = { items: [{ productId: 'milk', quantity: 2 }, { productId: 'rice', quantity: 2 }] };
  const cleared = { items: [] };
  assert.equal(basketEvidenceKey(a), basketEvidenceKey(sameOrder));
  assert.notEqual(basketEvidenceKey(a), basketEvidenceKey(qtyChanged));
  assert.equal(basketEvidenceKey(cleared), '');
  assert.equal(basketEvidenceKey(null), '');
});

test('focus refresh is skipped when account or basket evidence is already being refreshed', () => {
  assert.equal(
    shouldSkipFocusRefresh({
      lastFetchedAt: 1000,
      lastEvidenceKey: 'a:1',
      currentEvidenceKey: 'a:1',
      now: 1500,
      minIntervalMs: 2000,
      lastGeneration: 1,
      currentGeneration: 1,
    }),
    true,
  );
  assert.equal(
    shouldSkipFocusRefresh({
      lastFetchedAt: 1000,
      lastEvidenceKey: 'a:1',
      currentEvidenceKey: 'a:2',
      now: 1100,
      minIntervalMs: 2000,
      lastGeneration: 1,
      currentGeneration: 1,
    }),
    true,
  );
  assert.equal(
    shouldSkipFocusRefresh({
      lastFetchedAt: 1000,
      lastEvidenceKey: 'a:1',
      currentEvidenceKey: 'a:1',
      now: 1500,
      minIntervalMs: 2000,
      lastGeneration: 1,
      currentGeneration: 3,
    }),
    true,
  );
  assert.equal(
    shouldSkipFocusRefresh({
      lastFetchedAt: 1000,
      lastEvidenceKey: 'a:1',
      currentEvidenceKey: 'a:1',
      now: 4000,
      minIntervalMs: 2000,
      lastGeneration: 1,
      currentGeneration: 1,
    }),
    false,
  );
});

test('stale basket recipes are hidden while a refresh is pending', () => {
  assert.equal(
    shouldHideBasketRecipeWhileRefreshing({
      refreshing: true,
      evidenceStale: false,
      evidenceSource: 'basket',
    }),
    true,
  );
  assert.equal(
    shouldHideBasketRecipeWhileRefreshing({
      refreshing: false,
      evidenceStale: true,
      evidenceSource: 'history',
    }),
    true,
  );
  assert.equal(
    shouldHideBasketRecipeWhileRefreshing({
      refreshing: true,
      evidenceStale: false,
      evidenceSource: 'history',
    }),
    false,
  );
  assert.equal(HOME_RECIPE_DEBOUNCE_MS > 0, true);
});

test('stale recipe responses and other-account generations are ignored', () => {
  const started = captureAccountScope('A', 1);
  assert.equal(
    isRecipeResultCurrent({
      mounted: true,
      requestCurrent: true,
      started,
      current: captureAccountScope('A', 1),
    }),
    true,
  );
  assert.equal(
    isRecipeResultCurrent({
      mounted: false,
      requestCurrent: true,
      started,
      current: captureAccountScope('A', 1),
    }),
    false,
  );
  assert.equal(
    isRecipeResultCurrent({
      mounted: true,
      requestCurrent: false,
      started,
      current: captureAccountScope('A', 1),
    }),
    false,
  );
  assert.equal(
    isRecipeResultCurrent({
      mounted: true,
      requestCurrent: true,
      started,
      current: captureAccountScope('B', 2),
    }),
    false,
  );
  assert.equal(
    isRecipeResultCurrent({
      mounted: true,
      requestCurrent: true,
      started,
      current: captureAccountScope('A', 3),
    }),
    false,
  );
});

test('home greeting, explore selection and basket unit display stay explicit', () => {
  assert.equal(homeGreetingFirstName('Ada Lovelace'), 'Ada');
  assert.equal(homeGreetingFirstName('  Marie  Curie  '), 'Marie');
  assert.equal(homeGreetingFirstName(''), null);
  assert.equal(homeGreetingFirstName('   '), null);
  assert.equal(homeGreetingFirstName(null), null);
  assert.equal(HOME_EXPLORE_PRODUCT_IDS.length, 4);
  assert.equal(HOME_EXPLORE_LIMIT, 4);
  assert.equal(HOME_EXPLORE_FETCH_LIMIT >= 91, true);
  const milk = { id: '786EE07C-DE60-49EF-B2C7-E37FFCDA27E9', name: 'Milk' };
  const eggs = { id: '4636E246-AD49-479B-B434-632A80BF3558', name: 'Eggs' };
  const rice = { id: 'B5D54CAF-5FA9-4AF1-A99A-CB6579110CD5', name: 'Rice' };
  const pasta = { id: '049B4B34-9B24-47DB-A176-3F17043FF1DD', name: 'Pasta' };
  const extra = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Other' };
  assert.deepEqual(
    selectHomeExploreProducts([extra, pasta, rice, eggs, milk]).map((row) => row.name),
    ['Milk', 'Eggs', 'Rice', 'Pasta'],
  );
  assert.deepEqual(selectHomeExploreProducts([{ id: extra.id }]), []);
  assert.deepEqual(selectHomeExploreProducts(null), []);
  assert.equal(
    homeBasketUnitsDifferFromProducts({ kind: 'ready', uniqueProducts: 2, units: 5 }),
    true,
  );
  assert.equal(
    homeBasketUnitsDifferFromProducts({ kind: 'ready', uniqueProducts: 2, units: 2 }),
    false,
  );
});
