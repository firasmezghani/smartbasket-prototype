import sql from 'mssql';
import { getPool } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import {
  computeCustomerPromoFields,
  isProductInCustomerCatalogue,
  pickFirstHttpUrl,
} from './catalog.service.js';
import { getMaxBasketQuantity } from './appConfig.service.js';
import { summariseBasketActivity } from './basketActivity.js';

const SESSION_ID_REGEX = /^[a-zA-Z0-9-]{1,100}$/;

// Stable machine-readable code returned to clients on a capacity violation.
export const BASKET_CAPACITY_EXCEEDED_CODE = 'BASKET_CAPACITY_EXCEEDED';
// Stable machine-readable code returned to clients for an invalid quantity.
export const INVALID_CART_QUANTITY_CODE = 'INVALID_CART_QUANTITY';
// Largest quantity for a single add or update (the basket limit is checked separately).
export const MAX_CART_LINE_QUANTITY = 1000;

// How long (ms) a mutation waits to acquire the per-basket lock before failing safe.
const BASKET_LOCK_TIMEOUT_MS = 10_000;

// Validate a cart quantity. Invalid values are rejected with 400
// INVALID_CART_QUANTITY; an omitted quantity defaults to 1 only when allowed.
export function parseCartQuantityInput(raw, { allowOmitted = false } = {}) {
  if (allowOmitted && raw === undefined) return 1;

  let n;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw)) {
    n = Number(raw);
  } else {
    throw invalidCartQuantity();
  }
  if (!Number.isInteger(n) || n < 1 || n > MAX_CART_LINE_QUANTITY) {
    throw invalidCartQuantity();
  }
  return n;
}

function invalidCartQuantity() {
  return new AppError(
    `quantity must be a positive integer between 1 and ${MAX_CART_LINE_QUANTITY}.`,
    400,
    { code: INVALID_CART_QUANTITY_CODE, details: { min: 1, max: MAX_CART_LINE_QUANTITY } },
  );
}

// Total quantity across all lines of one basket.
async function getBasketQuantitySum(runner, identity) {
  const request =
    runner instanceof sql.Transaction ? new sql.Request(runner) : runner.request();
  if (identity.customerId) {
    request.input('customerId', sql.Int, identity.customerId);
  } else {
    request.input('sessionId', sql.NVarChar(100), identity.sessionId);
  }
  const res = await request.query(`
    SELECT COALESCE(SUM(Quantity), 0) AS total
    FROM dbo.SB_CartItems
    WHERE ${cartTableWhere(identity)}
  `);
  return Number(res.recordset?.[0]?.total ?? 0);
}

// Throw 409 when a change would exceed `max_basket_quantity`. Only increases
// are checked; existing lines are never removed.
export function assertProjectedWithinCapacity(projectedTotal, maxQuantity) {
  if (projectedTotal > maxQuantity) {
    throw new AppError(
      `This basket is limited to ${maxQuantity} items in total. Remove items or reduce quantities before adding more.`,
      409,
      { code: BASKET_CAPACITY_EXCEEDED_CODE, details: { maxBasketQuantity: maxQuantity } },
    );
  }
}

// Lock name for one basket, built from validated ids only.
function basketLockName(identity) {
  return identity.customerId
    ? `cart:customer:${identity.customerId}`
    : `cart:session:${identity.sessionId}`;
}

// Work out the lock names for the given baskets, reject duplicates and sort
// them. Always taking locks in the same order prevents deadlocks.
export function planBasketLocks(identities) {
  if (!Array.isArray(identities) || identities.length === 0) {
    throw new Error('planBasketLocks: at least one basket identity is required.');
  }

  const named = identities.map((identity) => ({ identity, lockName: basketLockName(identity) }));
  const seen = new Set();
  for (const { lockName } of named) {
    if (seen.has(lockName)) {
      throw new Error(`planBasketLocks: duplicate lock resource "${lockName}".`);
    }
    seen.add(lockName);
  }
  // Same sorted order everywhere, so two requests can never deadlock.
  return named.sort((a, b) => (a.lockName < b.lockName ? -1 : a.lockName > b.lockName ? 1 : 0));
}

