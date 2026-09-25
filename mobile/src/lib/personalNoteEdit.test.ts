import test from 'node:test';
import assert from 'node:assert/strict';

import type { ShoppingListItem } from '../types/shoppingList';
import { captureAccountScope } from './accountScope';
import {
  cleanShoppingListLabel,
  isManualPersonalNote,
  isUncheckedManualItem,
} from './shoppingListBatch';
import {
  evaluatePersonalNoteEdit,
  persistPersonalNoteEdit,
  shouldDismissNoteEditorAfterFailure,
} from './personalNoteEdit';

function note(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id: 'note-1',
    label: 'Buy flowers',
    quantity: 2,
    checked: false,
    createdAt: '2026-09-21T10:00:00.000Z',
    ...overrides,
  };
}

function exact(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return note({
    id: 'exact-1',
    label: 'Delisso milk',
    productId: 'sku-milk',
    quantity: 1,
    ...overrides,
  });
}

function generic(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return note({
    id: 'generic-1',
    label: 'Milk',
    genericType: 'milk',
    quantity: 1,
    ...overrides,
  });
}

const started = captureAccountScope('68', 1);
const current = captureAccountScope('68', 1);

test('isManualPersonalNote includes completed notes and excludes exact/generic rows', () => {
  assert.equal(isManualPersonalNote(note()), true);
  assert.equal(isManualPersonalNote(note({ checked: true, checkedAt: 't' })), true);
  assert.equal(isUncheckedManualItem(note({ checked: true })), false);
  assert.equal(isManualPersonalNote(exact()), false);
  assert.equal(isManualPersonalNote(generic()), false);
  assert.equal(isManualPersonalNote(null), false);
});

test('cleanShoppingListLabel trims, collapses whitespace, and reuses the 120-character cap', () => {
  assert.equal(cleanShoppingListLabel('  extra   milk  '), 'extra milk');
  assert.equal(cleanShoppingListLabel('   '), '');
  assert.equal(cleanShoppingListLabel(1), '');
  const long = 'a'.repeat(140);
  assert.equal(cleanShoppingListLabel(long).length, 120);
});

test('save replaces only the targeted personal-note label and preserves id, quantity, completion, and order', () => {
  const currentItems = [
    exact({ id: 'a' }),
    note({ id: 'note-1', label: 'Buy flowers', quantity: 3, checked: true, checkedAt: 'done' }),
    generic({ id: 'c' }),
    note({ id: 'note-2', label: 'Other' }),
  ];
  const evaluation = evaluatePersonalNoteEdit({
    started,
    current,
    items: currentItems,
    entryId: 'note-1',
    nextLabel: '  Birthday   flowers  ',
  });
  assert.equal(evaluation.ok, true);
  if (!evaluation.ok) return;
  assert.equal(evaluation.kind, 'update');
  assert.equal(evaluation.nextItems.length, 4);
  assert.deepEqual(
    evaluation.nextItems.map((row) => row.id),
    ['a', 'note-1', 'c', 'note-2'],
  );
  const edited = evaluation.nextItems[1]!;
  assert.equal(edited.id, 'note-1');
  assert.equal(edited.label, 'Birthday flowers');
  assert.equal(edited.quantity, 3);
  assert.equal(edited.checked, true);
  assert.equal(edited.checkedAt, 'done');
  assert.equal(edited.createdAt, currentItems[1]!.createdAt);
  assert.equal(edited.productId, undefined);
  assert.equal(edited.genericType, undefined);
  assert.equal(evaluation.nextItems[0]!.label, currentItems[0]!.label);
  assert.equal(evaluation.nextItems[3]!.label, 'Other');
});

