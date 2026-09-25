import test from 'node:test';
import assert from 'node:assert/strict';

import { captureAccountScope } from './accountScope';
import {
  PERSONAL_RECIPES_KEY_PREFIX,
  PERSONAL_RECIPES_SCHEMA_VERSION,
  personalRecipesStorageKey,
} from './personalRecipesStorage';
import {
  PERSONAL_RECIPE_MAX_RECIPES,
  PERSONAL_RECIPE_TITLE_MAX,
  addDraftIngredient,
  commitPersonalRecipesForAccount,
  createPersonalId,
  draftFromRecipe,
  emptyPersonalRecipeDraft,
  evaluatePersonalRecipeDelete,
  evaluatePersonalRecipeSave,
  hasUnsavedPersonalRecipeChanges,
  parsePersonalRecipesRaw,
  persistPersonalRecipeChange,
  removeDraftIngredient,
  serialisePersonalRecipes,
} from './personalRecipes';
import type { PersonalRecipe } from '../types/personalRecipes';

function recipe(overrides: Partial<PersonalRecipe> = {}): PersonalRecipe {
  return {
    id: 'rec-1',
    title: 'Pancakes',
    ingredients: [
      { id: 'ing-1', name: 'Flour', amount: '200 g' },
      { id: 'ing-2', name: 'Milk', amount: '250 ml' },
    ],
    instructions: 'Mix and cook.',
    createdAt: '2026-09-22T08:00:00.000Z',
    updatedAt: '2026-09-22T08:00:00.000Z',
    ...overrides,
  };
}

const started = captureAccountScope('68', 1);
const current = captureAccountScope('68', 1);

test('personalRecipesStorageKey is per-account and null when signed out', () => {
  assert.equal(personalRecipesStorageKey(68), `${PERSONAL_RECIPES_KEY_PREFIX}68`);
  assert.equal(personalRecipesStorageKey('68'), `${PERSONAL_RECIPES_KEY_PREFIX}68`);
  assert.equal(personalRecipesStorageKey(null), null);
  assert.notEqual(personalRecipesStorageKey(1), personalRecipesStorageKey(2));
  assert.equal(PERSONAL_RECIPES_SCHEMA_VERSION, 1);
});

test('blank storage is empty; broken envelopes are malformed and not rewritten as empty', () => {
  assert.deepEqual(parsePersonalRecipesRaw(null), { status: 'empty' });
  assert.deepEqual(parsePersonalRecipesRaw(''), { status: 'empty' });
  assert.deepEqual(parsePersonalRecipesRaw('   '), { status: 'empty' });
  assert.equal(parsePersonalRecipesRaw('{not json').status, 'malformed');
  assert.equal(parsePersonalRecipesRaw('[]').status, 'malformed');
  assert.equal(parsePersonalRecipesRaw('{"schemaVersion":2,"recipes":[]}').status, 'malformed');
  assert.equal(parsePersonalRecipesRaw('{"schemaVersion":1}').status, 'malformed');
  const ready = parsePersonalRecipesRaw(serialisePersonalRecipes([recipe()]));
  assert.equal(ready.status, 'ready');
  if (ready.status === 'ready') {
    assert.equal(ready.recipes.length, 1);
    assert.equal(ready.recipes[0].title, 'Pancakes');
    assert.equal(ready.recipes[0].ingredients[0].amount, '200 g');
  }
});

test('create assigns stable recipe and ingredient ids and requires title plus an ingredient', () => {
  const draft = emptyPersonalRecipeDraft();
  draft.title = '  Oat porridge  ';
  draft.ingredients = [
    { id: 'keep-me', name: '  Oats  ', amount: ' 40 g ' },
    { id: 'blank', name: '   ', amount: '1' },
  ];
  const created = evaluatePersonalRecipeSave({
    started,
    current,
    recipes: [],
    draft,
    nowIso: '2026-09-22T09:00:00.000Z',
  });
  assert.equal(created.ok, true);
  if (!created.ok || created.kind !== 'create' || !created.recipe) throw new Error('expected create');
  assert.ok(created.recipe.id);
  assert.notEqual(created.recipe.id, 'keep-me');
  assert.equal(created.recipe.title, 'Oat porridge');
  assert.equal(created.recipe.ingredients.length, 1);
  assert.equal(created.recipe.ingredients[0].id, 'keep-me');
  assert.equal(created.recipe.ingredients[0].name, 'Oats');
  assert.equal(created.recipe.ingredients[0].amount, '40 g');

  const missingTitle = evaluatePersonalRecipeSave({
    started,
    current,
    recipes: [],
    draft: { ...emptyPersonalRecipeDraft(), ingredients: [{ id: 'a', name: 'Flour', amount: '' }] },
  });
  assert.deepEqual(missingTitle, { ok: false, reason: 'empty_title' });

  const missingIng = evaluatePersonalRecipeSave({
    started,
    current,
    recipes: [],
    draft: { id: null, title: 'Soup', ingredients: [{ id: 'a', name: '  ', amount: '1' }], instructions: '' },
  });
  assert.deepEqual(missingIng, { ok: false, reason: 'empty_ingredients' });
});

