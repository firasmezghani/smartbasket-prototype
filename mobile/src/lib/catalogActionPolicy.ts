// Product screen buttons: Add to list, plus a demo scan button in development builds.

// True in a development build.
export function isDemoBuild(): boolean {
  // Read via globalThis so this module compiles cleanly both inside the Expo
  // app (where RN declares `__DEV__`) and under plain `node --test`.
  const g = globalThis as { __DEV__?: unknown };
  return g.__DEV__ === true;
}

export type CatalogProductActions = {
  // The primary, always-shown action. Currently always the shopping list.
  primary: 'shoppingList';
  // Show the "Demo: simulate scanning" button (never in production).
  showDemoAddToBasket: boolean;
};

// Decide which actions the product screen shows.
export function catalogProductActions(opts: { demo?: boolean } = {}): CatalogProductActions {
  const demo = typeof opts.demo === 'boolean' ? opts.demo : isDemoBuild();
  return {
    primary: 'shoppingList',
    showDemoAddToBasket: demo,
  };
}

// Whether the demo "add to basket" button is allowed.
export function catalogAllowsDirectBasketAdd(opts: { demo?: boolean } = {}): boolean {
  return catalogProductActions(opts).showDemoAddToBasket;
}
