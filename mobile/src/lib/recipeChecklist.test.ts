import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRecipeChecklistAdditions,
  buildRecipeChecklistAdditionsFromSelection,
  selectMissingLinkedProducts,
} from './recipeChecklist';
import type { MissingLinkedProduct } from '../types/recommendations';

function linked(overrides: Partial<MissingLinkedProduct> = {}): MissingLinkedProduct {
  return {
    ingredientKey: 'tomato',
    label: 'Tomato',
    essential: true,
    productId: 'prod-1',
    productName: 'Fresh Tomatoes',
    confidence: 'exact',
    matchedRule: 'exact_phrase',
    ...overrides,
  };
}

test('uses the linked catalogue product id and a readable label', () => {
  const result = buildRecipeChecklistAdditions('r-pasta', [linked()]);
  assert.equal(result.additions.length, 1);
  assert.deepEqual(result.additions[0], {
    productId: 'prod-1',
    label: 'Fresh Tomatoes',
    quantity: 1,
    ingredientKey: 'tomato',
    recipeId: 'r-pasta',
  });
  assert.deepEqual(result.skipped, []);
});

test('falls back to the ingredient label when the product name is blank', () => {
  const result = buildRecipeChecklistAdditions('r-pasta', [linked({ productName: '' })]);
  assert.equal(result.additions[0].label, 'Tomato');
});

test('prevents duplicate linked products, case-insensitively', () => {
  const result = buildRecipeChecklistAdditions('r-pasta', [
    linked({ ingredientKey: 'tomato', productId: 'PROD-1' }),
    linked({ ingredientKey: 'garlic', productId: 'prod-1' }),
  ]);
  assert.equal(result.additions.length, 1);
  assert.equal(result.additions[0].ingredientKey, 'tomato');
  assert.deepEqual(result.skipped, [{ ingredientKey: 'garlic', reason: 'duplicateProduct' }]);
});

test('preserves the order the caller supplied (no re-sorting)', () => {
  const result = buildRecipeChecklistAdditions('r-pasta', [
    linked({ ingredientKey: 'b', productId: 'p-b' }),
    linked({ ingredientKey: 'a', productId: 'p-a' }),
  ]);
  assert.deepEqual(
    result.additions.map((a) => a.ingredientKey),
    ['b', 'a'],
  );
});

test('ignores malformed entries safely instead of throwing', () => {
  const malformed = [null, undefined, 42, 'x', []] as unknown as MissingLinkedProduct[];
  assert.doesNotThrow(() => buildRecipeChecklistAdditions('r-pasta', malformed));
  const result = buildRecipeChecklistAdditions('r-pasta', malformed);
  assert.equal(result.additions.length, 0);
  assert.equal(result.skipped.length, 5);
  assert.ok(result.skipped.every((s) => s.reason === 'malformedEntry'));
});

test('reports (but does not throw on) an entry missing a linked product id', () => {
  const result = buildRecipeChecklistAdditions('r-pasta', [
    linked({ productId: '' }),
    linked({ productId: '   ' }),
  ]);
  assert.equal(result.additions.length, 0);
  assert.ok(result.skipped.every((s) => s.reason === 'missingProductId'));
});

test('reports an entry with no usable label', () => {
  const result = buildRecipeChecklistAdditions('r-pasta', [linked({ productName: '', label: '' })]);
  assert.equal(result.additions.length, 0);
  assert.equal(result.skipped[0].reason, 'missingLabel');
});

test('does not mutate the input array or its entries', () => {
  const input = Object.freeze([Object.freeze(linked())]);
  assert.doesNotThrow(() => buildRecipeChecklistAdditions('r-pasta', input));
  assert.equal(input.length, 1);
  assert.equal(input[0].productId, 'prod-1');
});

test('is a pure function: identical input produces identical, unshared output', () => {
  const input = [linked(), linked({ ingredientKey: 'garlic', productId: 'prod-2' })];
  const first = buildRecipeChecklistAdditions('r-pasta', input);
  const second = buildRecipeChecklistAdditions('r-pasta', input);
  assert.deepEqual(first, second);
  assert.notEqual(first.additions, second.additions);
});

test('selectMissingLinkedProducts filters by ingredient key and ignores unknown keys', () => {
  const all = [linked({ ingredientKey: 'tomato' }), linked({ ingredientKey: 'garlic', productId: 'p2' })];
  const selected = selectMissingLinkedProducts(all, ['garlic', 'not-on-the-recipe']);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].ingredientKey, 'garlic');
});

test('buildRecipeChecklistAdditionsFromSelection combines filtering and conversion', () => {
  const all = [linked({ ingredientKey: 'tomato' }), linked({ ingredientKey: 'garlic', productId: 'p2' })];
  const result = buildRecipeChecklistAdditionsFromSelection('r-pasta', all, new Set(['garlic']));
  assert.equal(result.additions.length, 1);
  assert.equal(result.additions[0].ingredientKey, 'garlic');
});

test('buildRecipeChecklistAdditionsFromSelection reports duplicate/malformed links after filtering', () => {
  const all = [
    linked({ ingredientKey: 'tomato', productId: 'shared' }),
    linked({ ingredientKey: 'garlic', productId: 'shared' }),
    { ingredientKey: 'onion' } as unknown as MissingLinkedProduct,
  ];
  const result = buildRecipeChecklistAdditionsFromSelection(
    'r-pasta',
    all,
    new Set(['tomato', 'garlic', 'onion']),
  );
  assert.equal(result.additions.length, 1);
  assert.equal(result.additions[0].ingredientKey, 'tomato');
  assert.deepEqual(
    result.skipped.map((s) => s.reason).sort(),
    ['duplicateProduct', 'missingProductId'],
  );
});
