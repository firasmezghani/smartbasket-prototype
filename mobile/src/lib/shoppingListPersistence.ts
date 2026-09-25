// Saves the list for the account that started the change, and only if they are still signed in.

export type ListStorage = {
  setItem: (key: string, value: string) => Promise<void>;
};

export type ListPersistSnapshot = {
  key: string;
  generation: number;
};

export function shouldApplyListToView(opts: {
  startedKey: string;
  currentKey: string | null;
  startedGeneration: number;
  currentGeneration: number;
}): boolean {
  return (
    opts.currentKey === opts.startedKey &&
    opts.startedGeneration === opts.currentGeneration
  );
}

export async function persistShoppingListSnapshot<TItem>(opts: {
  storage: ListStorage;
  key: string;
  items: TItem[];
}): Promise<void> {
  const serialised = JSON.stringify(opts.items);
  await opts.storage.setItem(opts.key, serialised);
}

export async function commitShoppingListForAccount<TItem>(opts: {
  storage: ListStorage;
  snapshot: ListPersistSnapshot;
  items: TItem[];
  getCurrentKey: () => string | null;
  getCurrentGeneration: () => number;
  applyVisible: (items: TItem[]) => void;
}): Promise<{ persisted: true; visibleApplied: boolean; keyWritten: string }> {
  await persistShoppingListSnapshot({
    storage: opts.storage,
    key: opts.snapshot.key,
    items: opts.items,
  });
  const visibleApplied = shouldApplyListToView({
    startedKey: opts.snapshot.key,
    currentKey: opts.getCurrentKey(),
    startedGeneration: opts.snapshot.generation,
    currentGeneration: opts.getCurrentGeneration(),
  });
  if (visibleApplied) opts.applyVisible(opts.items);
  return { persisted: true, visibleApplied, keyWritten: opts.snapshot.key };
}
