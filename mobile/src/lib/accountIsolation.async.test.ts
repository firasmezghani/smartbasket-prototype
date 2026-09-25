// Tests that results from one account never show up for another account.
import test from 'node:test';
import assert from 'node:assert/strict';

import { captureAccountScope, isCurrentAccountScope, type AccountScope } from './accountScope';
import {
  cartToKeepAfterRefreshFailure,
  completeAccountScopedCartAdd,
  completeAccountScopedCartRefresh,
} from './accountScopedCart';
import { retryFailedListSyncOnly } from './cartAddOutcome';
import { recoverAmbiguousScannerAdd } from './scannerAddRecovery';
import { commitShoppingListForAccount } from './shoppingListPersistence';
import {
  createScannerSessionGuard,
  nextActionAfterAmbiguousAdd,
  shouldDisableAddSubmit,
  shouldReturnToChecklistAfterAdd,
  type CartLineQuantity,
} from './scannerSession';
import { canAddProductToSmartBasket } from './smartBasket';
import type { Cart } from '../types/cart';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function cartWith(items: CartLineQuantity[]): Cart {
  return {
    items: items.map((item, index) => ({
      id: index + 1,
      productId: item.productId,
      quantity: item.quantity,
    })),
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    grandTotal: 0,
  };
}

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    async setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

test('add times out and reconciliation fails: mutation stays disabled and known cart is kept', async () => {
  const known = cartWith([{ productId: 'milk', quantity: 2 }]);
  let applied: Cart | null = null;
  const refreshGate = deferred<never>();

  const refreshPromise = completeAccountScopedCartRefresh({
    started: captureAccountScope('A', 1),
    getCurrent: () => captureAccountScope('A', 1),
    fetch: () => refreshGate.promise,
    applyCart: (cart) => {
      applied = cart;
    },
    onFailure: () => {},
  });

  refreshGate.reject(new Error('Network request failed'));
  const refreshResult = await refreshPromise;

  assert.equal(refreshResult.ok, false);
  assert.equal(applied, null);
  assert.deepEqual(cartToKeepAfterRefreshFailure(known), known);

  const recovery = await recoverAmbiguousScannerAdd({
    productId: 'bread',
    preQuantity: 0,
    intendedDelta: 1,
    refresh: async () => ({ status: 'failed' }),
    isAccountCurrent: () => true,
    isOperationCurrent: () => true,
    markCollected: async () => {
      throw new Error('must not mark when unresolved');
    },
  });

  assert.equal(recovery.outcome, 'unresolved');
  assert.equal(recovery.allowRepeatAdd, false);
  assert.equal(
    shouldDisableAddSubmit({
      productId: 'bread',
      adding: false,
      alreadyAdded: true,
      unresolved: true,
    }),
    true,
  );
});

test('successful reconciliation uses quantity delta, not presence, and does not repeat the POST', async () => {
  assert.equal(canAddProductToSmartBasket(cartWith([{ productId: 'milk', quantity: 2 }]), 'milk').allowed, true);

  const presenceOnly = nextActionAfterAmbiguousAdd({
    productId: 'milk',
    preQuantity: 2,
    intendedDelta: 1,
    refresh: { status: 'ok', items: [{ productId: 'milk', quantity: 2 }] },
  });
  assert.equal(presenceOnly.kind, 'quantity_not_confirmed');
  assert.equal(presenceOnly.allowRepeatAdd, false);

  let marked = 0;
  let posts = 0;
  const refreshGate = deferred<{ status: 'ok'; items: CartLineQuantity[] }>();

  const recoveryPromise = recoverAmbiguousScannerAdd({
    productId: 'milk',
    preQuantity: 2,
    intendedDelta: 1,
    refresh: async () => {
      posts += 1;
      return refreshGate.promise;
    },
    isAccountCurrent: () => true,
    isOperationCurrent: () => true,
    markCollected: async () => {
      marked += 1;
    },
  });

  refreshGate.resolve({ status: 'ok', items: [{ productId: 'milk', quantity: 3 }] });
  const recovery = await recoveryPromise;

  assert.equal(recovery.outcome, 'observed');
  assert.equal(recovery.allowRepeatAdd, false);
  assert.equal(marked, 1);
  assert.equal(posts, 1);
  if (recovery.outcome === 'observed' && recovery.decision.kind === 'observed_expected_quantity') {
    assert.equal(recovery.decision.certainty, 'basket_state_only');
  }
});

