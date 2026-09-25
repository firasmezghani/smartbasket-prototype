// Adds several products to the list at once, or nothing if the batch is too big.

import type { ShoppingListItem } from '../types/shoppingList';
import { isSupportedGenericType, isUncheckedGenericItem } from './genericChecklist';

export const SHOPPING_LIST_MAX_ITEMS = 100;
export const SHOPPING_LIST_MAX_QUANTITY = 99;

export type ProductListInput = {
  productId: string;
  label: string;
  quantity?: number;
};

export type ShoppingListBatchSkipReason = 'invalid' | 'duplicateInput' | 'capacity';

export type ShoppingListBatchSkip = {
  productId: string | null;
  reason: ShoppingListBatchSkipReason;
};

export type ShoppingListBatchResult = {
  nextItems: ShoppingListItem[];
  added: number;
  merged: number;
  skipped: number;
  skippedDetails: ShoppingListBatchSkip[];
};

export type CollectedMarksResult = {
  nextItems: ShoppingListItem[];
  marked: number;
  extraMarked: boolean;
  extraDecremented: boolean;
};

export type ShoppingListBatchOptions = {
  maxItems?: number;
  // Optional limit on the total quantity of the list.
  maxTotalQuantity?: number;
  createId?: () => string;
  nowIso?: () => string;
};

// Total quantity of unchecked items.
function activeQuantityTotal(items: readonly ShoppingListItem[]): number {
  return items.reduce((sum, item) => {
    if (item?.checked === true) return sum;
    const q = Number(item?.quantity);
    return Number.isFinite(q) && q > 0 ? sum + q : sum;
  }, 0);
}

// Whole number between 1 and the list maximum; 1 when missing or invalid.
export function cleanShoppingListQuantity(quantity?: number): number {
  const parsed = Math.floor(Number(quantity ?? 1));
  return Number.isFinite(parsed) ? Math.min(SHOPPING_LIST_MAX_QUANTITY, Math.max(1, parsed)) : 1;
}

// Trim, collapse whitespace, and cap at the shared 120-character entry limit.
export function cleanShoppingListLabel(label: unknown): string {
  if (typeof label !== 'string') return '';
  return label.trim().replace(/\s+/g, ' ').slice(0, 120);
}

function cleanLabel(label: unknown): string {
  return cleanShoppingListLabel(label);
}

function cleanProductId(productId: unknown): string {
  if (typeof productId !== 'string') return '';
  return productId.trim();
}

// Normalise a product id for case-insensitive comparison.
export function normaliseProductIdForMatch(productId: unknown): string {
  return typeof productId === 'string' ? productId.trim().toLowerCase() : '';
}

// Rows linked to this product id (checked or not).
export function matchingLinkedItems(
  items: readonly ShoppingListItem[],
  productId: unknown,
): ShoppingListItem[] {
  const target = normaliseProductIdForMatch(productId);
  if (!target) return [];
  return items.filter((item) => normaliseProductIdForMatch(item.productId) === target);
}

// Unchecked rows linked to this product id.
export function matchingUncheckedLinkedItems(
  items: readonly ShoppingListItem[],
  productId: unknown,
): ShoppingListItem[] {
  return matchingLinkedItems(items, productId).filter((item) => item.checked !== true);
}

// Is this row a personal note (no product id and no generic type)?
export function isManualPersonalNote(item: ShoppingListItem | null | undefined): boolean {
  return (
    Boolean(item) &&
    !normaliseProductIdForMatch(item!.productId) &&
    !isSupportedGenericType(item!.genericType)
  );
}

// Is this row an unchecked personal note?
export function isUncheckedManualItem(item: ShoppingListItem | null | undefined): boolean {
  return isManualPersonalNote(item) && item!.checked !== true;
}

function isConfirmableExtraItem(item: ShoppingListItem | null | undefined): boolean {
  return isUncheckedManualItem(item) || isUncheckedGenericItem(item);
}

// Load a stored checklist and drop unknown fields.
export function normaliseStoredShoppingListItems(value: unknown): ShoppingListItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as Partial<ShoppingListItem>)
    .filter((item) => typeof item.id === 'string' && typeof item.label === 'string')
    .map((item) => {
      const productId = typeof item.productId === 'string' ? item.productId.trim() : '';
      const genericType =
        !productId && isSupportedGenericType(item.genericType) ? item.genericType : undefined;
      return {
        id: item.id!,
        label: item.label!.trim().slice(0, 120),
        quantity: cleanShoppingListQuantity(item.quantity),
        checked: item.checked === true,
        productId: productId || undefined,
        genericType,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        checkedAt: typeof item.checkedAt === 'string' ? item.checkedAt : undefined,
      };
    })
    .filter((item) => item.label.length > 0)
    .slice(0, SHOPPING_LIST_MAX_ITEMS);
}

