// Result of adding to the basket. If saving the checklist fails, do not send the add again.

import type { LinkedCollectKind } from './shoppingListBatch';

export type ListCollectMeta = {
  collectKind: LinkedCollectKind;
  remainingUnchecked: number;
  eligibleManualCount: number;
  extraMarked: boolean;
  extraDecremented: boolean;
};

export type ListSyncStatus =
  | ({ status: 'ok'; marked: number } & Partial<ListCollectMeta>)
  | ({ status: 'failed'; message: string } & Partial<ListCollectMeta>);

export function listCollectMeta(sync: ListSyncStatus | null | undefined): ListCollectMeta {
  return {
    collectKind: sync?.collectKind ?? 'none',
    remainingUnchecked: typeof sync?.remainingUnchecked === 'number' ? sync.remainingUnchecked : 0,
    eligibleManualCount: typeof sync?.eligibleManualCount === 'number' ? sync.eligibleManualCount : 0,
    extraMarked: sync?.extraMarked === true,
    extraDecremented: sync?.extraDecremented === true,
  };
}

export type AddItemResult = {
  basketAdded: true;
  listSync: ListSyncStatus;
};

export function listSyncFailed(result: AddItemResult): boolean {
  return result.listSync.status === 'failed';
}

// After a confirmed basket add, retrying the basket mutation is never correct.
export function shouldRetryBasketAdd(result: AddItemResult | null): boolean {
  return result == null || result.basketAdded !== true;
}

export function shouldRetryListSyncOnly(result: AddItemResult | null): boolean {
  return result != null && result.basketAdded === true && result.listSync.status === 'failed';
}

// Retry only the checklist update, never the basket add.
export async function retryFailedListSyncOnly(opts: {
  basketAdded: boolean;
  listSynced: boolean;
  productId?: string;
  markProductCollected?: (productId: string) => Promise<number>;
  markList?: () => Promise<unknown>;
  addToBasket?: (productId: string, quantity?: number) => Promise<unknown>;
}): Promise<{ didMark: boolean; didAddToBasket: boolean }> {
  const result: AddItemResult | null = opts.basketAdded
    ? {
        basketAdded: true,
        listSync: opts.listSynced
          ? { status: 'ok', marked: 0 }
          : { status: 'failed', message: 'list-sync-failed' },
      }
    : null;
  if (!shouldRetryListSyncOnly(result)) {
    return { didMark: false, didAddToBasket: false };
  }
  if (opts.markList) {
    await opts.markList();
  } else if (opts.markProductCollected && opts.productId) {
    await opts.markProductCollected(opts.productId);
  }
  return { didMark: true, didAddToBasket: false };
}