test('unchanged cleaned text does not write', async () => {
  const items = [note({ label: 'Buy flowers' })];
  const evaluation = evaluatePersonalNoteEdit({
    started,
    current,
    items,
    entryId: 'note-1',
    nextLabel: '  Buy   flowers  ',
  });
  assert.equal(evaluation.ok, true);
  if (!evaluation.ok) return;
  assert.equal(evaluation.kind, 'unchanged');
  let writes = 0;
  const persisted = await persistPersonalNoteEdit({
    evaluation,
    commit: async () => {
      writes += 1;
    },
  });
  assert.equal(persisted.wrote, false);
  assert.equal(persisted.reason, 'unchanged');
  assert.equal(writes, 0);
});

test('blank or whitespace-only text is rejected and does not write', async () => {
  const items = [note()];
  for (const nextLabel of ['', '   ', '\n\t']) {
    const evaluation = evaluatePersonalNoteEdit({
      started,
      current,
      items,
      entryId: 'note-1',
      nextLabel,
    });
    assert.equal(evaluation.ok, false);
    if (evaluation.ok) return;
    assert.equal(evaluation.reason, 'empty_label');
    let writes = 0;
    const persisted = await persistPersonalNoteEdit({
      evaluation,
      commit: async () => {
        writes += 1;
      },
    });
    assert.equal(persisted.wrote, false);
    assert.equal(writes, 0);
  }
});

test('cancel is represented by never calling persist', () => {
  const items = [note({ label: 'Buy flowers' })];
  const evaluation = evaluatePersonalNoteEdit({
    started,
    current,
    items,
    entryId: 'note-1',
    nextLabel: 'Changed in the editor',
  });
  assert.equal(evaluation.ok, true);
  if (!evaluation.ok) return;
  assert.equal(evaluation.kind, 'update');
  assert.equal(items[0]!.label, 'Buy flowers');
});

test('persistence failure does not report success and retry can write', async () => {
  const items = [note()];
  const evaluation = evaluatePersonalNoteEdit({
    started,
    current,
    items,
    entryId: 'note-1',
    nextLabel: 'Fresh flowers',
  });
  assert.equal(evaluation.ok, true);
  if (!evaluation.ok) return;
  let attempts = 0;
  await assert.rejects(
    persistPersonalNoteEdit({
      evaluation,
      commit: async () => {
        attempts += 1;
        throw new Error('Could not save your shopping list. Please try again.');
      },
    }),
    /Could not save/,
  );
  assert.equal(attempts, 1);
  const retried = await persistPersonalNoteEdit({
    evaluation,
    commit: async (nextItems) => {
      attempts += 1;
      assert.equal(nextItems[0]!.label, 'Fresh flowers');
    },
  });
  assert.equal(retried.wrote, true);
  assert.equal(attempts, 2);
});

test('a removed entry is not recreated', async () => {
  const remaining = [note({ id: 'note-2', label: 'Keep' })];
  const evaluation = evaluatePersonalNoteEdit({
    started,
    current,
    items: remaining,
    entryId: 'note-1',
    nextLabel: 'Ghost note',
  });
  assert.equal(evaluation.ok, false);
  if (evaluation.ok) return;
  assert.equal(evaluation.reason, 'entry_missing');
  let writes = 0;
  const persisted = await persistPersonalNoteEdit({
    evaluation,
    commit: async () => {
      writes += 1;
    },
  });
  assert.equal(persisted.wrote, false);
  assert.equal(writes, 0);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]!.id, 'note-2');
});

test('latest list state is used so concurrent changes are not overwritten', () => {
  const latest = [
    note({ id: 'note-1', label: 'Buy flowers', quantity: 2 }),
    note({ id: 'added-later', label: 'Bread', quantity: 4 }),
    exact({ id: 'toggled', quantity: 9, checked: true, checkedAt: 'now' }),
  ];
  const evaluation = evaluatePersonalNoteEdit({
    started,
    current,
    items: latest,
    entryId: 'note-1',
    nextLabel: 'Market flowers',
  });
  assert.equal(evaluation.ok, true);
  if (!evaluation.ok) return;
  assert.equal(evaluation.nextItems.length, 3);
  assert.equal(evaluation.nextItems[0]!.label, 'Market flowers');
  assert.equal(evaluation.nextItems[0]!.quantity, 2);
  assert.equal(evaluation.nextItems[1]!.id, 'added-later');
  assert.equal(evaluation.nextItems[1]!.quantity, 4);
  assert.equal(evaluation.nextItems[2]!.checked, true);
  assert.equal(evaluation.nextItems[2]!.quantity, 9);
});

