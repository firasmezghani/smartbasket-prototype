// Edit the text of a personal note on the checklist, keeping everything else about the row.

import type { ShoppingListItem } from '../types/shoppingList';
import { isCurrentAccountScope, type AccountScope } from './accountScope';
import { cleanShoppingListLabel, isManualPersonalNote } from './shoppingListBatch';

export type PersonalNoteEditFailure =
  | 'stale_account'
  | 'entry_missing'
  | 'entry_linked'
  | 'empty_label';

export type PersonalNoteEditEvaluation =
  | { ok: true; kind: 'unchanged'; nextItems: ShoppingListItem[] }
  | { ok: true; kind: 'update'; nextItems: ShoppingListItem[] }
  | { ok: false; reason: PersonalNoteEditFailure };

export function evaluatePersonalNoteEdit(opts: {
  started: AccountScope;
  current: AccountScope;
  items: readonly ShoppingListItem[] | null | undefined;
  entryId: unknown;
  nextLabel: unknown;
}): PersonalNoteEditEvaluation {
  if (!isCurrentAccountScope(opts.started, opts.current)) {
    return { ok: false, reason: 'stale_account' };
  }
  const id = typeof opts.entryId === 'string' ? opts.entryId.trim() : '';
  if (!id) return { ok: false, reason: 'entry_missing' };
  const list = Array.isArray(opts.items) ? opts.items : [];
  const item = list.find((row) => row.id === id);
  if (!item) return { ok: false, reason: 'entry_missing' };
  if (!isManualPersonalNote(item)) return { ok: false, reason: 'entry_linked' };
  const label = cleanShoppingListLabel(opts.nextLabel);
  if (!label) return { ok: false, reason: 'empty_label' };
  const nextItems = list.map((row) => (row.id === id ? { ...row, label } : row));
  if (label === item.label) {
    return { ok: true, kind: 'unchanged', nextItems };
  }
  return { ok: true, kind: 'update', nextItems };
}

export async function persistPersonalNoteEdit(opts: {
  evaluation: PersonalNoteEditEvaluation;
  commit: (nextItems: ShoppingListItem[]) => Promise<void>;
}): Promise<{ wrote: boolean; reason?: PersonalNoteEditFailure | 'unchanged' }> {
  if (!opts.evaluation.ok) {
    return { wrote: false, reason: opts.evaluation.reason };
  }
  if (opts.evaluation.kind === 'unchanged') {
    return { wrote: false, reason: 'unchanged' };
  }
  await opts.commit(opts.evaluation.nextItems);
  return { wrote: true };
}

export function shouldDismissNoteEditorAfterFailure(
  reason: PersonalNoteEditFailure | 'unchanged' | undefined,
): boolean {
  return reason === 'stale_account' || reason === 'entry_missing' || reason === 'entry_linked';
}