// Run `fn` in one transaction that locks each basket (the limit is a `SUM` over
// the whole basket). Locks are taken in sorted order to avoid deadlocks.
export async function withBasketLocks(identities, fn) {
  const named = planBasketLocks(identities);

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    for (const { lockName } of named) {
      const lockRequest = new sql.Request(transaction)
        .input('Resource', sql.NVarChar(255), lockName)
        .input('LockMode', sql.VarChar(32), 'Exclusive')
        .input('LockOwner', sql.VarChar(32), 'Transaction')
        .input('LockTimeout', sql.Int, BASKET_LOCK_TIMEOUT_MS);
      const lockResult = await lockRequest.execute('sp_getapplock');
      // sp_getapplock return codes: 0/1 success, negative = timeout/deadlock/error.
      if ((lockResult.returnValue ?? -999) < 0) {
        throw new AppError('The basket is busy. Please try again.', 503, { code: 'BASKET_LOCKED' });
      }
    }

    // Read the totals after the locks are held, never before.
    const maxQuantity = await getMaxBasketQuantity();
    const totalsByLockName = new Map();
    for (const { identity, lockName } of named) {
      totalsByLockName.set(lockName, await getBasketQuantitySum(transaction, identity));
    }
    const getTotal = (identity) => {
      const lockName = basketLockName(identity);
      if (!totalsByLockName.has(lockName)) {
        throw new Error(`withBasketLocks: "${lockName}" was not locked by this operation.`);
      }
      return totalsByLockName.get(lockName);
    };

    const result = await fn({ transaction, maxQuantity, getTotal });

    await transaction.commit();
    return result;
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      // The transaction may already be aborted by SQL Server (e.g. after a
      // deadlock); rollback failing here must not mask the original error.
    }
    throw err;
  }
}

// Delete all cart lines of a basket inside an open, locked transaction (used by cashier approval).
export async function deleteCartItemsInTransaction(transaction, identity) {
  const request = bindIdentityInputs(new sql.Request(transaction), identity);
  await request.query(`DELETE FROM dbo.SB_CartItems WHERE ${cartTableWhere(identity)}`);
}

// Cancel the customer's active basket QR code. Called whenever their basket changes,
// so a cashier can only approve a code that matches the current basket.
export async function cancelActiveQrSession(transaction, identity) {
  if (!identity.customerId) return;
  await new sql.Request(transaction).input('customerId', sql.Int, identity.customerId).query(`
    UPDATE dbo.SB_SmartBasketSessions
    SET Status = N'cancelled', CancelledAt = SYSUTCDATETIME()
    WHERE CustomerId = @customerId AND Status = N'active'
  `);
}

// Single-basket version of `withBasketLocks` for add and update.
async function withBasketCapacityLock(identity, fn) {
  return withBasketLocks([identity], ({ transaction, maxQuantity, getTotal }) =>
    fn({ transaction, maxQuantity, currentTotal: getTotal(identity) }),
  );
}

function bindIdentityInputs(request, identity) {
  if (identity.customerId) {
    request.input('customerId', sql.Int, identity.customerId);
  } else {
    request.input('sessionId', sql.NVarChar(100), identity.sessionId);
  }
  return request;
}

// Find the existing (identity, product) line, if any, inside `transaction`.
async function findCartLine(transaction, identity, pid) {
  const request = bindIdentityInputs(new sql.Request(transaction), identity).input(
    'pid',
    sql.UniqueIdentifier,
    pid,
  );
  const res = await request.query(`
    SELECT Id, Quantity FROM dbo.SB_CartItems
    WHERE ${cartTableWhere(identity)} AND ProductId = @pid
  `);
  return res.recordset?.[0] ?? null;
}

// Insert a new cart line inside `transaction`. Exactly one of customerId/sessionId is bound.
async function insertCartLine(transaction, identity, pid, qty) {
  await new sql.Request(transaction)
    .input('customerId', sql.Int, identity.customerId ?? null)
    .input('sessionId', sql.NVarChar(100), identity.sessionId ?? null)
    .input('pid', sql.UniqueIdentifier, pid)
    .input('q', sql.Int, qty)
    .query(`
      INSERT INTO dbo.SB_CartItems (CustomerId, SessionId, ProductId, Quantity)
      VALUES (@customerId, @sessionId, @pid, @q)
    `);
}

