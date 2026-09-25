// Helpers for the Home screen previews (list, basket and recipe).

import type { ShoppingListItem } from '../types/shoppingList';
import { isCurrentAccountScope, type AccountScope } from './accountScope';
import { previewUncheckedItems } from './manualListMatch';
import { countUniqueProductIds } from './smartBasket';
import { normaliseProductIdForMatch } from './shoppingListBatch';

export const HOME_RECIPE_FOCUS_MIN_INTERVAL_MS = 2000;
export const HOME_RECIPE_DEBOUNCE_MS = 400;
// Remaining entries shown on Home; the full list stays on the shopping-list screen.
export const HOME_LIST_PREVIEW_LIMIT = 2;

export type HomeListKind =
  | 'loading'
  | 'signedOut'
  | 'empty'
  | 'incomplete'
  | 'completeWithBasket'
  | 'completeEmptyBasket';

export type HomeListCardState = {
  kind: HomeListKind;
  total: number;
  completed: number;
  remaining: number;
  preview: ShoppingListItem[];
  moreUnchecked: number;
};

export function homeListCardState(opts: {
  ready: boolean;
  signedIn: boolean;
  items: readonly ShoppingListItem[] | null | undefined;
  basketUnits: number;
  basketKnown: boolean;
}): HomeListCardState {
  const items = Array.isArray(opts.items) ? opts.items : [];
  const total = items.length;
  const completed = items.filter((item) => item.checked === true).length;
  const remaining = total - completed;
  const preview = previewUncheckedItems(items, HOME_LIST_PREVIEW_LIMIT);
  const moreUnchecked = Math.max(0, remaining - preview.length);
  const base = { total, completed, remaining, preview, moreUnchecked };

  if (!opts.ready) return { kind: 'loading', ...base };
  if (!opts.signedIn) return { kind: 'signedOut', ...base };
  if (total === 0) return { kind: 'empty', ...base };
  if (remaining > 0) return { kind: 'incomplete', ...base };
  if (opts.basketKnown && opts.basketUnits > 0) {
    return { kind: 'completeWithBasket', ...base };
  }
  return { kind: 'completeEmptyBasket', ...base };
}

export type HomeBasketKind = 'hidden' | 'loading' | 'unavailable' | 'empty' | 'ready';

export type HomeBasketSummary = {
  kind: HomeBasketKind;
  uniqueProducts: number;
  units: number;
  amount: number | null;
};

type CartLike = {
  items?: readonly { productId?: string | null; quantity?: number }[];
  totalQuantity?: number;
  grandTotal?: number;
} | null | undefined;

export function homeBasketSummaryState(opts: {
  signedIn: boolean;
  loading: boolean;
  error?: string | null;
  cart: CartLike;
}): HomeBasketSummary {
  if (!opts.signedIn) {
    return { kind: 'hidden', uniqueProducts: 0, units: 0, amount: null };
  }
  const cart = opts.cart;
  const items = Array.isArray(cart?.items) ? cart!.items : null;
  const units = Number(cart?.totalQuantity);
  const unique = cart && items ? countUniqueProductIds({ items: cart.items as never, totalQuantity: 0, grandTotal: 0 }) : 0;
  const hasLines = Boolean(items && items.length > 0);
  if (opts.loading && !hasLines && !opts.error) {
    return { kind: 'loading', uniqueProducts: 0, units: 0, amount: null };
  }
  if (opts.error && !hasLines) {
    return { kind: 'unavailable', uniqueProducts: 0, units: 0, amount: null };
  }
  if (!items) {
    return { kind: 'unavailable', uniqueProducts: 0, units: 0, amount: null };
  }
  const unitCount = Number.isFinite(units) && units > 0 ? units : items.reduce((sum, row) => {
    const q = Number(row.quantity);
    return sum + (Number.isFinite(q) && q > 0 ? q : 0);
  }, 0);
  const total = Number(cart?.grandTotal);
  const amount = Number.isFinite(total) && total > 0 ? total : null;
  if (unitCount <= 0) {
    return { kind: 'empty', uniqueProducts: 0, units: 0, amount: null };
  }
  return { kind: 'ready', uniqueProducts: unique, units: unitCount, amount };
}

