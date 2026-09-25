import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as cartApi from '../api/cart';
import { friendlyErrorMessage } from '../lib/errors';
import { isStaleBasket } from '../lib/basketFreshness';
import {
  canAddProductToSmartBasket,
  isSmartBasketLimitError,
  SmartBasketLimitError,
} from '../lib/smartBasket';
import {
  basketTotalQuantity,
  BasketCapacityError,
  extractAuthoritativeMaxFromError,
  isBasketCapacityError,
  wouldExceedBasketCapacity,
} from '../lib/appConfig';
import {
  completeAccountScopedCartAdd,
  completeAccountScopedCartRefresh,
  type CartRefreshResult,
} from '../lib/accountScopedCart';
import { captureAccountScope, isCurrentAccountScope, type AccountScope } from '../lib/accountScope';
import type { AddItemResult } from '../lib/cartAddOutcome';
import type { Cart } from '../types/cart';
import { useI18n } from '../i18n/I18nContext';
import { useAppConfig } from './AppConfigContext';
import { useAuth } from './AuthContext';
import { useShoppingList, type CollectedMarkPlan } from './ShoppingListContext';

const EMPTY_CART: Cart = { items: [], totalQuantity: 0, grandTotal: 0 };

type CartContextValue = {
  cart: Cart;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<CartRefreshResult<Cart>>;
  addItem: (
    productId: string,
    quantity?: number,
    options?: { collectedPlan?: CollectedMarkPlan | null },
  ) => Promise<AddItemResult>;
  updateQuantity: (itemId: number, quantity: number) => Promise<void>;
  removeItem: (itemId: number) => Promise<void>;
  // Empty the current basket (existing DELETE /api/cart).
  clearCart: () => Promise<void>;
  // True when the basket is idle and the customer has not answered the prompt yet.
  staleBasketPending: boolean;
  // Mark the Resume / Start-new prompt as answered for this session.
  resolveStaleBasketPrompt: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { customer, loading: authLoading, accountGeneration } = useAuth();
  const { maxBasketQuantity, applyAuthoritativeMaxBasketQuantity } = useAppConfig();
  const { prepareProductCollected, commitPreparedCollected } = useShoppingList();
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // One decision per app session per account. Reset when the signed-in
  // customer changes (see the reload effect below).
  const [staleBasketResolved, setStaleBasketResolved] = useState(false);

  const accountId = customer?.id != null ? String(customer.id) : null;
  const scopeRef = useRef<AccountScope>(captureAccountScope(accountId, accountGeneration));
  scopeRef.current = captureAccountScope(accountId, accountGeneration);
  const captureScope = useCallback(() => ({ ...scopeRef.current }), []);

  // Error for a basket-limit rejection, using the limit the server just returned
  // (or a message without a number if it is unavailable).
  const buildServerCapacityError = useCallback(
    (e: unknown): BasketCapacityError => {
      const authoritativeMax = extractAuthoritativeMaxFromError(e);
      if (authoritativeMax != null) {
        void applyAuthoritativeMaxBasketQuantity(authoritativeMax);
        return new BasketCapacityError(t('errors.basketCapacity', { max: authoritativeMax }), authoritativeMax);
      }
      return new BasketCapacityError(t('errors.basketCapacityGeneric'));
    },
    [applyAuthoritativeMaxBasketQuantity, t],
  );

  const refresh = useCallback(async () => {
    const started = captureScope();
    setError(null);
    return completeAccountScopedCartRefresh({
      started,
      getCurrent: () => scopeRef.current,
      fetch: () => cartApi.fetchCart(),
      applyCart: setCart,
      onFailure: (e) => {
        setError(friendlyErrorMessage(e));
      },
    });
  }, [captureScope]);

  useEffect(() => {
    if (authLoading) return;
    // A new account (or sign-out) gets a fresh Resume / Start-new decision
    // and must not keep showing the previous account's basket.
    setStaleBasketResolved(false);
    setCart(EMPTY_CART);
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [authLoading, customer?.id, accountGeneration, refresh]);

  const addItem = useCallback(
    async (
      productId: string,
      quantity = 1,
      options?: { collectedPlan?: CollectedMarkPlan | null },
    ): Promise<AddItemResult> => {
      const started = captureScope();
      const plan =
        options && Object.prototype.hasOwnProperty.call(options, 'collectedPlan')
          ? options.collectedPlan
          : prepareProductCollected(productId);
      setError(null);
      const check = canAddProductToSmartBasket(cart, productId);
      if (!check.allowed) {
        if (check.reason === 'invalid') {
          throw new SmartBasketLimitError(t('errors.invalidProduct'));
        }
        throw new SmartBasketLimitError(t('errors.smartBasketLimit'));
      }
      // Quick local check; the server checks again.
      if (wouldExceedBasketCapacity(basketTotalQuantity(cart), quantity, maxBasketQuantity)) {
        throw new BasketCapacityError(t('errors.basketCapacity', { max: maxBasketQuantity }));
      }
      let data: Cart;
      try {
        data = await cartApi.addCartItem(productId, quantity);
      } catch (e) {
        if (isBasketCapacityError(e)) {
          throw buildServerCapacityError(e);
        }
        if (isSmartBasketLimitError(e)) throw e;
        const msg = friendlyErrorMessage(e);
        if (isSmartBasketLimitError({ message: msg })) {
          throw new SmartBasketLimitError(t('errors.smartBasketLimit'));
        }
        throw e;
      }
      return completeAccountScopedCartAdd({
        started,
        getCurrent: () => scopeRef.current,
        cart: data,
        applyCart: setCart,
        commitListMark: async () => {
          if (!plan) return 0;
          return commitPreparedCollected(plan);
        },
        listFailMessage: t('list.saveFailed'),
      }).then((result) => {
        const meta = plan
          ? {
              collectKind: plan.collectKind,
              remainingUnchecked: plan.remainingUnchecked,
              eligibleManualCount: plan.eligibleManualCount,
              extraMarked: plan.extraMarked,
              extraDecremented: plan.extraDecremented,
            }
          : {
              collectKind: 'none' as const,
              remainingUnchecked: 0,
              eligibleManualCount: 0,
              extraMarked: false,
              extraDecremented: false,
            };
        return {
          basketAdded: true as const,
          listSync: { ...result.listSync, ...meta },
        };
      });
    },
    [
      buildServerCapacityError,
      captureScope,
      cart,
      commitPreparedCollected,
      maxBasketQuantity,
      prepareProductCollected,
      t,
    ],
  );

  const updateQuantity = useCallback(
    async (itemId: number, quantity: number) => {
      const started = captureScope();
      setError(null);
      const line = cart.items.find((item) => item.id === itemId);
      const delta = line ? quantity - line.quantity : quantity;
      if (delta > 0 && wouldExceedBasketCapacity(basketTotalQuantity(cart), delta, maxBasketQuantity)) {
        throw new BasketCapacityError(t('errors.basketCapacity', { max: maxBasketQuantity }));
      }
      try {
        const data = await cartApi.updateCartItem(itemId, quantity);
        if (isCurrentAccountScope(started, scopeRef.current)) setCart(data);
      } catch (e) {
        if (isBasketCapacityError(e)) {
          throw buildServerCapacityError(e);
        }
        throw e;
      }
    },
    [buildServerCapacityError, captureScope, cart, maxBasketQuantity, t],
  );

  const removeItem = useCallback(async (itemId: number) => {
    const started = captureScope();
    setError(null);
    const data = await cartApi.removeCartItem(itemId);
    if (isCurrentAccountScope(started, scopeRef.current)) setCart(data);
  }, [captureScope]);

  const clearCart = useCallback(async () => {
    const started = captureScope();
    setError(null);
    const data = await cartApi.clearCart();
    if (isCurrentAccountScope(started, scopeRef.current)) setCart(data);
  }, [captureScope]);

  const resolveStaleBasketPrompt = useCallback(() => setStaleBasketResolved(true), []);

  // Use the server's `stale` flag, or `lastActivityAt` if it is missing.
  // Never prompt on an empty basket.
  const staleBasketPending =
    !staleBasketResolved &&
    cart.items.length > 0 &&
    isStaleBasket({ stale: cart.stale, lastActivityAt: cart.lastActivityAt ?? null });

  const value = useMemo(
    () => ({
      cart,
      loading,
      error,
      refresh,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      staleBasketPending,
      resolveStaleBasketPrompt,
    }),
    [
      cart,
      loading,
      error,
      refresh,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      staleBasketPending,
      resolveStaleBasketPrompt,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