export function parseCartIdentity(req) {
  const rawCustomer = req.headers['x-customer-id'];
  const rawSession = req.headers['x-cart-session-id'];

  const customerId =
    rawCustomer === undefined || rawCustomer === null || rawCustomer === ''
      ? null
      : Number.parseInt(String(rawCustomer).trim(), 10);

  if (customerId != null && Number.isInteger(customerId) && customerId > 0) {
    return { customerId, sessionId: null };
  }

  const sessionId =
    rawSession === undefined || rawSession === null ? '' : String(rawSession).trim();
  if (sessionId !== '' && SESSION_ID_REGEX.test(sessionId)) {
    return { customerId: null, sessionId };
  }

  throw new AppError(
    'Please sign in or restart the app.',
    400,
  );
}

function mapCartRow(row) {
  const promo = computeCustomerPromoFields({
    PrixSite: row.UnitPrice,
    Remise: row.Remise,
    UrlImage: row.UrlImage,
    UrlNormal: row.UrlNormal,
    UrlPromo: row.UrlPromo,
  });

  const unitRaw = row.UnitPrice == null || Number.isNaN(Number(row.UnitPrice)) ? null : Number(row.UnitPrice);
  const unitPrice =
    unitRaw != null && Number.isFinite(unitRaw) && unitRaw > 0 ? unitRaw : null;
  const quantity = Number(row.Quantity);
  const lineTotal =
    unitPrice != null && Number.isFinite(quantity) ? Math.round(unitPrice * quantity * 100) / 100 : null;

  const productIdStr = row.ProductId ? String(row.ProductId) : '';
  const hasBinary = Boolean(row.HasImageBinary);
  const imageUrl =
    promo.cardRemoteImageUrl || pickFirstHttpUrl(row.UrlImage, row.UrlNormal, row.UrlPromo);
  const imageEndpoint = hasBinary && productIdStr ? `/api/catalog/products/${productIdStr}/image` : null;

  const showPromoBadge =
    promo.discountPercent != null && Number.isFinite(promo.discountPercent) && promo.discountPercent > 0;

  const remoteImageUrl = pickFirstHttpUrl(row.UrlImage, row.UrlNormal, row.UrlPromo);

  return {
    id: row.Id,
    productId: productIdStr,
    productName: row.ProductName ?? null,
    productCode: row.ProductCode == null || String(row.ProductCode).trim() === '' ? null : String(row.ProductCode).trim(),
    unitPrice,
    salePrice: promo.salePrice,
    oldPrice: promo.oldPrice,
    discountPercent: promo.discountPercent,
    hasPromo: promo.hasPromo,
    showPromoBadge,
    priceDisplayMode: promo.priceDisplayMode,
    quantity,
    lineTotal,
    imageUrl,
    imageEndpoint,
    promoImageUrl: promo.promoImageUrl ?? null,
    remoteImageUrl,
    cardRemoteImageUrl: promo.cardRemoteImageUrl ?? null,
    hasImageBinary: hasBinary,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
  };
}

function cartJoinWhere(identity) {
  if (identity.customerId) {
    return 'c.CustomerId = @customerId';
  }
  return 'c.CustomerId IS NULL AND c.SessionId = @sessionId';
}

function cartTableWhere(identity) {
  if (identity.customerId) {
    return 'CustomerId = @customerId';
  }
  return 'CustomerId IS NULL AND SessionId = @sessionId';
}

