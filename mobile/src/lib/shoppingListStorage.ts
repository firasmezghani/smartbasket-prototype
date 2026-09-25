// Storage key for each customer's shopping list (none when signed out).

// Shared key from older installs, deleted without being read.
export const LEGACY_SHOPPING_LIST_KEY = 'smartBasketShoppingListV1';

// Prefix for the account-scoped key.
export const SHOPPING_LIST_KEY_PREFIX = 'smartBasketShoppingListV2:customer:';

// Valid customer id (positive integer), or null.
export function normaliseCustomerId(customerId: unknown): number | null {
  if (typeof customerId === 'number' && Number.isInteger(customerId) && customerId > 0) {
    return customerId;
  }
  if (typeof customerId === 'string' && /^\d+$/.test(customerId.trim())) {
    const n = Number(customerId.trim());
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  return null;
}

// Storage key for the account, or null when signed out.
export function shoppingListStorageKey(customerId: unknown): string | null {
  const id = normaliseCustomerId(customerId);
  return id == null ? null : `${SHOPPING_LIST_KEY_PREFIX}${id}`;
}
