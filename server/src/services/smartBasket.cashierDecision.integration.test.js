import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import sql from 'mssql';
import { randomBytes } from 'node:crypto';

import { closePool, getPool } from '../config/db.js';
import { hashSmartBasketToken } from '../utils/smartBasketToken.js';
import {
  createQrSessionFromCart,
  rejectBasketByToken,
  validateBasketByToken,
} from './smartBasket.service.js';
import { addCartItem, getCart } from './cart.service.js';

import { openDisposableDatabase, verifyPool } from '../../test-support/disposableDatabase.js';
const PRODUCT_ID = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEE0001';
const SECOND_PRODUCT_ID = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEE0002';
let target = null;
let ready = false;
before(async () => {
  target = await openDisposableDatabase();
  ready = target !== null;
});
beforeEach(async () => {
  if (ready) await verifyPool(await getPool(), target);
});
after(async () => { await closePool(); });
function requireReady(t) {
  if (!ready) {
    t.skip('Disposable integration tests require explicit opt-in.');
    return false;
  }
  return true;
}

async function seedActiveSession({ expired = false, status = 'active' } = {}) {
  const pool = await getPool();
  const plain = randomBytes(32).toString('base64url');
  const tokenHash = hashSmartBasketToken(plain);
  const customerRes = await pool.request().query(`
    SELECT TOP 1 Id FROM dbo.SB_Customers ORDER BY Id
  `);
  const customerId = Number(customerRes.recordset[0].Id);

  await pool
    .request()
    .input('customerId', sql.Int, customerId)
    .input('productId', sql.UniqueIdentifier, PRODUCT_ID)
    .query(`
      DELETE FROM dbo.SB_CartItems WHERE CustomerId = @customerId;
      INSERT INTO dbo.SB_CartItems (CustomerId, SessionId, ProductId, Quantity)
      VALUES (@customerId, NULL, @productId, 2);
    `);

  const expiresAt = expired
    ? new Date(Date.now() - 60_000)
    : new Date(Date.now() + 10 * 60_000);

  const sessionRes = await pool
    .request()
    .input('customerId', sql.Int, customerId)
    .input('tokenHash', sql.NVarChar(128), tokenHash)
    .input('status', sql.NVarChar(20), status)
    .input('expiresAt', sql.DateTime2, expiresAt)
    .query(`
      INSERT INTO dbo.SB_SmartBasketSessions (CustomerId, TokenHash, Status, ExpiresAt)
      OUTPUT INSERTED.Id
      VALUES (@customerId, @tokenHash, @status, @expiresAt);
    `);
  const sessionId = Number(sessionRes.recordset[0].Id);

  await pool
    .request()
    .input('sessionId', sql.Int, sessionId)
    .input('productId', sql.UniqueIdentifier, PRODUCT_ID)
    .query(`
      INSERT INTO dbo.SB_SmartBasketItems
        (SessionId, ProductId, ProductNameSnapshot, BarcodeSnapshot, Quantity, UnitPriceSnapshot)
      VALUES
        (@sessionId, @productId, N'Cashier Test Milk', N'000', 2, 1.250);
    `);

  return { plain, sessionId, customerId };
}

async function countValidations(sessionId) {
  const pool = await getPool();
  const res = await pool.request().input('id', sql.Int, sessionId).query(`
    SELECT COUNT(*) AS n FROM dbo.SB_CashierValidations WHERE SessionId = @id
  `);
  return Number(res.recordset[0].n);
}

async function sessionStatus(sessionId) {
  const pool = await getPool();
  const res = await pool.request().input('id', sql.Int, sessionId).query(`
    SELECT Status FROM dbo.SB_SmartBasketSessions WHERE Id = @id
  `);
  return res.recordset[0]?.Status ?? null;
}

async function cartQuantity(customerId) {
  const pool = await getPool();
  const res = await pool.request().input('id', sql.Int, customerId).query(`
    SELECT COALESCE(SUM(Quantity), 0) AS qty
    FROM dbo.SB_CartItems WHERE CustomerId = @id
  `);
  return Number(res.recordset[0].qty);
}

test('(setup) designated disposable database probe', async (t) => {
  if (!requireReady(t)) return;
  const pool = await getPool();
  const res = await pool.request().query('SELECT DB_NAME() AS dbName');
  assert.equal(res.recordset[0].dbName, target);
});

test('concurrent approve/approve: exactly one wins; one audit row; basket cleared once', async (t) => {
  if (!requireReady(t)) return;
  const { plain, sessionId, customerId } = await seedActiveSession();

  const [a, b] = await Promise.allSettled([
    validateBasketByToken(plain, 'cashier-a'),
    validateBasketByToken(plain, 'cashier-b'),
  ]);

  const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
  const rejected = [a, b].filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'exactly one approve must succeed');
  assert.equal(rejected.length, 1, 'exactly one approve must lose');
  assert.equal(rejected[0].reason?.statusCode, 409);
  assert.equal(await sessionStatus(sessionId), 'validated');
  assert.equal(await countValidations(sessionId), 1, 'loser must not insert an audit row');
  assert.equal(await cartQuantity(customerId), 0, 'approved basket must be cleared');
});

