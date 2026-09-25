// Make sure a late cart response is only shown for the account that sent the request.

import type { AccountScope } from './accountScope';
import { isCurrentAccountScope } from './accountScope';
import type { AddItemResult } from './cartAddOutcome';

export type CartRefreshResult<TCart> =
  | { ok: true; cart: TCart }
  | { ok: false; stale?: boolean };

// Keep the last basket when a refresh fails.
export function cartToKeepAfterRefreshFailure<TCart>(previous: TCart): TCart {
  return previous;
}

export async function completeAccountScopedCartRefresh<TCart>(opts: {
  started: AccountScope;
  getCurrent: () => AccountScope;
  fetch: () => Promise<TCart>;
  applyCart: (cart: TCart) => void;
  onFailure: (error: unknown) => void;
}): Promise<CartRefreshResult<TCart>> {
  try {
    const cart = await opts.fetch();
    if (!isCurrentAccountScope(opts.started, opts.getCurrent())) {
      return { ok: false, stale: true };
    }
    opts.applyCart(cart);
    return { ok: true, cart };
  } catch (error) {
    if (!isCurrentAccountScope(opts.started, opts.getCurrent())) {
      return { ok: false, stale: true };
    }
    opts.onFailure(error);
    return { ok: false };
  }
}

// Show the result of an add only if the same account is still signed in.
export async function completeAccountScopedCartAdd<TCart>(opts: {
  started: AccountScope;
  getCurrent: () => AccountScope;
  cart: TCart;
  applyCart: (cart: TCart) => void;
  commitListMark: () => Promise<number>;
  listFailMessage: string;
}): Promise<AddItemResult> {
  if (isCurrentAccountScope(opts.started, opts.getCurrent())) {
    opts.applyCart(opts.cart);
  }
  try {
    const marked = await opts.commitListMark();
    return { basketAdded: true, listSync: { status: 'ok', marked } };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim() ? error.message : opts.listFailMessage;
    return { basketAdded: true, listSync: { status: 'failed', message } };
  }
}