// The manual row being scanned for, or null.
export function resolveChecklistScanTarget(
  items: readonly ShoppingListItem[],
  targetItemId: unknown,
): ShoppingListItem | null {
  const id = typeof targetItemId === 'string' ? targetItemId.trim() : '';
  if (!id) return null;
  const item = items.find((row) => row.id === id);
  return isUncheckedManualItem(item) ? item! : null;
}

// Any unchecked row being scanned for, or null.
export function resolveChecklistRowScanTarget(
  items: readonly ShoppingListItem[],
  targetItemId: unknown,
): ShoppingListItem | null {
  const id = typeof targetItemId === 'string' ? targetItemId.trim() : '';
  if (!id) return null;
  const item = items.find((row) => row.id === id);
  if (!item || item.checked === true) return null;
  return item;
}

// Confirmed extra-item check is only valid for an unchecked manual row.
export function extraItemIdForTargetedAdd(
  item: ShoppingListItem | null | undefined,
): string | undefined {
  return isUncheckedManualItem(item) ? item!.id : undefined;
}

// Product id of the row being scanned for.
export function resolveExpectedProductId(opts: {
  target: ShoppingListItem | null | undefined;
  sessionExpectedProductId?: string | null;
}): string | undefined {
  if (!opts.target || isUncheckedManualItem(opts.target) || isUncheckedGenericItem(opts.target)) {
    return undefined;
  }
  const fromRow = normaliseProductIdForMatch(opts.target.productId);
  if (fromRow) return fromRow;
  const fromSession = normaliseProductIdForMatch(opts.sessionExpectedProductId);
  return fromSession || undefined;
}

export type LinkedScanMatch = { kind: 'not_applicable' } | { kind: 'match' } | { kind: 'mismatch' };

// Does the scanned product match the row (same product id)?
export function evaluateLinkedScanMatch(opts: {
  expectedProductId?: string | null;
  scannedProductId?: string | null;
}): LinkedScanMatch {
  const expected = normaliseProductIdForMatch(opts.expectedProductId);
  if (!expected) return { kind: 'not_applicable' };
  const scanned = normaliseProductIdForMatch(opts.scannedProductId);
  if (scanned && scanned === expected) return { kind: 'match' };
  return { kind: 'mismatch' };
}

// Tick matching rows. A generic row with quantity above 1 is reduced by one instead.
export function applyCollectedMarks(
  items: readonly ShoppingListItem[],
  opts: { productId?: string; extraItemId?: string; nowIso: string },
): CollectedMarksResult {
  const ids = new Set(matchingUncheckedLinkedItems(items, opts.productId).map((item) => item.id));
  let extraMarked = false;
  let extraDecremented = false;
  let decrementId = '';
  const extraId = typeof opts.extraItemId === 'string' ? opts.extraItemId.trim() : '';
  if (extraId) {
    const extra = items.find((item) => item.id === extraId);
    if (isUncheckedGenericItem(extra) && extra!.quantity > 1) {
      decrementId = extraId;
      extraMarked = true;
      extraDecremented = true;
    } else if (isConfirmableExtraItem(extra)) {
      ids.add(extraId);
      extraMarked = true;
    }
  }
  if (ids.size === 0 && !decrementId) {
    return { nextItems: items.slice(), marked: 0, extraMarked: false, extraDecremented: false };
  }
  return {
    nextItems: items.map((item) => {
      if (decrementId && item.id === decrementId) {
        return { ...item, quantity: Math.max(1, item.quantity - 1) };
      }
      return ids.has(item.id) ? { ...item, checked: true, checkedAt: opts.nowIso } : item;
    }),
    marked: ids.size + (decrementId ? 1 : 0),
    extraMarked,
    extraDecremented,
  };
}

export type LinkedCollectKind = 'none' | 'newly_checked' | 'already_checked';

export type LinkedCollectInspection = {
  kind: LinkedCollectKind;
  nextItems: ShoppingListItem[];
  marked: number;
  extraMarked: boolean;
  extraDecremented: boolean;
  remainingUnchecked: number;
  eligibleManualCount: number;
};

// What the checklist update will do (used for the add feedback).
export function inspectLinkedCollect(
  items: readonly ShoppingListItem[],
  opts: { productId?: string; extraItemId?: string; nowIso: string },
): LinkedCollectInspection {
  const result = applyCollectedMarks(items, opts);
  const uncheckedLinked = matchingUncheckedLinkedItems(items, opts.productId);
  const anyLinked = matchingLinkedItems(items, opts.productId);
  const kind: LinkedCollectKind =
    uncheckedLinked.length > 0 ? 'newly_checked' : anyLinked.length > 0 ? 'already_checked' : 'none';
  return {
    kind,
    nextItems: result.nextItems,
    marked: result.marked,
    extraMarked: result.extraMarked,
    extraDecremented: result.extraDecremented,
    remainingUnchecked: result.nextItems.filter((item) => item.checked !== true).length,
    eligibleManualCount: result.nextItems.filter((item) => isUncheckedManualItem(item)).length,
  };
}