test('concurrent approve/reject: exactly one decision; loser leaves no audit row', async (t) => {
  if (!requireReady(t)) return;
  const { plain, sessionId, customerId } = await seedActiveSession();

  const [a, b] = await Promise.allSettled([
    validateBasketByToken(plain, 'cashier-approve'),
    rejectBasketByToken(plain, 'cashier-reject', 'not today'),
  ]);

  const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
  const rejected = [a, b].filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason?.statusCode, 409);

  const status = await sessionStatus(sessionId);
  assert.ok(status === 'validated' || status === 'rejected', `unexpected ${status}`);
  assert.equal(await countValidations(sessionId), 1);

  if (status === 'validated') {
    assert.equal(await cartQuantity(customerId), 0);
  } else {
    assert.equal(await cartQuantity(customerId), 2, 'rejection retains the basket');
  }
});

test('repeated decision on terminal session inserts no second audit row', async (t) => {
  if (!requireReady(t)) return;
  const { plain, sessionId, customerId } = await seedActiveSession();

  await validateBasketByToken(plain, 'cashier-first');
  assert.equal(await sessionStatus(sessionId), 'validated');
  assert.equal(await countValidations(sessionId), 1);
  assert.equal(await cartQuantity(customerId), 0);

  await assert.rejects(
    () => validateBasketByToken(plain, 'cashier-second'),
    (err) => err?.statusCode === 409,
  );
  await assert.rejects(
    () => rejectBasketByToken(plain, 'cashier-second', 'late'),
    (err) => err?.statusCode === 409,
  );
  assert.equal(await countValidations(sessionId), 1);
  assert.equal(await sessionStatus(sessionId), 'validated');
});

test('expired active session cannot be approved and leaves no audit row', async (t) => {
  if (!requireReady(t)) return;
  const { plain, sessionId, customerId } = await seedActiveSession({ expired: true });

  await assert.rejects(
    () => validateBasketByToken(plain, 'cashier-expired'),
    (err) => err?.statusCode === 409 || err?.statusCode === 410,
  );
  const status = await sessionStatus(sessionId);
  assert.ok(status === 'expired' || status === 'active');
  assert.equal(await countValidations(sessionId), 0);
  assert.equal(await cartQuantity(customerId), 2, 'failed decision must not clear the basket');
});

test('clear-basket failure rolls back approval: session stays active, no audit, cart kept', async (t) => {
  if (!requireReady(t)) return;
  const pool = await getPool();
  const { plain, sessionId, customerId } = await seedActiveSession();

  await pool.request().query(`
    CREATE OR ALTER TRIGGER dbo.TR_CashierTest_BlockCartDelete
    ON dbo.SB_CartItems
    AFTER DELETE
    AS
    BEGIN
      SET NOCOUNT ON;
      THROW 51031, 'cashier-test forced clear failure', 1;
    END;
  `);

  try {
    await assert.rejects(
      () => validateBasketByToken(plain, 'cashier-clear-fail'),
      (err) => {
        const msg = String(err?.message ?? err);
        return /forced clear failure|cashier-test/i.test(msg);
      },
    );
    assert.equal(await sessionStatus(sessionId), 'active', 'approval must roll back');
    assert.equal(await countValidations(sessionId), 0, 'audit insert must roll back');
    assert.equal(await cartQuantity(customerId), 2, 'cart must remain');
  } finally {
    await pool.request().query(`
      IF OBJECT_ID(N'dbo.TR_CashierTest_BlockCartDelete', N'TR') IS NOT NULL
        DROP TRIGGER dbo.TR_CashierTest_BlockCartDelete;
    `);
  }
});

test('rejection retains basket and records a single audit row', async (t) => {
  if (!requireReady(t)) return;
  const { plain, sessionId, customerId } = await seedActiveSession();

  const result = await rejectBasketByToken(plain, 'cashier-reject', 'items missing');
  assert.equal(result.session.status, 'rejected');
  assert.equal(await sessionStatus(sessionId), 'rejected');
  assert.equal(await countValidations(sessionId), 1);
  assert.equal(await cartQuantity(customerId), 2);
});

test('adding a product after the QR code cancels it, so approval is refused and nothing is lost', async (t) => {
  if (!requireReady(t)) return;
  const pool = await getPool();
  const customerRes = await pool.request().query(`SELECT TOP 1 Id FROM dbo.SB_Customers ORDER BY Id`);
  const customerId = Number(customerRes.recordset[0].Id);
  const identity = { customerId, sessionId: null };
  await pool.request().input('customerId', sql.Int, customerId)
    .query(`DELETE FROM dbo.SB_CartItems WHERE CustomerId = @customerId`);

  await addCartItem(identity, PRODUCT_ID, 1);
  const qr = await createQrSessionFromCart(customerId);
  await addCartItem(identity, SECOND_PRODUCT_ID, 1);

  assert.equal(await sessionStatus(qr.sessionId), 'cancelled');
  await assert.rejects(validateBasketByToken(qr.plainToken, 'cashier-late'), {
    statusCode: 409,
    message: 'This smart basket session is already cancelled.',
  });
  assert.equal(await countValidations(qr.sessionId), 0);
  const productIds = (await getCart(identity)).items.map((item) => item.productId.toUpperCase()).sort();
  assert.deepEqual(productIds, [PRODUCT_ID, SECOND_PRODUCT_ID]);
});
