// Personal recipes saved on this device for the signed-in account.

import { isCurrentAccountScope, type AccountScope } from './accountScope';
import { PERSONAL_RECIPES_SCHEMA_VERSION } from './personalRecipesStorage';
import type { PersonalIngredient, PersonalRecipe, PersonalRecipeDraft } from '../types/personalRecipes';

export const PERSONAL_RECIPE_TITLE_MAX = 80;
export const PERSONAL_RECIPE_NAME_MAX = 80;
export const PERSONAL_RECIPE_AMOUNT_MAX = 40;
export const PERSONAL_RECIPE_INSTRUCTIONS_MAX = 2000;
export const PERSONAL_RECIPE_MAX_RECIPES = 30;
export const PERSONAL_RECIPE_MAX_INGREDIENTS = 30;

export type PersonalRecipeValidationIssue =
  | 'empty_title'
  | 'empty_ingredients'
  | 'too_many_ingredients'
  | 'collection_full';

export type PersonalRecipeMutationFailure =
  | 'stale_account'
  | 'removed'
  | 'empty_title'
  | 'empty_ingredients'
  | 'too_many_ingredients'
  | 'collection_full';

export type PersonalRecipesRead =
  | { status: 'empty' }
  | { status: 'ready'; recipes: PersonalRecipe[] }
  | { status: 'malformed' };

