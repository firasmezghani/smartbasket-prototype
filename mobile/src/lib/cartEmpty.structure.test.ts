import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

test('empty basket uses a local AppIcon layout, not the FeatureIcon tile', () => {
  const cart = readFileSync(join(root, 'src/screens/CartScreen.tsx'), 'utf8');
  assert.doesNotMatch(cart, /EmptyState/);
  assert.doesNotMatch(cart, /FeatureIcon/);
  assert.match(cart, /AppIcon/);
  assert.match(cart, /basket-outline/);
  assert.match(cart, /basket\.emptyTitle/);
  assert.match(cart, /basket\.emptyBody/);
  assert.match(cart, /basket\.scanBarcode/);
  assert.match(cart, /basket\.openShoppingList/);
  assert.match(cart, /emptyListLink/);
  assert.match(cart, /list-outline/);
  assert.match(cart, /loading && cart\.items\.length === 0 && !error/);
  assert.match(cart, /error && cart\.items\.length === 0/);
  assert.match(cart, /navigate\('Scan'\)/);
  assert.match(cart, /navigate\('Home', \{ screen: 'ShoppingList' \}\)/);
});
