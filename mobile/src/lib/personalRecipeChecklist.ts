// Adds a personal recipe's ingredients to the list. The basket is not changed.

import type { ShoppingListItem } from '../types/shoppingList';
import type { PersonalIngredient } from '../types/personalRecipes';
import {
  isSupportedGenericType,
  matchingUncheckedGenericItems,
  type GenericChecklistType,
} from './genericChecklist';
import {
  cleanShoppingListLabel,
  matchingUncheckedLinkedItems,
  prepareShoppingListProductBatch,
  SHOPPING_LIST_MAX_ITEMS,
  type ShoppingListBatchOptions,
  type ShoppingListBatchSkip,
} from './shoppingListBatch';
import { cleanPersonalText, PERSONAL_RECIPE_AMOUNT_MAX, PERSONAL_RECIPE_NAME_MAX } from './personalRecipes';

export const PERSONAL_RECIPE_LIST_QUANTITY = 1;

export type PersonalListChoice =
  | { kind: 'exact'; productId: string; label: string }
  | { kind: 'generic'; genericType: GenericChecklistType }
  | { kind: 'note' };

export type PersonalIngredientSelection = {
  ingredientId: string;
  name: string;
  amount: string;
  selected: boolean;
  choice: PersonalListChoice | null;
};

export type MixedChecklistEntry =
  | { kind: 'exact'; productId: string; label: string }
  | { kind: 'generic'; genericType: GenericChecklistType; label: string }
  | { kind: 'note'; label: string };

export type ChecklistPreviewAction = 'add' | 'update';

export type PersonalRecipeListPreviewRow = {
  ingredientId: string;
  name: string;
  amount: string;
  listLabel: string;
  packageQuantity: typeof PERSONAL_RECIPE_LIST_QUANTITY;
  action: ChecklistPreviewAction;
  choiceKind: PersonalListChoice['kind'];
  existingQuantity?: number;
  nextQuantity?: number;
};

export type MixedChecklistBatchResult = {
  nextItems: ShoppingListItem[];
  added: number;
  merged: number;
  skipped: number;
  skippedDetails: ShoppingListBatchSkip[];
  previews: PersonalRecipeListPreviewRow[];
};

function defaultId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cleanRecipeAmount(value: unknown): string {
  return cleanPersonalText(value, PERSONAL_RECIPE_AMOUNT_MAX);
}

// Personal-note label. Amount is optional text in parentheses, never a qty.
export function noteLabelForIngredient(name: unknown, amount: unknown): string {
  const n = cleanPersonalText(name, PERSONAL_RECIPE_NAME_MAX);
  if (!n) return '';
  const a = cleanRecipeAmount(amount);
  return a ? cleanShoppingListLabel(`${n} (${a})`) : cleanShoppingListLabel(n);
}

export function defaultSelectionsForRecipe(
  ingredients: readonly PersonalIngredient[],
): PersonalIngredientSelection[] {
  return (Array.isArray(ingredients) ? ingredients : []).map((row) => ({
    ingredientId: row.id,
    name: row.name,
    amount: row.amount,
    selected: true,
    choice: null,
  }));
}

export function resolvedChoice(selection: PersonalIngredientSelection): PersonalListChoice {
  if (selection.choice?.kind === 'exact') {
    const productId = selection.choice.productId.trim();
    const label = cleanShoppingListLabel(selection.choice.label);
    if (productId && label) return { kind: 'exact', productId, label };
  }
  if (selection.choice?.kind === 'generic' && isSupportedGenericType(selection.choice.genericType)) {
    return { kind: 'generic', genericType: selection.choice.genericType };
  }
  return { kind: 'note' };
}

export function selectionFingerprint(selections: readonly PersonalIngredientSelection[]): string {
  return JSON.stringify(
    selections
      .filter((row) => row.selected)
      .map((row) => ({
        id: row.ingredientId,
        choice: resolvedChoice(row),
      })),
  );
}

export function shouldRefuseDuplicateSubmit(opts: {
  adding: boolean;
  lastFingerprint: string | null;
  lastSucceeded: boolean;
  currentFingerprint: string;
}): boolean {
  if (opts.adding) return true;
  if (!opts.lastSucceeded || !opts.lastFingerprint) return false;
  return opts.lastFingerprint === opts.currentFingerprint;
}

export function selectedIngredientCount(selections: readonly PersonalIngredientSelection[]): number {
  return selections.filter((row) => row.selected).length;
}

export function buildMixedEntriesFromSelections(
  selections: readonly PersonalIngredientSelection[],
  labelForGeneric: (type: GenericChecklistType) => string,
): MixedChecklistEntry[] {
  const entries: MixedChecklistEntry[] = [];
  for (const row of selections) {
    if (!row.selected) continue;
    const choice = resolvedChoice(row);
    if (choice.kind === 'exact') {
      entries.push({ kind: 'exact', productId: choice.productId, label: choice.label });
      continue;
    }
    if (choice.kind === 'generic') {
      entries.push({
        kind: 'generic',
        genericType: choice.genericType,
        label: labelForGeneric(choice.genericType),
      });
      continue;
    }
    const label = noteLabelForIngredient(row.name, row.amount);
    if (label) entries.push({ kind: 'note', label });
  }
  return entries;
}