// Basket signature (product id and quantity), for detecting changes.
export function basketEvidenceKey(cart: CartLike): string {
  const items = cart?.items;
  if (!Array.isArray(items) || items.length === 0) return '';
  const parts = items
    .map((item) => {
      const id = normaliseProductIdForMatch(item?.productId);
      if (!id) return null;
      const qty = Number(item?.quantity);
      const n = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 0;
      if (n <= 0) return null;
      return `${id}:${n}`;
    })
    .filter((row): row is string => Boolean(row))
    .sort();
  return parts.join('|');
}

export function shouldSkipFocusRefresh(opts: {
  lastFetchedAt: number;
  lastEvidenceKey: string;
  currentEvidenceKey: string;
  now: number;
  minIntervalMs: number;
  lastGeneration: number;
  currentGeneration: number;
}): boolean {
  if (opts.lastGeneration !== opts.currentGeneration) return true;
  if (opts.currentEvidenceKey !== opts.lastEvidenceKey) return true;
  const min = Number.isFinite(opts.minIntervalMs) && opts.minIntervalMs > 0 ? opts.minIntervalMs : 0;
  return opts.now - opts.lastFetchedAt < min;
}

// Hide the previous recipe while a new one loads for the changed basket.
export function shouldHideBasketRecipeWhileRefreshing(opts: {
  refreshing: boolean;
  evidenceStale: boolean;
  evidenceSource?: string | null;
}): boolean {
  if (opts.evidenceStale === true) return true;
  return opts.refreshing === true && opts.evidenceSource === 'basket';
}

// First given name for “Hello, [name]”. Neutral greeting when this is null.
export function homeGreetingFirstName(fullName: unknown): string | null {
  if (typeof fullName !== 'string') return null;
  const first = fullName
    .trim()
    .split(/\s+/)
    .find((part) => part.length > 0);
  return first ?? null;
}

// Four fixed staple products shown on Home.
export const HOME_EXPLORE_PRODUCT_IDS = Object.freeze([
  '786EE07C-DE60-49EF-B2C7-E37FFCDA27E9',
  '4636E246-AD49-479B-B434-632A80BF3558',
  'B5D54CAF-5FA9-4AF1-A99A-CB6579110CD5',
  '049B4B34-9B24-47DB-A176-3F17043FF1DD',
]);

export const HOME_EXPLORE_LIMIT = 4;
// One catalogue list request covering the visible curated set (91).
export const HOME_EXPLORE_FETCH_LIMIT = 100;

export function selectHomeExploreProducts<T extends { id?: string | null }>(
  products: readonly T[] | null | undefined,
): T[] {
  if (!Array.isArray(products) || products.length === 0) return [];
  const byId = new Map<string, T>();
  for (const product of products) {
    const id = normaliseProductIdForMatch(product?.id);
    if (id && !byId.has(id)) byId.set(id, product);
  }
  const selected: T[] = [];
  for (const wanted of HOME_EXPLORE_PRODUCT_IDS) {
    const found = byId.get(normaliseProductIdForMatch(wanted));
    if (found) selected.push(found);
    if (selected.length >= HOME_EXPLORE_LIMIT) break;
  }
  return selected;
}

export function homeBasketUnitsDifferFromProducts(state: {
  kind: string;
  uniqueProducts: number;
  units: number;
}): boolean {
  return state.kind === 'ready' && state.units !== state.uniqueProducts;
}

// Ignore unmounted, superseded, or other-account recipe responses.
export function isRecipeResultCurrent(opts: {
  mounted: boolean;
  requestCurrent: boolean;
  started: AccountScope;
  current: AccountScope;
}): boolean {
  if (opts.mounted !== true) return false;
  if (opts.requestCurrent !== true) return false;
  return isCurrentAccountScope(opts.started, opts.current);
}