test('account A add pending then switch to B: A cart, notice and checklist do not appear in B', async () => {
  let current = captureAccountScope('A', 1);
  const visibleCart: { value: Cart | null } = { value: null };
  const notices: { name: string }[] = [];
  const storage = memoryStorage();
  const addGate = deferred<Cart>();
  const listGate = deferred<void>();

  const aItems = [{ id: 'i1', label: 'Milk', quantity: 1, checked: false, productId: 'milk', createdAt: 't0' }];
  const snapshot = { key: 'smartBasketShoppingListV2:customer:1', generation: 1 };

  const addPromise = (async () => {
    const started = captureAccountScope('A', 1);
    const data = await addGate.promise;
    const result = await completeAccountScopedCartAdd({
      started,
      getCurrent: () => current,
      cart: data,
      applyCart: (cart) => {
        visibleCart.value = cart;
      },
      commitListMark: async () => {
        await commitShoppingListForAccount({
          storage: {
            setItem: async (key, value) => {
              await listGate.promise;
              await storage.setItem(key, value);
            },
          },
          snapshot,
          items: aItems.map((item) => ({ ...item, checked: true })),
          getCurrentKey: () =>
            current.accountId === 'A'
              ? 'smartBasketShoppingListV2:customer:1'
              : 'smartBasketShoppingListV2:customer:2',
          getCurrentGeneration: () => current.generation,
          applyVisible: () => {
            notices.push({ name: 'Milk' });
          },
        });
        return 1;
      },
      listFailMessage: 'save failed',
    });
    const guard = createScannerSessionGuard('cls-1-aaa');
    const op = guard.beginAdd(started);
    current = captureAccountScope('B', 2);
    guard.invalidateAccount();
    if (
      shouldReturnToChecklistAfterAdd({
        mode: 'checklist',
        closed: false,
        generationCurrent: guard.isAddSideEffectCurrent(op, current, false),
        basketAdded: result.basketAdded,
      })
    ) {
      notices.push({ name: 'navigated' });
    }
    return result;
  })();

  current = captureAccountScope('B', 2);
  addGate.resolve(cartWith([{ productId: 'milk', quantity: 1 }]));
  listGate.resolve();
  const result = await addPromise;

  assert.equal(result.basketAdded, true);
  assert.equal(visibleCart.value, null);
  assert.equal(notices.length, 0);
  assert.equal(storage.data.has('smartBasketShoppingListV2:customer:1'), true);
  assert.equal(storage.data.has('smartBasketShoppingListV2:customer:2'), false);
  const written = JSON.parse(storage.data.get('smartBasketShoppingListV2:customer:1') ?? '[]') as { checked: boolean }[];
  assert.equal(written[0]?.checked, true);
});

test('A→B→A before completion keeps the original generation invalid', async () => {
  const started = captureAccountScope('A', 1);
  const fetchGate = deferred<Cart>();
  let applied: Cart | null = null;
  let current: AccountScope = started;

  const refreshPromise = completeAccountScopedCartRefresh({
    started,
    getCurrent: () => current,
    fetch: () => fetchGate.promise,
    applyCart: (cart) => {
      applied = cart;
    },
    onFailure: () => {},
  });

  current = captureAccountScope('B', 2);
  current = captureAccountScope('A', 3);
  fetchGate.resolve(cartWith([{ productId: 'stale-a', quantity: 4 }]));
  const result = await refreshPromise;

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.stale, true);
  assert.equal(applied, null);
  assert.equal(isCurrentAccountScope(started, current), false);

  const guard = createScannerSessionGuard('cls-aba');
  const op = guard.beginAdd(started);
  guard.invalidateAccount();
  guard.invalidateAccount();
  assert.equal(guard.isAddSideEffectCurrent(op, current, false), false);
  assert.equal(guard.isAddGenerationCurrent(op), false);
});

test('switch accounts while local persistence is pending: write stays on the initiating key', async () => {
  const storage = memoryStorage();
  const persistGate = deferred<void>();
  let currentKey = 'smartBasketShoppingListV2:customer:1';
  let currentGeneration = 1;
  let visible: unknown[] | null = null;

  const aItems = [{ id: 'a1', label: 'A item', quantity: 1, checked: false, createdAt: 't0' }];
  const persistPromise = commitShoppingListForAccount({
    storage: {
      setItem: async (key, value) => {
        await persistGate.promise;
        await storage.setItem(key, value);
      },
    },
    snapshot: { key: 'smartBasketShoppingListV2:customer:1', generation: 1 },
    items: aItems,
    getCurrentKey: () => currentKey,
    getCurrentGeneration: () => currentGeneration,
    applyVisible: (items) => {
      visible = items;
    },
  });

  currentKey = 'smartBasketShoppingListV2:customer:2';
  currentGeneration = 2;
  persistGate.resolve();
  const outcome = await persistPromise;

  assert.equal(outcome.persisted, true);
  assert.equal(outcome.visibleApplied, false);
  assert.equal(outcome.keyWritten, 'smartBasketShoppingListV2:customer:1');
  assert.equal(visible, null);
  assert.equal(storage.data.has('smartBasketShoppingListV2:customer:1'), true);
  assert.equal(storage.data.has('smartBasketShoppingListV2:customer:2'), false);
});

