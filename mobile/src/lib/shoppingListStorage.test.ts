import test from 'node:test';
import assert from 'node:assert/strict';

import * as shoppingListStorage from './shoppingListStorage';
import {
  LEGACY_SHOPPING_LIST_KEY,
  SHOPPING_LIST_KEY_PREFIX,
  normaliseCustomerId,
  shoppingListStorageKey,
} from './shoppingListStorage';

test('constant key names are the documented values', () => {
  assert.equal(LEGACY_SHOPPING_LIST_KEY, 'smartBasketShoppingListV1');
  assert.equal(SHOPPING_LIST_KEY_PREFIX, 'smartBasketShoppingListV2:customer:');
});

test('no automatic legacy-migration API is exported', () => {
  // The shared key has no owner, so it is only deleted, never read.
  assert.deepEqual(Object.keys(shoppingListStorage).sort(), [
    'LEGACY_SHOPPING_LIST_KEY',
    'SHOPPING_LIST_KEY_PREFIX',
    'normaliseCustomerId',
    'shoppingListStorageKey',
  ]);
});

test('normaliseCustomerId accepts positive integers (number or clean string) only', () => {
  assert.equal(normaliseCustomerId(7), 7);
  assert.equal(normaliseCustomerId('42'), 42);
  assert.equal(normaliseCustomerId('  15 '), 15);
  assert.equal(normaliseCustomerId(0), null);
  assert.equal(normaliseCustomerId(-3), null);
  assert.equal(normaliseCustomerId(2.5), null);
  assert.equal(normaliseCustomerId('12a'), null);
  assert.equal(normaliseCustomerId(''), null);
  assert.equal(normaliseCustomerId(null), null);
  assert.equal(normaliseCustomerId(undefined), null);
  assert.equal(normaliseCustomerId(Number.NaN), null);
});

test('shoppingListStorageKey is per-account and null for signed-out', () => {
  assert.equal(shoppingListStorageKey(7), 'smartBasketShoppingListV2:customer:7');
  assert.equal(shoppingListStorageKey('7'), 'smartBasketShoppingListV2:customer:7');
  assert.equal(shoppingListStorageKey(null), null);
  assert.equal(shoppingListStorageKey(0), null);
  // Two different accounts never share a key.
  assert.notEqual(shoppingListStorageKey(1), shoppingListStorageKey(2));
});

test('the account-scoped key never equals the legacy device-wide key', () => {
  for (const id of [1, 2, 999]) {
    assert.notEqual(shoppingListStorageKey(id), LEGACY_SHOPPING_LIST_KEY);
  }
});