test('edit keeps recipe identity and does not overwrite unrelated recipes', () => {
  const other = recipe({ id: 'rec-other', title: 'Other' });
  const existing = recipe();
  const draft = draftFromRecipe(existing);
  draft.title = 'Fluffy pancakes';
  draft.ingredients.push({ id: 'ing-3', name: 'Egg', amount: '1' });
  const updated = evaluatePersonalRecipeSave({
    started,
    current,
    recipes: [other, existing],
    draft,
    nowIso: '2026-09-22T10:00:00.000Z',
  });
  assert.equal(updated.ok, true);
  if (!updated.ok || updated.kind !== 'update' || !updated.recipe) throw new Error('expected update');
  assert.equal(updated.recipe.id, 'rec-1');
  assert.equal(updated.recipe.createdAt, existing.createdAt);
  assert.equal(updated.recipe.updatedAt, '2026-09-22T10:00:00.000Z');
  assert.equal(updated.nextRecipes[0].title, 'Other');
  assert.equal(updated.nextRecipes[1].title, 'Fluffy pancakes');
  assert.equal(updated.nextRecipes[1].ingredients[2].name, 'Egg');
});

test('unchanged save does not write; cancelled empty create is not dirty', () => {
  const existing = recipe();
  const unchanged = evaluatePersonalRecipeSave({
    started,
    current,
    recipes: [existing],
    draft: draftFromRecipe(existing),
  });
  assert.equal(unchanged.ok, true);
  if (!unchanged.ok) throw new Error('expected ok');
  assert.equal(unchanged.kind, 'unchanged');
  assert.equal(hasUnsavedPersonalRecipeChanges(emptyPersonalRecipeDraft(), null), false);
  const dirty = draftFromRecipe(existing);
  dirty.title = 'Changed';
  assert.equal(hasUnsavedPersonalRecipeChanges(dirty, existing), true);
});

test('deleted recipes are not recreated by a stale editor', () => {
  const draft = draftFromRecipe(recipe());
  const result = evaluatePersonalRecipeSave({
    started,
    current,
    recipes: [recipe({ id: 'other' })],
    draft,
  });
  assert.deepEqual(result, { ok: false, reason: 'removed' });
});

test('A→B→A generation change invalidates pending saves', () => {
  const draft = { ...emptyPersonalRecipeDraft(), title: 'Soup', ingredients: [{ id: 'a', name: 'Stock', amount: '' }] };
  const stale = evaluatePersonalRecipeSave({
    started,
    current: captureAccountScope('68', 2),
    recipes: [],
    draft,
  });
  assert.deepEqual(stale, { ok: false, reason: 'stale_account' });
  const switched = evaluatePersonalRecipeSave({
    started,
    current: captureAccountScope('99', 1),
    recipes: [],
    draft,
  });
  assert.deepEqual(switched, { ok: false, reason: 'stale_account' });
  const returned = evaluatePersonalRecipeSave({
    started: captureAccountScope('68', 1),
    current: captureAccountScope('68', 3),
    recipes: [],
    draft,
  });
  assert.deepEqual(returned, { ok: false, reason: 'stale_account' });
});

test('delete removes only the targeted recipe', () => {
  const collection = [recipe(), recipe({ id: 'rec-2', title: 'Stew' })];
  const deleted = evaluatePersonalRecipeDelete({
    started,
    current,
    recipes: collection,
    recipeId: 'rec-1',
  });
  assert.equal(deleted.ok, true);
  if (!deleted.ok || deleted.kind !== 'delete') throw new Error('expected delete');
  assert.deepEqual(deleted.nextRecipes.map((row) => row.id), ['rec-2']);
});