test('blur/refocus during lookup or reconciliation does not update the new session', async () => {
  const guard = createScannerSessionGuard('cls-focus');
  const account = captureAccountScope('A', 1);
  const lookupOp = guard.beginLookup(account);
  const addOp = guard.beginAdd(account);

  const lookupGate = deferred<{ name: string }>();
  const refreshGate = deferred<{ status: 'ok'; items: CartLineQuantity[] }>();
  let lookupCommitted: string | null = null;
  let recovered = false;

  const lookupPromise = (async () => {
    const product = await lookupGate.promise;
    if (guard.isLookupCurrent(lookupOp, account, false)) lookupCommitted = product.name;
  })();

  const recoveryPromise = recoverAmbiguousScannerAdd({
    productId: 'milk',
    preQuantity: 0,
    intendedDelta: 1,
    refresh: () => refreshGate.promise,
    isAccountCurrent: () => true,
    isOperationCurrent: () => guard.isAddSideEffectCurrent(addOp, account, false),
    markCollected: async () => {
      recovered = true;
    },
  });

  guard.invalidateBlur();
  lookupGate.resolve({ name: 'stale lookup' });
  refreshGate.resolve({ status: 'ok', items: [{ productId: 'milk', quantity: 1 }] });

  await lookupPromise;
  const recovery = await recoveryPromise;

  assert.equal(lookupCommitted, null);
  assert.equal(recovery.outcome, 'stale');
  assert.equal(recovered, false);
  assert.equal(guard.isLookupCurrent(lookupOp, account, false), false);
  assert.equal(guard.isAddSideEffectCurrent(addOp, account, false), false);
  assert.equal(guard.isAddGenerationCurrent(addOp), true);
});

test('confirmed basket success plus list-storage failure retries list sync only', async () => {
  let basketPosts = 0;
  let listMarks = 0;
  const markGate = deferred<number>();

  const retryPromise = retryFailedListSyncOnly({
    basketAdded: true,
    listSynced: false,
    productId: 'milk',
    markProductCollected: async () => {
      listMarks += 1;
      return markGate.promise;
    },
    addToBasket: async () => {
      basketPosts += 1;
    },
  });

  markGate.resolve(1);
  const retry = await retryPromise;

  assert.equal(retry.didMark, true);
  assert.equal(retry.didAddToBasket, false);
  assert.equal(listMarks, 1);
  assert.equal(basketPosts, 0);

  const skipped = await retryFailedListSyncOnly({
    basketAdded: true,
    listSynced: true,
    productId: 'milk',
    markProductCollected: async () => {
      listMarks += 1;
      return 1;
    },
    addToBasket: async () => {
      basketPosts += 1;
    },
  });
  assert.equal(skipped.didMark, false);
  assert.equal(basketPosts, 0);
});

test('targeted manual-row list retry never repeats the basket POST', async () => {
  let basketPosts = 0;
  let extraMarks = 0;
  const retry = await retryFailedListSyncOnly({
    basketAdded: true,
    listSynced: false,
    markList: async () => {
      extraMarks += 1;
    },
    addToBasket: async () => {
      basketPosts += 1;
    },
  });
  assert.equal(retry.didMark, true);
  assert.equal(retry.didAddToBasket, false);
  assert.equal(extraMarks, 1);
  assert.equal(basketPosts, 0);

  const skipped = await retryFailedListSyncOnly({
    basketAdded: false,
    listSynced: false,
    markList: async () => {
      extraMarks += 1;
    },
    addToBasket: async () => {
      basketPosts += 1;
    },
  });
  assert.equal(skipped.didMark, false);
  assert.equal(extraMarks, 1);
  assert.equal(basketPosts, 0);
});

test('A→B→A cannot apply a targeted collected snapshot from generation 1 over generation 3', async () => {
  const storage = memoryStorage();
  let currentKey = 'smartBasketShoppingListV2:customer:A';
  let currentGeneration = 1;
  let visible: { id: string; checked: boolean }[] | null = null;
  const startedItems = [
    { id: 'manual', label: 'Eggs', quantity: 2, checked: true, createdAt: 't0' },
  ];

  currentKey = 'smartBasketShoppingListV2:customer:B';
  currentGeneration = 2;
  currentKey = 'smartBasketShoppingListV2:customer:A';
  currentGeneration = 3;

  const outcome = await commitShoppingListForAccount({
    storage,
    snapshot: { key: 'smartBasketShoppingListV2:customer:A', generation: 1 },
    items: startedItems,
    getCurrentKey: () => currentKey,
    getCurrentGeneration: () => currentGeneration,
    applyVisible: (items) => {
      visible = items;
    },
  });

  assert.equal(outcome.persisted, true);
  assert.equal(outcome.visibleApplied, false);
  assert.equal(visible, null);
  assert.equal(storage.data.has('smartBasketShoppingListV2:customer:A'), true);
});


test('late A refresh is ignored after B is current even if the fetch succeeds', async () => {
  let current = captureAccountScope('A', 1);
  let applied: Cart | null = null;
  const fetchGate = deferred<Cart>();

  const promise = completeAccountScopedCartRefresh({
    started: captureAccountScope('A', 1),
    getCurrent: () => current,
    fetch: () => fetchGate.promise,
    applyCart: (cart) => {
      applied = cart;
    },
    onFailure: () => {},
  });

  current = captureAccountScope('B', 2);
  fetchGate.resolve(cartWith([{ productId: 'only-a', quantity: 9 }]));
  const result = await promise;

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.stale, true);
  assert.equal(applied, null);
});
