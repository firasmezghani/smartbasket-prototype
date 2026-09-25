// Turns chosen missing-ingredient products into list entries, one each.

import type { MissingLinkedProduct } from '../types/recommendations';

const DEFAULT_CHECKLIST_QUANTITY = 1;

// One missing ingredient successfully converted into a checklist-ready entry.
export type RecipeChecklistAddition = {
  // Catalogue product id, pass straight through to `addProductItem`.
  productId: string;
  // User-readable label, the catalogue product name, or the ingredient label.
  label: string;
  quantity: number;
  ingredientKey: string;
  recipeId: string;
};

// Why one input entry could not become a checklist addition.
export type RecipeChecklistSkipReason =
  | 'malformedEntry'
  | 'missingProductId'
  | 'missingLabel'
  | 'duplicateProduct';

export type RecipeChecklistSkippedEntry = {
  ingredientKey: string | null;
  reason: RecipeChecklistSkipReason;
};

export type RecipeChecklistConversionResult = {
  additions: RecipeChecklistAddition[];
  skipped: RecipeChecklistSkippedEntry[];
};

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Convert the selected products into checklist entries, keeping their order and
// skipping duplicates or malformed entries.
export function buildRecipeChecklistAdditions(
  recipeId: string,
  selectedLinkedProducts: readonly MissingLinkedProduct[],
): RecipeChecklistConversionResult {
  const additions: RecipeChecklistAddition[] = [];
  const skipped: RecipeChecklistSkippedEntry[] = [];
  const seenProductIds = new Set<string>();

  const safeRecipeId = isNonBlankString(recipeId) ? recipeId.trim() : '';
  const entries = Array.isArray(selectedLinkedProducts) ? selectedLinkedProducts : [];

  for (const entry of entries) {
    if (!isPlainObject(entry)) {
      skipped.push({ ingredientKey: null, reason: 'malformedEntry' });
      continue;
    }

    const ingredientKey = isNonBlankString(entry.ingredientKey) ? entry.ingredientKey.trim() : null;

    if (!isNonBlankString(entry.productId)) {
      skipped.push({ ingredientKey, reason: 'missingProductId' });
      continue;
    }
    const productId = entry.productId.trim();

    const label = isNonBlankString(entry.productName)
      ? entry.productName.trim()
      : isNonBlankString(entry.label)
        ? entry.label.trim()
        : '';
    if (!label) {
      skipped.push({ ingredientKey, reason: 'missingLabel' });
      continue;
    }

    const dedupeKey = productId.toLowerCase();
    if (seenProductIds.has(dedupeKey)) {
      skipped.push({ ingredientKey, reason: 'duplicateProduct' });
      continue;
    }
    seenProductIds.add(dedupeKey);

    additions.push({
      productId,
      label,
      quantity: DEFAULT_CHECKLIST_QUANTITY,
      ingredientKey: ingredientKey ?? '',
      recipeId: safeRecipeId,
    });
  }

  return { additions, skipped };
}

// Keep only the products for the selected ingredients.
export function selectMissingLinkedProducts(
  missingLinkedProducts: readonly MissingLinkedProduct[],
  selectedIngredientKeys: ReadonlySet<string> | readonly string[],
): MissingLinkedProduct[] {
  const entries = Array.isArray(missingLinkedProducts) ? missingLinkedProducts : [];
  const selected =
    selectedIngredientKeys instanceof Set
      ? selectedIngredientKeys
      : new Set(Array.isArray(selectedIngredientKeys) ? selectedIngredientKeys : []);
  return entries.filter((item) => isPlainObject(item) && selected.has(item.ingredientKey));
}

// Select the products and turn them into checklist entries.
export function buildRecipeChecklistAdditionsFromSelection(
  recipeId: string,
  missingLinkedProducts: readonly MissingLinkedProduct[],
  selectedIngredientKeys: ReadonlySet<string> | readonly string[],
): RecipeChecklistConversionResult {
  const selected = selectMissingLinkedProducts(missingLinkedProducts, selectedIngredientKeys);
  return buildRecipeChecklistAdditions(recipeId, selected);
}