export type PersonalRecipeEvaluation =
  | { ok: true; kind: 'unchanged'; nextRecipes: PersonalRecipe[] }
  | { ok: true; kind: 'create' | 'update' | 'delete'; nextRecipes: PersonalRecipe[]; recipe: PersonalRecipe | null }
  | { ok: false; reason: PersonalRecipeMutationFailure };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createPersonalId(): string {
  if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cleanPersonalText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

export function cleanPersonalMultiline(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').replace(/^\s+|\s+$/g, '').slice(0, max);
}

function cleanIngredient(row: unknown, fallbackId: string): PersonalIngredient | null {
  if (!isPlainObject(row)) return null;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : fallbackId;
  const name = cleanPersonalText(row.name, PERSONAL_RECIPE_NAME_MAX);
  if (!name) return null;
  return {
    id,
    name,
    amount: cleanPersonalText(row.amount, PERSONAL_RECIPE_AMOUNT_MAX),
  };
}

function parseStoredRecipe(value: unknown): PersonalRecipe | null {
  if (!isPlainObject(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const title = cleanPersonalText(value.title, PERSONAL_RECIPE_TITLE_MAX);
  if (!id || !title) return null;
  const rawIngredients = Array.isArray(value.ingredients) ? value.ingredients : [];
  const ingredients = rawIngredients
    .map((row, index) => cleanIngredient(row, `${id}-ing-${index}`))
    .filter((row): row is PersonalIngredient => row != null)
    .slice(0, PERSONAL_RECIPE_MAX_INGREDIENTS);
  if (ingredients.length === 0) return null;
  const createdAt = typeof value.createdAt === 'string' && value.createdAt.trim() ? value.createdAt : '';
  const updatedAt = typeof value.updatedAt === 'string' && value.updatedAt.trim() ? value.updatedAt : createdAt;
  if (!createdAt) return null;
  return {
    id,
    title,
    ingredients,
    instructions: cleanPersonalMultiline(value.instructions, PERSONAL_RECIPE_INSTRUCTIONS_MAX),
    createdAt,
    updatedAt: updatedAt || createdAt,
  };
}

// Read the stored recipes. Broken data is reported, not overwritten.
export function parsePersonalRecipesRaw(raw: unknown): PersonalRecipesRead {
  if (raw == null) return { status: 'empty' };
  if (typeof raw !== 'string') return { status: 'malformed' };
  const trimmed = raw.trim();
  if (!trimmed) return { status: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { status: 'malformed' };
  }
  if (!isPlainObject(parsed)) return { status: 'malformed' };
  if (parsed.schemaVersion !== PERSONAL_RECIPES_SCHEMA_VERSION) return { status: 'malformed' };
  if (!Array.isArray(parsed.recipes)) return { status: 'malformed' };
  const seen = new Set<string>();
  const recipes: PersonalRecipe[] = [];
  for (const row of parsed.recipes) {
    const recipe = parseStoredRecipe(row);
    if (!recipe || seen.has(recipe.id)) continue;
    seen.add(recipe.id);
    recipes.push(recipe);
    if (recipes.length >= PERSONAL_RECIPE_MAX_RECIPES) break;
  }
  return { status: 'ready', recipes };
}

export function serialisePersonalRecipes(recipes: readonly PersonalRecipe[]): string {
  return JSON.stringify({
    schemaVersion: PERSONAL_RECIPES_SCHEMA_VERSION,
    recipes,
  });
}

export function emptyPersonalRecipeDraft(): PersonalRecipeDraft {
  return {
    id: null,
    title: '',
    ingredients: [{ id: createPersonalId(), name: '', amount: '' }],
    instructions: '',
  };
}

export function draftFromRecipe(recipe: PersonalRecipe): PersonalRecipeDraft {
  return {
    id: recipe.id,
    title: recipe.title,
    ingredients:
      recipe.ingredients.length > 0
        ? recipe.ingredients.map((row) => ({ ...row }))
        : [{ id: createPersonalId(), name: '', amount: '' }],
    instructions: recipe.instructions,
  };
}

export function addDraftIngredient(draft: PersonalRecipeDraft): PersonalRecipeDraft {
  if (draft.ingredients.length >= PERSONAL_RECIPE_MAX_INGREDIENTS) return draft;
  return {
    ...draft,
    ingredients: [...draft.ingredients, { id: createPersonalId(), name: '', amount: '' }],
  };
}

export function removeDraftIngredient(draft: PersonalRecipeDraft, ingredientId: string): PersonalRecipeDraft {
  const next = draft.ingredients.filter((row) => row.id !== ingredientId);
  return {
    ...draft,
    ingredients: next.length > 0 ? next : [{ id: createPersonalId(), name: '', amount: '' }],
  };
}

function cleanedIngredientsFromDraft(draft: PersonalRecipeDraft): PersonalIngredient[] {
  const seen = new Set<string>();
  const out: PersonalIngredient[] = [];
  for (const row of Array.isArray(draft.ingredients) ? draft.ingredients : []) {
    const cleaned = cleanIngredient(row, row?.id || createPersonalId());
    if (!cleaned || seen.has(cleaned.id)) continue;
    seen.add(cleaned.id);
    out.push(cleaned);
  }
  return out.slice(0, PERSONAL_RECIPE_MAX_INGREDIENTS);
}

export function normalisedDraft(draft: PersonalRecipeDraft): {
  title: string;
  ingredients: PersonalIngredient[];
  instructions: string;
} {
  return {
    title: cleanPersonalText(draft.title, PERSONAL_RECIPE_TITLE_MAX),
    ingredients: cleanedIngredientsFromDraft(draft),
    instructions: cleanPersonalMultiline(draft.instructions, PERSONAL_RECIPE_INSTRUCTIONS_MAX),
  };
}

export function personalRecipeDraftIssue(
  draft: PersonalRecipeDraft,
  collectionSize: number,
  mode: 'create' | 'update',
): PersonalRecipeValidationIssue | null {
  const next = normalisedDraft(draft);
  if (!next.title) return 'empty_title';
  if (next.ingredients.length === 0) return 'empty_ingredients';
  if (next.ingredients.length > PERSONAL_RECIPE_MAX_INGREDIENTS) return 'too_many_ingredients';
  if (mode === 'create' && collectionSize >= PERSONAL_RECIPE_MAX_RECIPES) return 'collection_full';
  return null;
}

export function personalRecipeDraftsEqual(a: PersonalRecipeDraft, b: PersonalRecipeDraft): boolean {
  const left = normalisedDraft(a);
  const right = normalisedDraft(b);
  if (a.id !== b.id) return false;
  if (left.title !== right.title) return false;
  if (left.instructions !== right.instructions) return false;
  if (left.ingredients.length !== right.ingredients.length) return false;
  return left.ingredients.every(
    (row, index) =>
      row.id === right.ingredients[index]?.id &&
      row.name === right.ingredients[index]?.name &&
      row.amount === right.ingredients[index]?.amount,
  );
}

export function hasUnsavedPersonalRecipeChanges(
  draft: PersonalRecipeDraft,
  saved: PersonalRecipe | null,
): boolean {
  if (!saved) {
    const next = normalisedDraft(draft);
    return Boolean(next.title || next.instructions || next.ingredients.length > 0);
  }
  return !personalRecipeDraftsEqual(draft, draftFromRecipe(saved));
}

export function evaluatePersonalRecipeSave(opts: {
  started: AccountScope;
  current: AccountScope;
  recipes: readonly PersonalRecipe[] | null | undefined;
  draft: PersonalRecipeDraft;
  nowIso?: string;
}): PersonalRecipeEvaluation {
  if (!isCurrentAccountScope(opts.started, opts.current)) {
    return { ok: false, reason: 'stale_account' };
  }
  const list = Array.isArray(opts.recipes)
    ? opts.recipes.map((row: PersonalRecipe) => ({
        ...row,
        ingredients: row.ingredients.map((ing: PersonalIngredient) => ({ ...ing })),
      }))
    : [];
  const mode: 'create' | 'update' = opts.draft.id ? 'update' : 'create';
  const issue = personalRecipeDraftIssue(opts.draft, list.length, mode);
  if (issue) return { ok: false, reason: issue };

  const cleaned = normalisedDraft(opts.draft);
  const nowIso = opts.nowIso ?? new Date().toISOString();

  if (mode === 'create') {
    const recipe: PersonalRecipe = {
      id: createPersonalId(),
      title: cleaned.title,
      ingredients: cleaned.ingredients,
      instructions: cleaned.instructions,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    return { ok: true, kind: 'create', nextRecipes: [...list, recipe], recipe };
  }

  const id = opts.draft.id!.trim();
  const index = list.findIndex((row) => row.id === id);
  if (index < 0) return { ok: false, reason: 'removed' };
  const existing = list[index];
  const unchanged =
    existing.title === cleaned.title &&
    existing.instructions === cleaned.instructions &&
    existing.ingredients.length === cleaned.ingredients.length &&
    existing.ingredients.every(
      (row, i) =>
        row.id === cleaned.ingredients[i]?.id &&
        row.name === cleaned.ingredients[i]?.name &&
        row.amount === cleaned.ingredients[i]?.amount,
    );
  if (unchanged) {
    return { ok: true, kind: 'unchanged', nextRecipes: list };
  }
  const recipe: PersonalRecipe = {
    ...existing,
    title: cleaned.title,
    ingredients: cleaned.ingredients,
    instructions: cleaned.instructions,
    updatedAt: nowIso,
  };
  const nextRecipes = list.map((row, i) => (i === index ? recipe : row));
  return { ok: true, kind: 'update', nextRecipes, recipe };
}

export function evaluatePersonalRecipeDelete(opts: {
  started: AccountScope;
  current: AccountScope;
  recipes: readonly PersonalRecipe[] | null | undefined;
  recipeId: unknown;
}): PersonalRecipeEvaluation {
  if (!isCurrentAccountScope(opts.started, opts.current)) {
    return { ok: false, reason: 'stale_account' };
  }
  const id = typeof opts.recipeId === 'string' ? opts.recipeId.trim() : '';
  const list = Array.isArray(opts.recipes) ? opts.recipes.slice() : [];
  if (!id) return { ok: false, reason: 'removed' };
  const nextRecipes = list.filter((row) => row.id !== id);
  if (nextRecipes.length === list.length) {
    return { ok: true, kind: 'unchanged', nextRecipes: list };
  }
  return { ok: true, kind: 'delete', nextRecipes, recipe: null };
}

export async function persistPersonalRecipeChange(opts: {
  evaluation: PersonalRecipeEvaluation;
  commit: (nextRecipes: PersonalRecipe[]) => Promise<void>;
}): Promise<{ wrote: boolean; reason?: PersonalRecipeMutationFailure | 'unchanged' }> {
  if (!opts.evaluation.ok) {
    return { wrote: false, reason: opts.evaluation.reason };
  }
  if (opts.evaluation.kind === 'unchanged') {
    return { wrote: false, reason: 'unchanged' };
  }
  await opts.commit(opts.evaluation.nextRecipes);
  return { wrote: true };
}

export type PersonalRecipesStorage = {
  setItem: (key: string, value: string) => Promise<void>;
};

export type PersonalRecipesPersistSnapshot = {
  key: string;
  generation: number;
};

export function shouldApplyPersonalRecipesToView(opts: {
  startedKey: string;
  currentKey: string | null;
  startedGeneration: number;
  currentGeneration: number;
}): boolean {
  return opts.currentKey === opts.startedKey && opts.startedGeneration === opts.currentGeneration;
}

export async function commitPersonalRecipesForAccount(opts: {
  storage: PersonalRecipesStorage;
  snapshot: PersonalRecipesPersistSnapshot;
  recipes: PersonalRecipe[];
  getCurrentKey: () => string | null;
  getCurrentGeneration: () => number;
  applyVisible: (recipes: PersonalRecipe[]) => void;
}): Promise<{ persisted: true; visibleApplied: boolean; keyWritten: string }> {
  await opts.storage.setItem(opts.snapshot.key, serialisePersonalRecipes(opts.recipes));
  const visibleApplied = shouldApplyPersonalRecipesToView({
    startedKey: opts.snapshot.key,
    currentKey: opts.getCurrentKey(),
    startedGeneration: opts.snapshot.generation,
    currentGeneration: opts.getCurrentGeneration(),
  });
  if (visibleApplied) opts.applyVisible(opts.recipes);
  return { persisted: true, visibleApplied, keyWritten: opts.snapshot.key };
}
