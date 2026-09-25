import test from 'node:test';
import assert from 'node:assert/strict';

import {
  catalogProductActions,
  catalogAllowsDirectBasketAdd,
  isDemoBuild,
} from './catalogActionPolicy';

test('the primary catalogue action is always the shopping list', () => {
  assert.equal(catalogProductActions({ demo: false }).primary, 'shoppingList');
  assert.equal(catalogProductActions({ demo: true }).primary, 'shoppingList');
});

test('the demo "add to basket" shortcut only appears in a demo build', () => {
  assert.equal(catalogProductActions({ demo: true }).showDemoAddToBasket, true);
  assert.equal(catalogProductActions({ demo: false }).showDemoAddToBasket, false);
  assert.equal(catalogAllowsDirectBasketAdd({ demo: true }), true);
  assert.equal(catalogAllowsDirectBasketAdd({ demo: false }), false);
});

test('isDemoBuild reads globalThis.__DEV__ strictly as boolean true', () => {
  const g = globalThis as { __DEV__?: unknown };
  const original = g.__DEV__;
  try {
    g.__DEV__ = true;
    assert.equal(isDemoBuild(), true);
    g.__DEV__ = false;
    assert.equal(isDemoBuild(), false);
    g.__DEV__ = 1; // truthy but not boolean true
    assert.equal(isDemoBuild(), false);
    delete g.__DEV__;
    assert.equal(isDemoBuild(), false);
  } finally {
    if (original === undefined) delete g.__DEV__;
    else g.__DEV__ = original;
  }
});

test('with no options, the policy defers to the build flag (no throw)', () => {
  const result = catalogProductActions();
  assert.equal(result.primary, 'shoppingList');
  assert.equal(typeof result.showDemoAddToBasket, 'boolean');
});
