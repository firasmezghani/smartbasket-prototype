// Checks the cashier decision without a database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)));

test('finalizeValidation keeps session update, audit insert and basket clear in one locked path', () => {
  const src = readFileSync(join(root, 'smartBasket.service.js'), 'utf8');
  const start = src.indexOf('async function finalizeValidation');
  assert.ok(start >= 0);
  const body = src.slice(start, src.indexOf('export async function validateBasketByToken', start));
  assert.match(body, /withBasketLocks/);
  assert.match(body, /rowsAffected/);
  assert.match(body, /deleteCartItemsInTransaction/);
  assert.match(body, /INSERT INTO dbo\.SB_CashierValidations/);
  assert.match(body, /ExpiresAt > SYSUTCDATETIME\(\)/);
  assert.match(body, /UPDLOCK, ROWLOCK/);
  // Must not clear the basket after a separate commit.
  assert.doesNotMatch(body, /transaction\.commit\(\)[\s\S]*clearCart/);
  assert.doesNotMatch(body, /clearCart\(/);
});

test('cart service exports shared lock helper and in-transaction clear', async () => {
  const cart = await import('./cart.service.js');
  assert.equal(typeof cart.withBasketLocks, 'function');
  assert.equal(typeof cart.deleteCartItemsInTransaction, 'function');
});

test('withBasketLocks rollback path does not mask the original failure', async () => {
  const src = readFileSync(join(root, 'cart.service.js'), 'utf8');
  const start = src.indexOf('export async function withBasketLocks');
  assert.ok(start >= 0);
  const body = src.slice(start, src.indexOf('export async function deleteCartItemsInTransaction', start));
  assert.match(body, /transaction\.rollback\(\)/);
  assert.match(body, /must not mask the original error/);
  assert.match(body, /throw err/);
  // Catch around rollback must be empty of rethrow so the outer `throw err` wins.
  assert.match(body, /catch\s*\{[^}]*\}\s*throw err/s);
});

test('approval clears cart only inside the locked transaction; rejection does not clear', () => {
  const src = readFileSync(join(root, 'smartBasket.service.js'), 'utf8');
  const start = src.indexOf('async function finalizeValidation');
  const body = src.slice(start, src.indexOf('export async function validateBasketByToken', start));
  assert.match(
    body,
    /if \(newStatus === 'validated'\) \{\s*await cartService\.deleteCartItemsInTransaction/s,
  );
  assert.doesNotMatch(body, /newStatus === 'rejected'[\s\S]{0,80}deleteCartItemsInTransaction/);
});
