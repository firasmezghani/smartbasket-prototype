// Helpers for the basket limit. The server re-checks; the app only gives quick feedback.

import type { Cart } from '../types/cart';

// Matches server DEFAULT_MAX_BASKET_QUANTITY (appConfig.service.js).
export const DEFAULT_MAX_BASKET_QUANTITY = 100;
// Matches server MIN_BASKET_QUANTITY / MAX_BASKET_QUANTITY_LIMIT.
export const MIN_BASKET_QUANTITY = 1;
export const MAX_BASKET_QUANTITY_LIMIT = 500;

export type AppConfig = {
  maxBasketQuantity: number;
  // 'database' when the server returned a stored value, 'default' otherwise.
  maxBasketQuantitySource: 'database' | 'default';
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  maxBasketQuantity: DEFAULT_MAX_BASKET_QUANTITY,
  maxBasketQuantitySource: 'default',
};

function clampToRange(n: number): number {
  return Math.min(MAX_BASKET_QUANTITY_LIMIT, Math.max(MIN_BASKET_QUANTITY, Math.trunc(n)));
}

// Parse the `/api/app-config` response; invalid values fall back to the default.
export function parseAppConfig(raw: unknown): AppConfig {
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const data =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;

  const mbq = data.maxBasketQuantity;
  let value: unknown;
  let source: unknown;
  if (mbq && typeof mbq === 'object') {
    value = (mbq as Record<string, unknown>).value;
    source = (mbq as Record<string, unknown>).source;
  } else {
    value = mbq;
  }

  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < MIN_BASKET_QUANTITY || n > MAX_BASKET_QUANTITY_LIMIT) {
    return { ...DEFAULT_APP_CONFIG };
  }
  return {
    maxBasketQuantity: clampToRange(n),
    maxBasketQuantitySource: source === 'database' ? 'database' : 'default',
  };
}

// Sum of quantities across every cart line (the "total units" the limit caps).
export function basketTotalQuantity(cart: Pick<Cart, 'items'> | null | undefined): number {
  if (!cart || !Array.isArray(cart.items)) return 0;
  return cart.items.reduce((sum, item) => {
    const q = Number(item?.quantity);
    return Number.isFinite(q) && q > 0 ? sum + Math.trunc(q) : sum;
  }, 0);
}

// Would this add go over the basket limit? Reductions are always allowed.
export function wouldExceedBasketCapacity(
  currentTotal: number,
  addQuantity: number,
  maxBasketQuantity: number,
): boolean {
  const delta = Math.trunc(Number(addQuantity) || 0);
  if (delta <= 0) return false;
  const base = Math.max(0, Math.trunc(Number(currentTotal) || 0));
  const max = Number.isFinite(maxBasketQuantity) ? maxBasketQuantity : DEFAULT_MAX_BASKET_QUANTITY;
  return base + delta > max;
}

// Stable code the server returns for a capacity violation (errorHandler `code`).
export const BASKET_CAPACITY_EXCEEDED_CODE = 'BASKET_CAPACITY_EXCEEDED';

// Basket-limit error shown to the user. `maxBasketQuantity` is the limit the
// server enforced, or null if unknown (never a cached value).
export class BasketCapacityError extends Error {
  readonly code = BASKET_CAPACITY_EXCEEDED_CODE;
  readonly maxBasketQuantity: number | null;

  constructor(message: string, maxBasketQuantity: number | null = null) {
    super(message);
    this.name = 'BasketCapacityError';
    this.maxBasketQuantity = maxBasketQuantity;
  }
}

export function isBasketCapacityError(err: unknown): boolean {
  if (err instanceof BasketCapacityError) return true;
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    if (o.code === BASKET_CAPACITY_EXCEEDED_CODE) return true;
    if (o.status === 409 && typeof o.message === 'string' && /basket is limited to \d+ items/i.test(o.message)) {
      return true;
    }
  }
  return false;
}

// Validate a limit returned by the server, or null if invalid.
export function parseAuthoritativeMaxBasketQuantity(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < MIN_BASKET_QUANTITY || n > MAX_BASKET_QUANTITY_LIMIT) {
    return null;
  }
  return n;
}

// Read the enforced limit from a server error's `details`, or null.
export function extractAuthoritativeMaxFromError(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const details = (err as { details?: unknown }).details;
  if (!details || typeof details !== 'object') return null;
  return parseAuthoritativeMaxBasketQuantity((details as Record<string, unknown>).maxBasketQuantity);
}
