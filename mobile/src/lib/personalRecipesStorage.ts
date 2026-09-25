// Storage key for personal recipes, per account (none when signed out).

import { normaliseCustomerId } from './shoppingListStorage';

// Prefix for the account-scoped personal-recipe key.
export const PERSONAL_RECIPES_KEY_PREFIX = 'smartBasketPersonalRecipesV1:customer:';

export const PERSONAL_RECIPES_SCHEMA_VERSION = 1 as const;

// Storage key for the account, or null when signed out.
export function personalRecipesStorageKey(customerId: unknown): string | null {
  const id = normaliseCustomerId(customerId);
  return id == null ? null : `${PERSONAL_RECIPES_KEY_PREFIX}${id}`;
}
