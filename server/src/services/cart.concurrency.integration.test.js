import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import sql from 'mssql';

import { getPool, closePool } from '../config/db.js';
import {
  addCartItem,
  getCart,
  clearCart,
  mergeGuestSessionIntoCustomer,
  BASKET_CAPACITY_EXCEEDED_CODE,
} from './cart.service.js';
import { updateMaxBasketQuantity, getMaxBasketQuantityConfig } from './appConfig.service.js';
import { getProducts } from './catalog.service.js';
import { registerCustomer } from './customer.service.js';

// Mutates global capacity and synthetic baskets. Explicit disposable DB only.
// Default npm test skips without opening a connection. See docs/DATABASE_HANDOVER.md.
import { openDisposableDatabase, verifyPool } from '../../test-support/disposableDatabase.js';
let target = null;
beforeEach(async () => {
  if (dbAvailable) await verifyPool(await getPool(), target);
});

let dbAvailable = false;
let hasTwoProducts = false;

after(async () => {
  await closePool();
});

test('(setup) verify designated disposable database and synthetic catalogue', async (t) => {
  target = await openDisposableDatabase();
  if (!target) return t.skip('Disposable integration tests require explicit opt-in.');
  const { products } = await getProducts({ limit: 5 });
  assert.ok(products.length >= 2, 'Provision synthetic fixtures first.');
  hasTwoProducts = true;
  dbAvailable = true;
});