export async function getCart(identity) {
  const pool = await getPool();
  const joinWhere = cartJoinWhere(identity);
  const request = pool.request();
  if (identity.customerId) {
    request.input('customerId', sql.Int, identity.customerId);
  } else {
    request.input('sessionId', sql.NVarChar(100), identity.sessionId);
  }

  const text = `
    SELECT
      c.Id,
      c.ProductId,
      c.Quantity,
      c.CreatedAt,
      c.UpdatedAt,
      s.LibArt AS ProductName,
      s.CodArt AS ProductCode,
      s.PrixSite AS UnitPrice,
      s.Remise,
      s.UrlImage,
      s.UrlNormal,
      s.UrlPromo,
      CASE WHEN s.imgArt IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS HasImageBinary
    FROM dbo.SB_CartItems c
    INNER JOIN dbo.TabStocksaico s ON s.IDArt = c.ProductId
    WHERE ${joinWhere}
    ORDER BY c.Id
  `;

  const result = await request.query(text);
  const items = (result.recordset ?? []).map(mapCartRow);
  const totalQuantity = items.reduce((sum, row) => sum + row.quantity, 0);
  const grandTotal = items.reduce((sum, row) => sum + (row.lineTotal ?? 0), 0);

  // Tell the app whether the basket is idle, so it can offer Resume or Start new.
  const activity = summariseBasketActivity(items);

  return {
    items,
    totalQuantity,
    grandTotal: Math.round(grandTotal * 100) / 100,
    lastActivityAt: activity.lastActivityAt,
    serverTime: activity.serverTime,
    stale: activity.stale,
    staleThresholdMs: activity.staleThresholdMs,
  };
}

// Add a product (or increase its quantity). The capacity check and the write
// share one locked transaction, so concurrent adds cannot exceed the limit.
export async function addCartItem(identity, productId, quantity) {
  const pid = String(productId ?? '').trim();
  if (!pid) throw new AppError('productId is required.', 400);
  const addQty = parseCartQuantityInput(quantity, { allowOmitted: true });

  const eligible = await isProductInCustomerCatalogue(pid);
  if (!eligible) {
    throw new AppError('Product not found.', 404);
  }

  await withBasketCapacityLock(identity, async ({ transaction, currentTotal, maxQuantity }) => {
    assertProjectedWithinCapacity(currentTotal + addQty, maxQuantity);

    const existing = await findCartLine(transaction, identity, pid);
    if (existing) {
      const newQty = Number(existing.Quantity) + addQty;
      await new sql.Request(transaction)
        .input('id', sql.Int, existing.Id)
        .input('q', sql.Int, newQty)
        .query(`
          UPDATE dbo.SB_CartItems
          SET Quantity = @q, UpdatedAt = SYSUTCDATETIME()
          WHERE Id = @id
        `);
    } else {
      await insertCartLine(transaction, identity, pid, addQty);
    }
    await cancelActiveQrSession(transaction, identity);
  });

  return getCart(identity);
}

// Set a line's quantity. Only increases are checked against the limit.
export async function updateCartItemQuantity(identity, itemId, quantity) {
  const id = Number(itemId);
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Invalid cart item id.', 400);
  const qty = parseCartQuantityInput(quantity, { allowOmitted: false });

  await withBasketCapacityLock(identity, async ({ transaction, currentTotal, maxQuantity }) => {
    const currentReq = bindIdentityInputs(new sql.Request(transaction), identity).input(
      'id',
      sql.Int,
      id,
    );
    const currentRes = await currentReq.query(`
      SELECT Quantity FROM dbo.SB_CartItems WHERE Id = @id AND ${cartTableWhere(identity)}
    `);
    const currentRow = currentRes.recordset?.[0];
    if (!currentRow) {
      throw new AppError('Cart item not found.', 404);
    }
    const currentLineQty = Number(currentRow.Quantity);

    if (qty > currentLineQty) {
      assertProjectedWithinCapacity(currentTotal - currentLineQty + qty, maxQuantity);
    }

    const request = bindIdentityInputs(new sql.Request(transaction), identity)
      .input('id', sql.Int, id)
      .input('q', sql.Int, qty);
    const result = await request.query(`
      UPDATE dbo.SB_CartItems
      SET Quantity = @q, UpdatedAt = SYSUTCDATETIME()
      WHERE Id = @id AND ${cartTableWhere(identity)}
    `);

    if (Number(result.rowsAffected?.[0] ?? 0) === 0) {
      throw new AppError('Cart item not found.', 404);
    }
    await cancelActiveQrSession(transaction, identity);
  });

  return getCart(identity);
}

