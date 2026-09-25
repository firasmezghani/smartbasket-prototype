import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ShoppingListItem } from '../types/shoppingList';
import {
  PERSONAL_RECIPE_LIST_QUANTITY,
  buildMixedEntriesFromSelections,
  defaultSelectionsForRecipe,
  noteLabelForIngredient,
  packageQuantityForPersonalRecipeAmount,
  prepareMixedChecklistBatch,
  previewPersonalRecipeListRows,
  resolvedChoice,
  selectedIngredientCount,
  selectionFingerprint,
  shouldRefuseDuplicateSubmit,
  type PersonalIngredientSelection,
} from './personalRecipeChecklist';

function item(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id: 'row-1',
    label: 'Flour',
    quantity: 1,
    checked: false,
    createdAt: '2026-09-22T08:00:00.000Z',
    ...overrides,
  };
}

function flourMilk(): PersonalIngredientSelection[] {
  return defaultSelectionsForRecipe([
    { id: 'ing-1', name: 'Flour', amount: '200 g' },
    { id: 'ing-2', name: 'Milk', amount: '250 ml' },
  ]);
}

const labelForGeneric = (type: string) => (type === 'flour' ? 'Flour' : type === 'milk' ? 'Milk' : type);

test('recipe amounts never become shopping package quantities', () => {
  assert.equal(packageQuantityForPersonalRecipeAmount('200 g'), PERSONAL_RECIPE_LIST_QUANTITY);
  assert.equal(packageQuantityForPersonalRecipeAmount('250 ml'), 1);
  assert.equal(packageQuantityForPersonalRecipeAmount('200'), 1);
  assert.equal(PERSONAL_RECIPE_LIST_QUANTITY, 1);
  assert.equal(noteLabelForIngredient('Flour', '200 g'), 'Flour (200 g)');
  const note = noteLabelForIngredient('Flour', '200 g');
  assert.match(note, /200 g/);
  assert.doesNotMatch(note, /^200$/);
});

test('unselected ingredients are omitted; unset choice becomes a personal note', () => {
  const selections = flourMilk();
  selections[1].selected = false;
  const entries = buildMixedEntriesFromSelections(selections, labelForGeneric);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], { kind: 'note', label: 'Flour (200 g)' });
  assert.equal(selectedIngredientCount(selections), 1);
  assert.equal(resolvedChoice(selections[0]).kind, 'note');
});

test('exact and generic choices are explicit and quantity stays 1', () => {
  const selections = flourMilk();
  selections[0].choice = { kind: 'exact', productId: 'sku-flour', label: 'Farine 1 kg' };
  selections[1].choice = { kind: 'generic', genericType: 'milk' };
  const entries = buildMixedEntriesFromSelections(selections, labelForGeneric);
  assert.deepEqual(entries, [
    { kind: 'exact', productId: 'sku-flour', label: 'Farine 1 kg' },
    { kind: 'generic', genericType: 'milk', label: 'Milk' },
  ]);
  const batch = prepareMixedChecklistBatch([], entries, {
    createId: () => 'new-1',
    nowIso: () => 't',
  });
  assert.equal(batch.added, 2);
  assert.equal(batch.merged, 0);
  assert.equal(batch.nextItems[0].quantity, 1);
  assert.equal(batch.nextItems[0].productId, 'sku-flour');
  assert.equal(batch.nextItems[1].genericType, 'milk');
  assert.equal(batch.nextItems[1].quantity, 1);
  assert.equal(batch.nextItems[1].productId, undefined);
});

test('existing exact rows are previewed as updates; 200 g does not become 200 packages', () => {
  const selections = flourMilk();
  selections[0].choice = { kind: 'exact', productId: 'sku-flour', label: 'Farine 1 kg' };
  selections[1].selected = false;
  const current = [item({ productId: 'sku-flour', label: 'Farine 1 kg', quantity: 1 })];
  const previews = previewPersonalRecipeListRows(current, selections, labelForGeneric);
  assert.equal(previews[0].action, 'update');
  assert.equal(previews[0].packageQuantity, 1);
  assert.equal(previews[0].nextQuantity, 2);
  const batch = prepareMixedChecklistBatch(
    current,
    buildMixedEntriesFromSelections(selections, labelForGeneric),
    { createId: () => 'x', nowIso: () => 't' },
  );
  assert.equal(batch.added, 0);
  assert.equal(batch.merged, 1);
  assert.equal(batch.nextItems[0].quantity, 2);
});

test('duplicate submit of the same fingerprint is refused after success, not after failure', () => {
  const fingerprint = selectionFingerprint(flourMilk());
  assert.equal(
    shouldRefuseDuplicateSubmit({
      adding: false,
      lastFingerprint: fingerprint,
      lastSucceeded: true,
      currentFingerprint: fingerprint,
    }),
    true,
  );
  assert.equal(
    shouldRefuseDuplicateSubmit({
      adding: false,
      lastFingerprint: fingerprint,
      lastSucceeded: false,
      currentFingerprint: fingerprint,
    }),
    false,
  );
  assert.equal(
    shouldRefuseDuplicateSubmit({
      adding: true,
      lastFingerprint: null,
      lastSucceeded: false,
      currentFingerprint: fingerprint,
    }),
    true,
  );
});

test('capacity failure rejects the whole mixed batch', () => {
  const current = Array.from({ length: 100 }, (_, i) => item({ id: `r-${i}`, productId: `p-${i}` }));
  const batch = prepareMixedChecklistBatch(current, [{ kind: 'note', label: 'Flour (200 g)' }]);
  assert.equal(batch.added, 0);
  assert.equal(batch.nextItems.length, 100);
  assert.ok(batch.skippedDetails.some((row) => row.reason === 'capacity'));
});

test('personal recipe checklist helpers never import the basket or recommender', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/personalRecipeChecklist.ts'), 'utf8');
  assert.doesNotMatch(source, /CartContext|addItem\(|recommendations/);
  const recipes = readFileSync(join(process.cwd(), 'src/lib/personalRecipes.ts'), 'utf8');
  assert.doesNotMatch(recipes, /CartContext|useRecipeRecommendations|recipes\.json/);
});