test('two concurrent adds to the same basket cannot together exceed max_basket_quantity', async (t) => {
  if (!dbAvailable || !hasTwoProducts) {
    t.skip('database/catalogue prerequisites not met (see setup test)');
    return;
  }

  const identity = {
    customerId: null,
    sessionId: `concur-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };

  const { products } = await getProducts({ limit: 5 });
  const [productA, productB] = products;

  const original = await getMaxBasketQuantityConfig();
  try {
    // A small, deterministic cap: two adds of 3 units each (6 total) must
    // never both succeed against a limit of 5.
    await updateMaxBasketQuantity(5, 'concurrency-test');

    // Two different products, so only a basket-level lock (not a row lock) can
    // stop both adds from passing the limit check.
    const [a, b] = await Promise.allSettled([
      addCartItem(identity, productA.id, 3),
      addCartItem(identity, productB.id, 3),
    ]);

    const fulfilled = [a, b].filter((o) => o.status === 'fulfilled');
    const rejected = [a, b].filter((o) => o.status === 'rejected');

    assert.equal(fulfilled.length, 1, `expected exactly one concurrent add to succeed, got ${fulfilled.length}`);
    assert.equal(rejected.length, 1, `expected exactly one concurrent add to be rejected, got ${rejected.length}`);
    assert.equal(rejected[0].reason?.code, BASKET_CAPACITY_EXCEEDED_CODE);
    assert.equal(rejected[0].reason?.statusCode, 409);
    assert.equal(rejected[0].reason?.details?.maxBasketQuantity, 5);

    const finalCart = await getCart(identity);
    assert.ok(
      finalCart.totalQuantity <= 5,
      `final basket total ${finalCart.totalQuantity} must never exceed the cap of 5`,
    );
    assert.equal(finalCart.totalQuantity, 3, 'exactly the one successful add (3 units) should be present');
    assert.equal(finalCart.items.length, 1);
  } finally {
    await clearCart(identity);
    await updateMaxBasketQuantity(original.value, 'concurrency-test-restore');
  }
});

test('a rapid burst of adds to the same basket never exceeds the cap, no matter the interleaving', async (t) => {
  if (!dbAvailable || !hasTwoProducts) {
    t.skip('database/catalogue prerequisites not met (see setup test)');
    return;
  }

  const identity = {
    customerId: null,
    sessionId: `concur-burst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  const { products } = await getProducts({ limit: 5 });
  const productId = products[0].id;

  const original = await getMaxBasketQuantityConfig();
  try {
    await updateMaxBasketQuantity(10, 'concurrency-test');

    // 6 concurrent requests of 2 units each = 12 units requested against a
    // cap of 10: at most 5 can succeed (10 units); at least 1 must be rejected.
    const attempts = Array.from({ length: 6 }, () => addCartItem(identity, productId, 2));
    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;

    assert.equal(fulfilled + rejected, 6);
    assert.ok(rejected >= 1, 'at least one over-cap add must be rejected');
    for (const r of results) {
      if (r.status === 'rejected') {
        assert.equal(r.reason?.code, BASKET_CAPACITY_EXCEEDED_CODE);
      }
    }

    const finalCart = await getCart(identity);
    assert.ok(finalCart.totalQuantity <= 10, `final total ${finalCart.totalQuantity} must never exceed 10`);
    assert.equal(finalCart.totalQuantity, fulfilled * 2, 'the final total must equal exactly the successful adds');
  } finally {
    await clearCart(identity);
    await updateMaxBasketQuantity(original.value, 'concurrency-test-restore');
  }
});

test('merge vs. a concurrent guest add on the same guest session: no successfully added unit is ever lost', async (t) => {
  if (!dbAvailable || !hasTwoProducts) {
    t.skip('database/catalogue prerequisites not met (see setup test)');
    return;
  }

  const { products } = await getProducts({ limit: 5 });
  const [productA, productB] = products;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const original = await getMaxBasketQuantityConfig();
  let syntheticCustomerId = null;
  const REPEATS = 5; // exercise both possible interleavings across repeats, per the task

  try {
    // A merge needs a real customer row, so register a test customer here
    // and delete it in `finally`. Real customers' baskets are never used.
    const customer = await registerCustomer({
      fullName: 'Merge Race Test Customer (synthetic, deleted after the test)',
      email: `merge-race-test-${stamp}@smartbasket.invalid`,
      password: `merge-race-test-${stamp}`,
    });
    syntheticCustomerId = customer.id;
    const customerIdentity = { customerId: syntheticCustomerId, sessionId: null };

    // High limit on purpose: this test checks that no update is lost.
    await updateMaxBasketQuantity(50, 'concurrency-test');

    const interleavingsSeen = new Set();

    for (let i = 0; i < REPEATS; i += 1) {
      const guestSessionId = `merge-race-${stamp}-${i}`;
      const guestIdentity = { customerId: null, sessionId: guestSessionId };

      // Starting state on both sides before the race.
      await addCartItem(customerIdentity, productA.id, 2); // customer already has 2 of A
      await addCartItem(guestIdentity, productA.id, 2); // guest already has 2 of A too

      // Merge the guest basket while another item is being added to it.
      const [mergeResult, addResult] = await Promise.allSettled([
        mergeGuestSessionIntoCustomer(syntheticCustomerId, guestSessionId),
        addCartItem(guestIdentity, productB.id, 3),
      ]);

      assert.equal(mergeResult.status, 'fulfilled', `merge failed unexpectedly: ${mergeResult.reason?.message}`);
      assert.equal(addResult.status, 'fulfilled', `concurrent add failed unexpectedly: ${addResult.reason?.message}`);

      const customerCart = await getCart(customerIdentity);
      const guestCart = await getCart(guestIdentity);

      const customerHasB = customerCart.items.find((it) => it.productId === productB.id) ?? null;
      const guestHasB = guestCart.items.find((it) => it.productId === productB.id) ?? null;

      // The added item must end up in exactly one basket (never lost, never doubled).
      const presentInCustomer = customerHasB != null;
      const presentInGuest = guestHasB != null;
      assert.notEqual(
        presentInCustomer,
        presentInGuest,
        `iteration ${i}: product B must be in exactly one basket (customer=${presentInCustomer}, guest=${presentInGuest})`,
      );
      const bQuantity = (customerHasB?.quantity ?? 0) + (guestHasB?.quantity ?? 0);
      assert.equal(bQuantity, 3, `iteration ${i}: no product-B units lost or duplicated`);
      interleavingsSeen.add(presentInCustomer ? 'merged-together' : 'landed-after-merge');

      // Combined quantity is conserved regardless of which interleaving occurred:
      // 2 (customer pre-seed) + 2 (guest pre-seed) + 3 (concurrent add) = 7.
      assert.equal(
        customerCart.totalQuantity + guestCart.totalQuantity,
        7,
        `iteration ${i}: combined quantity must be conserved across both baskets`,
      );

      // Capacity is still respected throughout.
      assert.ok(customerCart.totalQuantity <= 50, `iteration ${i}: customer total must never exceed the cap`);

      // Reset both baskets before the next iteration.
      await clearCart(customerIdentity);
      await clearCart(guestIdentity);
    }

    // Not a hard requirement (real network timing decides which interleaving
    // occurs on any given run), but recorded for the test report.
    assert.ok(interleavingsSeen.size >= 1);
  } finally {
    if (syntheticCustomerId != null) {
      const pool = await getPool();
      await clearCart({ customerId: syntheticCustomerId, sessionId: null });
      await pool.request().input('id', sql.Int, syntheticCustomerId).query(`
        DELETE FROM dbo.SB_Customers WHERE Id = @id
      `);
    }
    await updateMaxBasketQuantity(original.value, 'concurrency-test-restore');
  }
});