export async function removeCartItem(identity, itemId) {
  const id = Number(itemId);
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Invalid cart item id.', 400);

  await withBasketLocks([identity], async ({ transaction }) => {
    const request = bindIdentityInputs(new sql.Request(transaction), identity).input('id', sql.Int, id);
    const result = await request.query(`
      DELETE FROM dbo.SB_CartItems
      WHERE Id = @id AND ${cartTableWhere(identity)}
    `);
    if (Number(result.rowsAffected?.[0] ?? 0) === 0) {
      throw new AppError('Cart item not found.', 404);
    }
    await cancelActiveQrSession(transaction, identity);
  });

  return getCart(identity);
}

export async function clearCart(identity) {
  await withBasketLocks([identity], async ({ transaction }) => {
    await deleteCartItemsInTransaction(transaction, identity);
    await cancelActiveQrSession(transaction, identity);
  });
  return getCart(identity);
}

// Move a guest basket into the customer's basket after sign-in. Both baskets
// stay locked, so an item added at the same time is never lost.
export async function mergeGuestSessionIntoCustomer(customerId, guestSessionId) {
  const cid = Number(customerId);
  if (!Number.isInteger(cid) || cid <= 0) throw new AppError('Invalid customer.', 400);
  const sid = String(guestSessionId ?? '').trim();
  if (!sid || !SESSION_ID_REGEX.test(sid)) {
    throw new AppError('Invalid or missing guest session id.', 400);
  }

  const customerIdentity = { customerId: cid, sessionId: null };
  const guestIdentity = { customerId: null, sessionId: sid };

  return withBasketLocks([customerIdentity, guestIdentity], async ({ transaction, maxQuantity, getTotal }) => {
    const currentTotal = getTotal(customerIdentity);

    // Read the guest basket while it is locked, so no new item is missed.
    const listReq = new sql.Request(transaction).input('sessionId', sql.NVarChar(100), sid);
    const listRes = await listReq.query(`
      SELECT Id, ProductId, Quantity
      FROM dbo.SB_CartItems
      WHERE CustomerId IS NULL AND SessionId = @sessionId
      ORDER BY Id
    `);
    const rows = listRes.recordset ?? [];

    // Check the limit once for the whole merge. If it is exceeded, everything is
    // rolled back and both baskets stay unchanged.
    const incomingUnits = rows.reduce((sum, row) => {
      const q = Number(row.Quantity);
      return Number.isInteger(q) && q >= 1 ? sum + q : sum;
    }, 0);
    if (incomingUnits > 0) {
      assertProjectedWithinCapacity(currentTotal + incomingUnits, maxQuantity);
    }

    for (const row of rows) {
      const pid = row.ProductId;
      const qty = Number(row.Quantity);
      if (!Number.isInteger(qty) || qty < 1) continue;

      const findReq = new sql.Request(transaction)
        .input('customerId', sql.Int, cid)
        .input('pid', sql.UniqueIdentifier, pid);
      const foundRes = await findReq.query(`
        SELECT Id, Quantity FROM dbo.SB_CartItems
        WHERE CustomerId = @customerId AND ProductId = @pid
      `);
      const existing = foundRes.recordset?.[0];

      if (existing) {
        const newQty = Number(existing.Quantity) + qty;
        await new sql.Request(transaction)
          .input('id', sql.Int, existing.Id)
          .input('q', sql.Int, newQty)
          .query(`
            UPDATE dbo.SB_CartItems SET Quantity = @q, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id
          `);
      } else {
        await new sql.Request(transaction)
          .input('customerId', sql.Int, cid)
          .input('pid', sql.UniqueIdentifier, pid)
          .input('q', sql.Int, qty)
          .query(`
            INSERT INTO dbo.SB_CartItems (CustomerId, SessionId, ProductId, Quantity)
            VALUES (@customerId, NULL, @pid, @q)
          `);
      }
    }

    await new sql.Request(transaction)
      .input('sessionId', sql.NVarChar(100), sid)
      .query(`DELETE FROM dbo.SB_CartItems WHERE CustomerId IS NULL AND SessionId = @sessionId`);

    if (rows.length > 0) await cancelActiveQrSession(transaction, customerIdentity);
    return { mergedLines: rows.length };
  });
}