export function previewPersonalRecipeListRows(
  currentItems: readonly ShoppingListItem[],
  selections: readonly PersonalIngredientSelection[],
  labelForGeneric: (type: GenericChecklistType) => string,
): PersonalRecipeListPreviewRow[] {
  const rows: PersonalRecipeListPreviewRow[] = [];
  const seenExact = new Set<string>();
  const seenGeneric = new Set<string>();
  for (const selection of selections) {
    if (!selection.selected) continue;
    const choice = resolvedChoice(selection);
    const amount = cleanRecipeAmount(selection.amount);
    const name = cleanPersonalText(selection.name, PERSONAL_RECIPE_NAME_MAX) || selection.name;
    if (choice.kind === 'exact') {
      const key = choice.productId.trim().toLowerCase();
      const existing = matchingUncheckedLinkedItems(currentItems, choice.productId)[0];
      const isDup = seenExact.has(key);
      seenExact.add(key);
      const action: ChecklistPreviewAction = !isDup && existing ? 'update' : 'add';
      rows.push({
        ingredientId: selection.ingredientId,
        name,
        amount,
        listLabel: choice.label,
        packageQuantity: PERSONAL_RECIPE_LIST_QUANTITY,
        action: isDup ? 'add' : action,
        choiceKind: 'exact',
        existingQuantity: existing && !isDup ? existing.quantity : undefined,
        nextQuantity:
          existing && !isDup ? existing.quantity + PERSONAL_RECIPE_LIST_QUANTITY : PERSONAL_RECIPE_LIST_QUANTITY,
      });
      continue;
    }
    if (choice.kind === 'generic') {
      const isDup = seenGeneric.has(choice.genericType);
      seenGeneric.add(choice.genericType);
      const existing = matchingUncheckedGenericItems(currentItems, choice.genericType)[0];
      rows.push({
        ingredientId: selection.ingredientId,
        name,
        amount,
        listLabel: labelForGeneric(choice.genericType),
        packageQuantity: PERSONAL_RECIPE_LIST_QUANTITY,
        action: 'add',
        choiceKind: 'generic',
        existingQuantity: existing && !isDup ? existing.quantity : undefined,
      });
      continue;
    }
    rows.push({
      ingredientId: selection.ingredientId,
      name,
      amount,
      listLabel: noteLabelForIngredient(selection.name, selection.amount),
      packageQuantity: PERSONAL_RECIPE_LIST_QUANTITY,
      action: 'add',
      choiceKind: 'note',
    });
  }
  return rows;
}

// Add all chosen ingredients at once, or none if the list limit is reached.
export function prepareMixedChecklistBatch(
  currentItems: readonly ShoppingListItem[],
  entries: readonly MixedChecklistEntry[],
  options: ShoppingListBatchOptions = {},
): MixedChecklistBatchResult {
  const maxItems = options.maxItems ?? SHOPPING_LIST_MAX_ITEMS;
  const createId = options.createId ?? defaultId;
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const list = Array.isArray(currentItems) ? currentItems : [];
  const incoming = Array.isArray(entries) ? entries : [];

  const exactInputs = incoming
    .filter((entry): entry is Extract<MixedChecklistEntry, { kind: 'exact' }> => entry.kind === 'exact')
    .map((entry) => ({
      productId: entry.productId,
      label: entry.label,
      quantity: PERSONAL_RECIPE_LIST_QUANTITY,
    }));

  const productBatch = prepareShoppingListProductBatch(list, exactInputs, {
    ...options,
    maxItems,
    createId,
    nowIso,
  });

  if (productBatch.skippedDetails.some((row) => row.reason === 'capacity')) {
    return {
      nextItems: list.map((item) => ({ ...item })),
      added: 0,
      merged: 0,
      skipped: incoming.length,
      skippedDetails: incoming.map(() => ({ productId: null, reason: 'capacity' as const })),
      previews: [],
    };
  }

  const nextItems = productBatch.nextItems.map((item) => ({ ...item }));
  let added = productBatch.added;
  let merged = productBatch.merged;
  const skippedDetails: ShoppingListBatchSkip[] = [...productBatch.skippedDetails];
  const seenGeneric = new Set<string>();

  for (const entry of incoming) {
    if (entry.kind === 'exact') continue;
    if (entry.kind === 'generic') {
      if (seenGeneric.has(entry.genericType)) {
        skippedDetails.push({ productId: null, reason: 'duplicateInput' });
        continue;
      }
      seenGeneric.add(entry.genericType);
      const label = cleanShoppingListLabel(entry.label);
      if (!label || !isSupportedGenericType(entry.genericType)) {
        skippedDetails.push({ productId: null, reason: 'invalid' });
        continue;
      }
      if (nextItems.length >= maxItems) {
        return {
          nextItems: list.map((item) => ({ ...item })),
          added: 0,
          merged: 0,
          skipped: incoming.length,
          skippedDetails: incoming.map(() => ({ productId: null, reason: 'capacity' as const })),
          previews: [],
        };
      }
      nextItems.push({
        id: createId(),
        label,
        quantity: PERSONAL_RECIPE_LIST_QUANTITY,
        checked: false,
        genericType: entry.genericType,
        createdAt: nowIso(),
      });
      added += 1;
      continue;
    }
    const label = cleanShoppingListLabel(entry.label);
    if (!label) {
      skippedDetails.push({ productId: null, reason: 'invalid' });
      continue;
    }
    if (nextItems.length >= maxItems) {
      return {
        nextItems: list.map((item) => ({ ...item })),
        added: 0,
        merged: 0,
        skipped: incoming.length,
        skippedDetails: incoming.map(() => ({ productId: null, reason: 'capacity' as const })),
        previews: [],
      };
    }
    nextItems.push({
      id: createId(),
      label,
      quantity: PERSONAL_RECIPE_LIST_QUANTITY,
      checked: false,
      createdAt: nowIso(),
    });
    added += 1;
  }

  return {
    nextItems,
    added,
    merged,
    skipped: skippedDetails.length,
    skippedDetails,
    previews: [],
  };
}

export function packageQuantityForPersonalRecipeAmount(_amount: unknown): number {
  return PERSONAL_RECIPE_LIST_QUANTITY;
}
