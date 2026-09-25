import type { Cart } from '../types/cart';

// Maximum distinct product lines in the in-store smart basket (mobile only).
export const SMART_BASKET_UNIQUE_PRODUCT_LIMIT = 5;

export class SmartBasketLimitError extends Error {
  readonly code = 'SMART_BASKET_UNIQUE_PRODUCT_LIMIT' as const;

  constructor(message: string) {
    super(message);
    this.name = 'SmartBasketLimitError';
  }
}

export function normalizeProductId(productId: string): string {
  return String(productId).trim();
}

export function countUniqueProductIds(cart: Cart): number {
  const ids = new Set<string>();
  for (const item of cart.items) {
    const id = normalizeProductId(item.productId);
    if (id) ids.add(id);
  }
  return ids.size;
}

export function basketHasProductId(cart: Cart, productId: string): boolean {
  const target = normalizeProductId(productId);
  if (!target) return false;
  return cart.items.some((item) => normalizeProductId(item.productId) === target);
}

export function isSmartBasketFull(cart: Cart): boolean {
  return countUniqueProductIds(cart) >= SMART_BASKET_UNIQUE_PRODUCT_LIMIT;
}

export type SmartBasketAddCheck = { allowed: true } | { allowed: false; reason: 'invalid' | 'limit' };

export function canAddProductToSmartBasket(cart: Cart, productId: string): SmartBasketAddCheck {
  const id = normalizeProductId(productId);
  if (!id) return { allowed: false, reason: 'invalid' };
  if (basketHasProductId(cart, id)) return { allowed: true };
  if (countUniqueProductIds(cart) >= SMART_BASKET_UNIQUE_PRODUCT_LIMIT) {
    return { allowed: false, reason: 'limit' };
  }
  return { allowed: true };
}

export function isSmartBasketLimitError(err: unknown): boolean {
  if (err instanceof SmartBasketLimitError) return true;
  if (err && typeof err === 'object' && (err as { code?: unknown }).code === 'BASKET_PRODUCT_LIMIT') {
    return true;
  }
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : '';
  const lower = msg.toLowerCase();
  return (
    lower.includes('smart basket is limited') ||
    lower.includes('panier intelligent est limité') ||
    lower.includes('5 different products') ||
    lower.includes('5 produits différents')
  );
}
