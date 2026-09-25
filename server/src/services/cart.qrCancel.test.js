import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cancelActiveQrSession } from './cart.service.js';

const root = dirname(fileURLToPath(import.meta.url));
const cartSource = readFileSync(join(root, 'cart.service.js'), 'utf8');

// Source of one exported function, up to the next top-level export.
function functionBody(source, name) {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const next = source.indexOf('\nexport ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test('every change to a basket cancels the active QR code inside the basket lock', () => {
  for (const name of ['addCartItem', 'updateCartItemQuantity', 'removeCartItem', 'clearCart', 'mergeGuestSessionIntoCustomer']) {
    const body = functionBody(cartSource, name);
    assert.match(body, /withBasket(Capacity)?Locks?\(/, `${name} must take the basket lock`);
    assert.match(body, /cancelActiveQrSession\(transaction, /, `${name} must cancel the QR code in the same transaction`);
  }
});

test('the cancel only touches this customer\'s active sessions', () => {
  const body = functionBody(cartSource, 'cancelActiveQrSession');
  assert.match(body, /WHERE CustomerId = @customerId AND Status = N'active'/);
  assert.match(body, /SET Status = N'cancelled'/);
});

test('cashier approval clears the basket without cancelling the code being approved', () => {
  assert.doesNotMatch(functionBody(cartSource, 'deleteCartItemsInTransaction'), /cancelActiveQrSession/);
});

test('guest baskets have no QR code, so nothing is cancelled', async () => {
  await cancelActiveQrSession(null, { customerId: null, sessionId: 'guest-1' });
});

test('creating a new QR code reuses the same cancel', () => {
  const qr = readFileSync(join(root, 'smartBasket.service.js'), 'utf8');
  assert.match(qr, /cartService\.cancelActiveQrSession\(transaction, identity\)/);
});