test('storage failure does not report success', async () => {
  const evaluation = evaluatePersonalRecipeSave({
    started,
    current,
    recipes: [],
    draft: { id: null, title: 'Soup', ingredients: [{ id: 'a', name: 'Salt', amount: '' }], instructions: '' },
  });
  await assert.rejects(
    persistPersonalRecipeChange({
      evaluation,
      commit: async () => {
        throw new Error('disk full');
      },
    }),
    /disk full/,
  );
  const skipped = await persistPersonalRecipeChange({
    evaluation: { ok: false, reason: 'empty_title' },
    commit: async () => {
      throw new Error('should not write');
    },
  });
  assert.deepEqual(skipped, { wrote: false, reason: 'empty_title' });
});

test('commit writes the started account key and ignores A→B→A view updates', async () => {
  const data = new Map<string, string>();
  let visible: PersonalRecipe[] = [];
  let currentKey = `${PERSONAL_RECIPES_KEY_PREFIX}68`;
  let generation = 1;
  const saved = recipe();
  await commitPersonalRecipesForAccount({
    storage: {
      async setItem(key, value) {
        data.set(key, value);
      },
    },
    snapshot: { key: `${PERSONAL_RECIPES_KEY_PREFIX}68`, generation: 1 },
    recipes: [saved],
    getCurrentKey: () => currentKey,
    getCurrentGeneration: () => generation,
    applyVisible: (recipes) => {
      visible = recipes;
    },
  });
  assert.ok(data.get(`${PERSONAL_RECIPES_KEY_PREFIX}68`)?.includes('Pancakes'));
  assert.equal(visible[0]?.id, 'rec-1');

  visible = [];
  currentKey = `${PERSONAL_RECIPES_KEY_PREFIX}99`;
  generation = 2;
  await commitPersonalRecipesForAccount({
    storage: {
      async setItem(key, value) {
        data.set(key, value);
      },
    },
    snapshot: { key: `${PERSONAL_RECIPES_KEY_PREFIX}68`, generation: 1 },
    recipes: [recipe({ title: 'Should stay on 68' })],
    getCurrentKey: () => currentKey,
    getCurrentGeneration: () => generation,
    applyVisible: (recipes) => {
      visible = recipes;
    },
  });
  assert.equal(visible.length, 0);
  assert.match(data.get(`${PERSONAL_RECIPES_KEY_PREFIX}68`) ?? '', /Should stay on 68/);
  assert.equal(data.has(`${PERSONAL_RECIPES_KEY_PREFIX}99`), false);
});

test('title cap and collection cap use documented limits', () => {
  const long = 'x'.repeat(PERSONAL_RECIPE_TITLE_MAX + 20);
  const draft = {
    id: null as string | null,
    title: long,
    ingredients: [{ id: 'a', name: 'Salt', amount: '' }],
    instructions: '',
  };
  const created = evaluatePersonalRecipeSave({ started, current, recipes: [], draft });
  assert.equal(created.ok, true);
  if (!created.ok || created.kind === 'unchanged' || !created.recipe) throw new Error('expected create');
  assert.equal(created.recipe.title.length, PERSONAL_RECIPE_TITLE_MAX);

  const full = Array.from({ length: PERSONAL_RECIPE_MAX_RECIPES }, (_, i) => recipe({ id: `r-${i}` }));
  const blocked = evaluatePersonalRecipeSave({ started, current, recipes: full, draft });
  assert.deepEqual(blocked, { ok: false, reason: 'collection_full' });
});

test('add/remove ingredient rows keep at least one slot and unique ids', () => {
  let draft = emptyPersonalRecipeDraft();
  const firstId = draft.ingredients[0].id;
  draft = addDraftIngredient(draft);
  assert.equal(draft.ingredients.length, 2);
  assert.notEqual(draft.ingredients[1].id, firstId);
  draft = removeDraftIngredient(draft, firstId);
  assert.equal(draft.ingredients.length, 1);
  draft = removeDraftIngredient(draft, draft.ingredients[0].id);
  assert.equal(draft.ingredients.length, 1);
  assert.ok(createPersonalId());
});