function defaultId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type SimulatedOutcome = {
  productId: string | null;
  reason: 'invalid' | 'duplicateInput' | 'added' | 'merged' | 'capacity';
};

type SimulateOptions = {
  maxItems: number;
  maxTotalQuantity: number;
  createId: () => string;
  nowIso: () => string;
};

// Try the batch on a copy of the list and record the result of each entry.
function simulateBatch(
  currentItems: readonly ShoppingListItem[],
  inputs: readonly ProductListInput[],
  { maxItems, maxTotalQuantity, createId, nowIso }: SimulateOptions,
): { nextItems: ShoppingListItem[]; added: number; merged: number; outcomes: SimulatedOutcome[] } {
  const nextItems = currentItems.map((item) => ({ ...item }));
  const outcomes: SimulatedOutcome[] = [];
  let added = 0;
  let merged = 0;
  let runningTotalQuantity = activeQuantityTotal(nextItems);

  const seenIncoming = new Set<string>();
  const list = Array.isArray(inputs) ? inputs : [];

  for (const raw of list) {
    const productId = cleanProductId(raw?.productId);
    const label = cleanLabel(raw?.label);
    if (!productId || !label) {
      outcomes.push({ productId: productId || null, reason: 'invalid' });
      continue;
    }

    const dedupeKey = normaliseProductIdForMatch(productId);
    if (seenIncoming.has(dedupeKey)) {
      outcomes.push({ productId, reason: 'duplicateInput' });
      continue;
    }
    seenIncoming.add(dedupeKey);

    const quantity = cleanShoppingListQuantity(raw?.quantity);
    const existingIndex = nextItems.findIndex(
      (item) => normaliseProductIdForMatch(item.productId) === dedupeKey && item.checked !== true,
    );

    if (existingIndex >= 0) {
      const existing = nextItems[existingIndex];
      const capped = Math.min(SHOPPING_LIST_MAX_QUANTITY, existing.quantity + quantity);
      const realDelta = capped - existing.quantity;
      if (runningTotalQuantity + realDelta > maxTotalQuantity) {
        outcomes.push({ productId, reason: 'capacity' });
        continue;
      }
      nextItems[existingIndex] = { ...existing, quantity: capped };
      runningTotalQuantity += realDelta;
      merged += 1;
      outcomes.push({ productId, reason: 'merged' });
      continue;
    }

    if (nextItems.length >= maxItems || runningTotalQuantity + quantity > maxTotalQuantity) {
      outcomes.push({ productId, reason: 'capacity' });
      continue;
    }

    nextItems.push({
      id: createId(),
      label,
      quantity,
      checked: false,
      productId,
      createdAt: nowIso(),
    });
    runningTotalQuantity += quantity;
    added += 1;
    outcomes.push({ productId, reason: 'added' });
  }

  return { nextItems, added, merged, outcomes };
}

// Compute the new list for a batch of additions without saving it. If any
// entry would exceed the limits, the whole batch is rejected.
export function prepareShoppingListProductBatch(
  currentItems: readonly ShoppingListItem[],
  inputs: readonly ProductListInput[],
  options: ShoppingListBatchOptions = {},
): ShoppingListBatchResult {
  const maxItems = options.maxItems ?? SHOPPING_LIST_MAX_ITEMS;
  const maxTotalQuantity =
    typeof options.maxTotalQuantity === 'number' && Number.isFinite(options.maxTotalQuantity)
      ? options.maxTotalQuantity
      : Infinity;
  const createId = options.createId ?? defaultId;
  const nowIso = options.nowIso ?? (() => new Date().toISOString());

  const sim = simulateBatch(currentItems, inputs, { maxItems, maxTotalQuantity, createId, nowIso });
  const batchCapacityExceeded = sim.outcomes.some((o) => o.reason === 'capacity');

  if (!batchCapacityExceeded) {
    const skippedDetails = sim.outcomes
      .filter((o): o is SimulatedOutcome & { reason: 'invalid' | 'duplicateInput' } =>
        o.reason === 'invalid' || o.reason === 'duplicateInput',
      )
      .map((o) => ({ productId: o.productId, reason: o.reason }));
    return {
      nextItems: sim.nextItems,
      added: sim.added,
      merged: sim.merged,
      skipped: skippedDetails.length,
      skippedDetails,
    };
  }

  // Over the limit: reject the whole batch and keep the list unchanged.
  const skippedDetails: ShoppingListBatchSkip[] = sim.outcomes.map((o) =>
    o.reason === 'added' || o.reason === 'merged'
      ? { productId: o.productId, reason: 'capacity' }
      : { productId: o.productId, reason: o.reason as ShoppingListBatchSkipReason },
  );
  return {
    nextItems: currentItems.map((item) => ({ ...item })),
    added: 0,
    merged: 0,
    skipped: skippedDetails.length,
    skippedDetails,
  };
}