test('similarly named notes are not merged; only the targeted id changes', () => {
  const items = [
    note({ id: 'note-1', label: 'Milk' }),
    note({ id: 'note-2', label: 'Milk' }),
  ];
  const evaluation = evaluatePersonalNoteEdit({
    started,
    current,
    items,
    entryId: 'note-2',
    nextLabel: 'Oat milk',
  });
  assert.equal(evaluation.ok, true);
  if (!evaluation.ok) return;
  assert.equal(evaluation.nextItems[0]!.id, 'note-1');
  assert.equal(evaluation.nextItems[0]!.label, 'Milk');
  assert.equal(evaluation.nextItems[1]!.id, 'note-2');
  assert.equal(evaluation.nextItems[1]!.label, 'Oat milk');
  assert.equal(evaluation.nextItems.length, 2);
});

test('account-generation change including A→B→A is stale and does not write', async () => {
  const items = [note()];
  const aba = evaluatePersonalNoteEdit({
    started: captureAccountScope('68', 1),
    current: captureAccountScope('68', 3),
    items,
    entryId: 'note-1',
    nextLabel: 'Should not land',
  });
  assert.equal(aba.ok, false);
  if (aba.ok) return;
  assert.equal(aba.reason, 'stale_account');
  const otherAccount = evaluatePersonalNoteEdit({
    started: captureAccountScope('68', 1),
    current: captureAccountScope('99', 2),
    items,
    entryId: 'note-1',
    nextLabel: 'Should not land',
  });
  assert.equal(otherAccount.ok, false);
  if (otherAccount.ok) return;
  assert.equal(otherAccount.reason, 'stale_account');
  let writes = 0;
  await persistPersonalNoteEdit({
    evaluation: aba,
    commit: async () => {
      writes += 1;
    },
  });
  assert.equal(writes, 0);
  assert.equal(shouldDismissNoteEditorAfterFailure('stale_account'), true);
});

test('exact-product and generic-type entries cannot be text-edited', async () => {
  const items = [exact(), generic(), note({ id: 'note-keep' })];
  for (const entryId of ['exact-1', 'generic-1']) {
    const evaluation = evaluatePersonalNoteEdit({
      started,
      current,
      items,
      entryId,
      nextLabel: 'Edited',
    });
    assert.equal(evaluation.ok, false);
    if (evaluation.ok) return;
    assert.equal(evaluation.reason, 'entry_linked');
    let writes = 0;
    await persistPersonalNoteEdit({
      evaluation,
      commit: async () => {
        writes += 1;
      },
    });
    assert.equal(writes, 0);
  }
  assert.equal(items[0]!.label, 'Delisso milk');
  assert.equal(items[1]!.label, 'Milk');
});

test('successful persist writes the evaluated snapshot once', async () => {
  const items = [note({ label: 'Old' }), note({ id: 'note-2', label: 'Keep' })];
  const evaluation = evaluatePersonalNoteEdit({
    started,
    current,
    items,
    entryId: 'note-1',
    nextLabel: 'New',
  });
  const box: { items: ShoppingListItem[] | null } = { items: null };
  const persisted = await persistPersonalNoteEdit({
    evaluation,
    commit: async (nextItems) => {
      box.items = nextItems;
    },
  });
  assert.equal(persisted.wrote, true);
  assert.equal(box.items?.[0]?.label, 'New');
  assert.equal(box.items?.[1]?.label, 'Keep');
});
