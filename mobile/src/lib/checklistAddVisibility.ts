// After adding to the checklist: what to show and whether to scroll to the row.

import type { ShoppingListItem } from '../types/shoppingList';
import { normaliseProductIdForMatch } from './shoppingListBatch';

export type ChecklistAddKind = 'added' | 'updated';

export type ChecklistAddResult = {
  id: string;
  kind: ChecklistAddKind;
  label: string;
};

export function shouldAcceptDraftAddStart(opts: {
  inFlight: boolean;
  startedAccountCurrent: boolean;
}): boolean {
  if (opts.inFlight === true) return false;
  return opts.startedAccountCurrent === true;
}

// Scroll only after the add has finished, not while typing.
export function shouldScrollChecklistAfterAdd(opts: {
  typing: boolean;
  itemId: string | null | undefined;
}): boolean {
  if (opts.typing === true) return false;
  return typeof opts.itemId === 'string' && opts.itemId.trim().length > 0;
}

export function checklistAddResultFromAppend(opts: {
  previousItems: readonly ShoppingListItem[];
  nextItems: readonly ShoppingListItem[];
}): ChecklistAddResult | null {
  const previousIds = new Set(opts.previousItems.map((item) => item.id));
  for (let i = opts.nextItems.length - 1; i >= 0; i -= 1) {
    const row = opts.nextItems[i];
    if (row && !previousIds.has(row.id)) {
      return { id: row.id, kind: 'added', label: row.label };
    }
  }
  return null;
}

export function checklistAddResultFromProductBatch(opts: {
  productId: string;
  previousItems: readonly ShoppingListItem[];
  nextItems: readonly ShoppingListItem[];
  added: number;
  merged: number;
}): ChecklistAddResult | null {
  if (opts.added <= 0 && opts.merged <= 0) return null;
  const key = normaliseProductIdForMatch(opts.productId);
  if (!key) return null;
  if (opts.merged > 0) {
    const prev = opts.previousItems.find(
      (item) =>
        normaliseProductIdForMatch(item.productId) === key && item.checked !== true,
    );
    if (prev) return { id: prev.id, kind: 'updated', label: prev.label };
  }
  const previousIds = new Set(opts.previousItems.map((item) => item.id));
  const created = opts.nextItems.find(
    (item) =>
      !previousIds.has(item.id) && normaliseProductIdForMatch(item.productId) === key,
  );
  if (created) return { id: created.id, kind: 'added', label: created.label };
  return null;
}

export function indexOfChecklistItem(
  items: readonly ShoppingListItem[],
  itemId: string | null | undefined,
): number {
  const id = typeof itemId === 'string' ? itemId.trim() : '';
  if (!id) return -1;
  return items.findIndex((item) => item.id === id);
}
