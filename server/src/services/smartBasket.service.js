import sql from 'mssql';
import { getPool } from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { tableExists } from './database.service.js';
import {
  formatSmartBasketQrValue,
  generateSmartBasketToken,
  hashSmartBasketToken,
  normalizeSmartBasketTokenInput,
} from '../utils/smartBasketToken.js';
import {
  countSessionUnitsAndProducts,
  describeSessionSuperseded,
  parsePositiveSessionId,
  sessionRowOwnedByCustomer,
} from './smartBasket.sessionAccess.js';
import * as cartService from './cart.service.js';
import {
  freezeSimulatedWeightLine,
  loadSyntheticBasketWeightFixture,
  summariseSimulatedBasketWeight,
} from '../data/demo/syntheticBasketWeights.js';

export const SMART_BASKET_MAX_UNIQUE_PRODUCTS = 5;
export const SMART_BASKET_TTL_MS = 10 * 60 * 1000;

const SESSION_STATUSES = new Set(['active', 'validated', 'rejected', 'expired', 'cancelled']);

function mapSessionRow(row) {
  return {
    id: row.Id,
    customerId: row.CustomerId,
    status: row.Status,
    expiresAt: row.ExpiresAt,
    createdAt: row.CreatedAt,
    validatedAt: row.ValidatedAt ?? null,
    rejectedAt: row.RejectedAt ?? null,
    cancelledAt: row.CancelledAt ?? null,
    validationNote: row.ValidationNote ?? null,
  };
}

function mapItemRow(row) {
  return {
    id: row.Id,
    sessionId: row.SessionId,
    productId: String(row.ProductId),
    productNameSnapshot: row.ProductNameSnapshot,
    barcodeSnapshot: row.BarcodeSnapshot ?? null,
    quantity: Number(row.Quantity),
    unitPriceSnapshot:
      row.UnitPriceSnapshot == null || Number.isNaN(Number(row.UnitPriceSnapshot))
        ? null
        : Number(row.UnitPriceSnapshot),
    createdAt: row.CreatedAt,
    simulatedUnitWeightGrams:
      row.SimulatedUnitWeightGrams == null ? null : Number(row.SimulatedUnitWeightGrams),
    simulatedLineWeightGrams:
      row.SimulatedLineWeightGrams == null ? null : Number(row.SimulatedLineWeightGrams),
    simulatedWeightProvenance: row.SimulatedWeightProvenance ?? null,
    simulatedWeightFixtureVersion: row.SimulatedWeightFixtureVersion ?? null,
  };
}

export async function assertSmartBasketTablesReady() {
  const ok =
    (await tableExists('SB_SmartBasketSessions')) &&
    (await tableExists('SB_SmartBasketItems')) &&
    (await tableExists('SB_CashierValidations'));
  if (!ok) {
    throw new AppError(
      'Basket codes are not available right now. Please try again later.',
      503,
    );
  }
}

async function fetchPrimaryBarcode(pool, productId) {
  try {
    const result = await pool
      .request()
      .input('pid', sql.UniqueIdentifier, productId)
      .query(`
        SELECT TOP 1 LTRIM(RTRIM(b.CodBar)) AS CodBar
        FROM dbo.TabStockBarCodesaico b
        WHERE b.IDArt = @pid AND LTRIM(RTRIM(b.CodBar)) <> N''
        ORDER BY b.CodBar
      `);
    const cod = result.recordset?.[0]?.CodBar;
    return cod ? String(cod).trim() : null;
  } catch {
    return null;
  }
}

export async function loadSessionValidations(sessionId) {
  if (!(await tableExists('SB_CashierValidations'))) return [];
  const pool = await getPool();
  const result = await pool.request().input('sessionId', sql.Int, sessionId).query(`
    SELECT Id, SessionId, ValidatedBy, ValidationStatus, Notes, CreatedAt
    FROM dbo.SB_CashierValidations
    WHERE SessionId = @sessionId
    ORDER BY CreatedAt DESC, Id DESC
  `);
  return (result.recordset ?? []).map((row) => ({
    id: row.Id,
    sessionId: row.SessionId,
    validatedBy: row.ValidatedBy ?? null,
    validationStatus: row.ValidationStatus,
    notes: row.Notes ?? null,
    createdAt: row.CreatedAt,
  }));
}

async function simulatedWeightColumnsReady() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT CASE WHEN COL_LENGTH(N'dbo.SB_SmartBasketItems', N'SimulatedUnitWeightGrams') IS NOT NULL THEN 1 ELSE 0 END AS Ok
  `);
  return Number(result.recordset?.[0]?.Ok) === 1;
}

async function loadSessionItems(sessionId) {
  const pool = await getPool();
  const hasWeight = await simulatedWeightColumnsReady();
  const extra = hasWeight
    ? ', SimulatedUnitWeightGrams, SimulatedLineWeightGrams, SimulatedWeightProvenance, SimulatedWeightFixtureVersion'
    : '';
  const result = await pool.request().input('sessionId', sql.Int, sessionId).query(`
    SELECT Id, SessionId, ProductId, ProductNameSnapshot, BarcodeSnapshot, Quantity, UnitPriceSnapshot, CreatedAt${extra}
    FROM dbo.SB_SmartBasketItems
    WHERE SessionId = @sessionId
    ORDER BY Id
  `);
  return (result.recordset ?? []).map(mapItemRow);
}

async function expireSessionIfNeeded(session) {
  if (!session || session.status !== 'active') return session;
  const expires = new Date(session.expiresAt).getTime();
  if (Number.isFinite(expires) && expires > Date.now()) return session;

  const pool = await getPool();
  await pool
    .request()
    .input('id', sql.Int, session.id)
    .query(`
      UPDATE dbo.SB_SmartBasketSessions
      SET Status = N'expired'
      WHERE Id = @id AND Status = N'active'
    `);
  return { ...session, status: 'expired' };
}

function countUniqueProductIds(items) {
  const ids = new Set();
  for (const item of items) {
    const id = String(item.productId ?? '').trim();
    if (id) ids.add(id.toLowerCase());
  }
  return ids.size;
}

// Create a QR session from the customer's cart (valid for 10 minutes).
export async function createQrSessionFromCart(customerId) {
  await assertSmartBasketTablesReady();
  const cid = Number(customerId);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw new AppError('Please sign in to generate a cashier QR.', 401);
  }

  const identity = { customerId: cid, sessionId: null };
  const cart = await cartService.getCart(identity);
  if (!cart.items.length) {
    throw new AppError('Your smart basket is empty. Add products before generating a QR code.', 400);
  }

  const uniqueCount = countUniqueProductIds(cart.items);
  if (uniqueCount > SMART_BASKET_MAX_UNIQUE_PRODUCTS) {
    throw new AppError(
      `Smart basket is limited to ${SMART_BASKET_MAX_UNIQUE_PRODUCTS} different products for cashier validation.`,
      400,
      { code: 'BASKET_PRODUCT_LIMIT' },
    );
  }

  const plainToken = generateSmartBasketToken();
  const tokenHash = hashSmartBasketToken(plainToken);
  const expiresAt = new Date(Date.now() + SMART_BASKET_TTL_MS);

  const demoWeight = env.SIMULATED_BASKET_WEIGHT === true;
  const hasWeightCols = await simulatedWeightColumnsReady();
  if (demoWeight && !hasWeightCols) {
    console.error('SIMULATED_BASKET_WEIGHT is on but the weight columns are missing from the database.');
    throw new AppError(
      'Basket codes are not available right now. Please try again later.',
      503,
    );
  }
  const weightFixture = demoWeight ? loadSyntheticBasketWeightFixture() : null;

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await cartService.cancelActiveQrSession(transaction, identity);

    const insertSession = await new sql.Request(transaction)
      .input('customerId', sql.Int, cid)
      .input('tokenHash', sql.NVarChar(128), tokenHash)
      .input('expiresAt', sql.DateTime2, expiresAt)
      .query(`
        INSERT INTO dbo.SB_SmartBasketSessions (CustomerId, TokenHash, Status, ExpiresAt)
        OUTPUT INSERTED.Id, INSERTED.CustomerId, INSERTED.Status, INSERTED.ExpiresAt, INSERTED.CreatedAt,
               INSERTED.ValidatedAt, INSERTED.RejectedAt, INSERTED.CancelledAt, INSERTED.ValidationNote
        VALUES (@customerId, @tokenHash, N'active', @expiresAt)
      `);
    const sessionRow = insertSession.recordset?.[0];
    const sessionId = sessionRow.Id;

    for (const line of cart.items) {
      const barcode = await fetchPrimaryBarcode(pool, line.productId);
      const unit =
        line.unitPrice != null && Number.isFinite(Number(line.unitPrice))
          ? Number(line.unitPrice)
          : line.salePrice != null && Number.isFinite(Number(line.salePrice))
            ? Number(line.salePrice)
            : null;
      const weight = freezeSimulatedWeightLine({
        enabled: demoWeight,
        fixture: weightFixture,
        productId: line.productId,
        quantity: line.quantity,
      });
      const request = new sql.Request(transaction)
        .input('sessionId', sql.Int, sessionId)
        .input('productId', sql.UniqueIdentifier, line.productId)
        .input('productName', sql.NVarChar(255), String(line.productName || line.productCode || 'Product').slice(0, 255))
        .input('barcode', sql.NVarChar(120), barcode ? barcode.slice(0, 120) : null)
        .input('quantity', sql.Int, line.quantity)
        .input('unitPrice', sql.Decimal(18, 3), unit);
      if (hasWeightCols) {
        await request
          .input('unitGrams', sql.Int, weight.simulatedUnitWeightGrams)
          .input('lineGrams', sql.Int, weight.simulatedLineWeightGrams)
          .input('weightProvenance', sql.NVarChar(40), weight.simulatedWeightProvenance)
          .input('weightVersion', sql.NVarChar(20), weight.simulatedWeightFixtureVersion)
          .query(`
            INSERT INTO dbo.SB_SmartBasketItems
              (SessionId, ProductId, ProductNameSnapshot, BarcodeSnapshot, Quantity, UnitPriceSnapshot,
               SimulatedUnitWeightGrams, SimulatedLineWeightGrams, SimulatedWeightProvenance, SimulatedWeightFixtureVersion)
            VALUES (@sessionId, @productId, @productName, @barcode, @quantity, @unitPrice,
                    @unitGrams, @lineGrams, @weightProvenance, @weightVersion)
          `);
      } else {
        await request.query(`
          INSERT INTO dbo.SB_SmartBasketItems
            (SessionId, ProductId, ProductNameSnapshot, BarcodeSnapshot, Quantity, UnitPriceSnapshot)
          VALUES (@sessionId, @productId, @productName, @barcode, @quantity, @unitPrice)
        `);
      }
    }

    await transaction.commit();

    const session = mapSessionRow(sessionRow);
    const items = await loadSessionItems(sessionId);
    const itemCount = items.reduce((sum, row) => sum + row.quantity, 0);

    return {
      sessionId: session.id,
      token: formatSmartBasketQrValue(plainToken),
      plainToken,
      expiresAt: session.expiresAt,
      itemCount,
      uniqueProductCount: uniqueCount,
      status: session.status,
      qrValue: formatSmartBasketQrValue(plainToken),
      items,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function getSessionForCustomer(customerId, sessionId) {
  await assertSmartBasketTablesReady();
  const cid = Number(customerId);
  const sid = parsePositiveSessionId(sessionId);
  if (!Number.isInteger(cid) || cid <= 0 || sid == null) {
    throw new AppError('Invalid session id.', 400);
  }

  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, sid)
    .input('customerId', sql.Int, cid)
    .query(`
      SELECT TOP 1
        Id, CustomerId, Status, ExpiresAt, CreatedAt, ValidatedAt, RejectedAt, CancelledAt, ValidationNote
      FROM dbo.SB_SmartBasketSessions
      WHERE Id = @id AND CustomerId = @customerId
    `);
  const row = result.recordset?.[0];
  if (!row || !sessionRowOwnedByCustomer(row, cid)) {
    throw new AppError('Smart basket session not found.', 404);
  }

  let session = mapSessionRow(row);
  session = await expireSessionIfNeeded(session);
  const items = await loadSessionItems(session.id);
  const counts = countSessionUnitsAndProducts(items);

  let newerSessionId = null;
  if (session.status === 'cancelled') {
    const newer = await pool
      .request()
      .input('customerId', sql.Int, cid)
      .input('id', sql.Int, sid)
      .query(`
        SELECT TOP 1 Id
        FROM dbo.SB_SmartBasketSessions
        WHERE CustomerId = @customerId AND Id > @id
        ORDER BY Id DESC
      `);
    newerSessionId = newer.recordset?.[0]?.Id ?? null;
  }
  const extra = describeSessionSuperseded({
    status: session.status,
    sessionId: session.id,
    newerSessionId,
  });

  return {
    ...session,
    items,
    ...counts,
    superseded: extra.superseded,
    newerSessionId: extra.newerSessionId,
  };
}

export async function getCurrentSessionForCustomer(customerId) {
  await assertSmartBasketTablesReady();
  const cid = Number(customerId);
  const pool = await getPool();
  const result = await pool.request().input('customerId', sql.Int, cid).query(`
    SELECT TOP 1
      Id, CustomerId, Status, ExpiresAt, CreatedAt, ValidatedAt, RejectedAt, CancelledAt, ValidationNote
    FROM dbo.SB_SmartBasketSessions
    WHERE CustomerId = @customerId
    ORDER BY CreatedAt DESC, Id DESC
  `);
  const row = result.recordset?.[0];
  if (!row) return null;

  let session = mapSessionRow(row);
  session = await expireSessionIfNeeded(session);
  const items = await loadSessionItems(session.id);
  const itemCount = items.reduce((sum, row) => sum + row.quantity, 0);
  const uniqueProductCount = countUniqueProductIds(items);

  return {
    ...session,
    items,
    itemCount,
    uniqueProductCount,
  };
}

export async function cancelSessionForCustomer(customerId, sessionId) {
  await assertSmartBasketTablesReady();
  const cid = Number(customerId);
  const sid = Number(sessionId);
  if (!Number.isInteger(sid) || sid <= 0) throw new AppError('Invalid session id.', 400);

  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, sid)
    .input('customerId', sql.Int, cid)
    .query(`
      UPDATE dbo.SB_SmartBasketSessions
      SET Status = N'cancelled', CancelledAt = SYSUTCDATETIME()
      OUTPUT INSERTED.Id, INSERTED.CustomerId, INSERTED.Status, INSERTED.ExpiresAt, INSERTED.CreatedAt,
             INSERTED.ValidatedAt, INSERTED.RejectedAt, INSERTED.CancelledAt, INSERTED.ValidationNote
      WHERE Id = @id AND CustomerId = @customerId AND Status = N'active'
    `);

  const row = result.recordset?.[0];
  if (!row) throw new AppError('Active smart basket session not found.', 404);
  return mapSessionRow(row);
}

async function findSessionByTokenHash(tokenHash) {
  const pool = await getPool();
  const result = await pool.request().input('tokenHash', sql.NVarChar(128), tokenHash).query(`
    SELECT TOP 1
      s.Id, s.CustomerId, s.Status, s.ExpiresAt, s.CreatedAt, s.ValidatedAt, s.RejectedAt, s.CancelledAt, s.ValidationNote,
      c.FullName AS CustomerName, c.Phone AS CustomerPhone, c.Email AS CustomerEmail
    FROM dbo.SB_SmartBasketSessions s
    INNER JOIN dbo.SB_Customers c ON c.Id = s.CustomerId
    WHERE s.TokenHash = @tokenHash
  `);
  return result.recordset?.[0] ?? null;
}

export async function getCashierBasketByToken(rawToken) {
  await assertSmartBasketTablesReady();
  const plain = normalizeSmartBasketTokenInput(rawToken);
  if (!plain || plain.length < 16) {
    throw new AppError('Invalid basket token.', 400);
  }

  const tokenHash = hashSmartBasketToken(plain);
  const row = await findSessionByTokenHash(tokenHash);
  if (!row) throw new AppError('Smart basket session not found.', 404);

  let session = mapSessionRow(row);
  session = await expireSessionIfNeeded(session);

  const items = await loadSessionItems(session.id);
  const itemCount = items.reduce((sum, row) => sum + row.quantity, 0);
  const uniqueProductCount = countUniqueProductIds(items);
  const estimatedSubtotal = items.reduce((sum, row) => {
    if (row.unitPriceSnapshot == null) return sum;
    return sum + row.unitPriceSnapshot * row.quantity;
  }, 0);

  const validations =
    session.status !== 'active' ? await loadSessionValidations(session.id) : [];
  const latestValidation = validations[0] ?? null;

  const payload = {
    session,
    items,
    itemCount,
    uniqueProductCount,
    estimatedSubtotal: Math.round(estimatedSubtotal * 1000) / 1000,
    simulatedWeight: summariseSimulatedBasketWeight(items),
    customer: {
      id: session.customerId,
      fullName: row.CustomerName ?? null,
      phone: row.CustomerPhone ?? null,
      email: row.CustomerEmail ?? null,
    },
    validations,
    latestValidation,
  };

  return payload;
}

// Save the cashier's decision (only the first one counts). Approving also
// empties the customer's basket in the same transaction.
async function finalizeValidation(sessionId, status, staffUsername, notes) {
  const pool = await getPool();
  const sessionRes = await pool.request().input('id', sql.Int, sessionId).query(`
    SELECT CustomerId FROM dbo.SB_SmartBasketSessions WHERE Id = @id
  `);
  const sessionRow = sessionRes.recordset?.[0];
  if (!sessionRow) throw new AppError('Smart basket session not found.', 404);

  const customerId = Number(sessionRow.CustomerId);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw new AppError('Smart basket session is missing a customer.', 500);
  }

  const newStatus = status === 'validated' ? 'validated' : 'rejected';
  const note = notes ? String(notes).slice(0, 500) : null;
  const validatedBy = staffUsername ? String(staffUsername).slice(0, 120) : null;
  const basketIdentity = { customerId, sessionId: null };

  return cartService.withBasketLocks([basketIdentity], async ({ transaction }) => {
    // Lock the session row and check it again, so only one cashier decision
    // can succeed.
    const liveRes = await new sql.Request(transaction).input('id', sql.Int, sessionId).query(`
      SELECT CustomerId, Status, ExpiresAt
      FROM dbo.SB_SmartBasketSessions WITH (UPDLOCK, ROWLOCK)
      WHERE Id = @id
    `);
    const live = liveRes.recordset?.[0];
    if (!live) throw new AppError('Smart basket session not found.', 404);

    let statusNow = live.Status;
    const expires = new Date(live.ExpiresAt).getTime();
    if (statusNow === 'active' && Number.isFinite(expires) && expires <= Date.now()) {
      statusNow = 'expired';
      await new sql.Request(transaction).input('id', sql.Int, sessionId).query(`
        UPDATE dbo.SB_SmartBasketSessions
        SET Status = N'expired'
        WHERE Id = @id AND Status = N'active'
      `);
    }

    if (statusNow !== 'active') {
      throw new AppError(`This smart basket session is already ${statusNow}.`, 409);
    }

    const updateSql =
      newStatus === 'validated'
        ? `
          UPDATE dbo.SB_SmartBasketSessions
          SET Status = N'validated', ValidatedAt = SYSUTCDATETIME(), ValidationNote = @note
          WHERE Id = @id AND Status = N'active' AND ExpiresAt > SYSUTCDATETIME()
        `
        : `
          UPDATE dbo.SB_SmartBasketSessions
          SET Status = N'rejected', RejectedAt = SYSUTCDATETIME(), ValidationNote = @note
          WHERE Id = @id AND Status = N'active' AND ExpiresAt > SYSUTCDATETIME()
        `;

    const updateResult = await new sql.Request(transaction)
      .input('id', sql.Int, sessionId)
      .input('note', sql.NVarChar(500), note)
      .query(updateSql);

    if (Number(updateResult.rowsAffected?.[0] ?? 0) !== 1) {
      const again = await new sql.Request(transaction).input('id', sql.Int, sessionId).query(`
        SELECT Status FROM dbo.SB_SmartBasketSessions WHERE Id = @id
      `);
      const lostStatus = again.recordset?.[0]?.Status;
      throw new AppError(
        lostStatus
          ? `This smart basket session is already ${lostStatus}.`
          : 'Smart basket session not found.',
        409,
      );
    }

    await new sql.Request(transaction)
      .input('sessionId', sql.Int, sessionId)
      .input('validatedBy', sql.NVarChar(120), validatedBy)
      .input('validationStatus', sql.NVarChar(20), newStatus)
      .input('notes', sql.NVarChar(500), note)
      .query(`
        INSERT INTO dbo.SB_CashierValidations (SessionId, ValidatedBy, ValidationStatus, Notes)
        VALUES (@sessionId, @validatedBy, @validationStatus, @notes)
      `);

    if (newStatus === 'validated') {
      await cartService.deleteCartItemsInTransaction(transaction, basketIdentity);
    }

    const updated = await new sql.Request(transaction).input('id', sql.Int, sessionId).query(`
      SELECT Id, CustomerId, Status, ExpiresAt, CreatedAt, ValidatedAt, RejectedAt, CancelledAt, ValidationNote
      FROM dbo.SB_SmartBasketSessions WHERE Id = @id
    `);
    return mapSessionRow(updated.recordset?.[0]);
  });
}

export async function validateBasketByToken(rawToken, staffUsername) {
  const data = await getCashierBasketByToken(rawToken);
  const session = await finalizeValidation(data.session.id, 'validated', staffUsername, null);
  const validations = await loadSessionValidations(session.id);
  return {
    session,
    items: data.items,
    customer: data.customer,
    validations,
    latestValidation: validations[0] ?? null,
  };
}

export async function rejectBasketByToken(rawToken, staffUsername, notes) {
  const plain = normalizeSmartBasketTokenInput(rawToken);
  const tokenHash = hashSmartBasketToken(plain);
  const row = await findSessionByTokenHash(tokenHash);
  if (!row) throw new AppError('Smart basket session not found.', 404);

  let session = mapSessionRow(row);
  session = await expireSessionIfNeeded(session);
  if (session.status === 'expired') {
    throw new AppError('This smart basket QR has expired.', 410);
  }
  if (session.status !== 'active') {
    throw new AppError(`This smart basket session is already ${session.status}.`, 409);
  }

  const updated = await finalizeValidation(session.id, 'rejected', staffUsername, notes);
  const items = await loadSessionItems(session.id);
  const validations = await loadSessionValidations(session.id);
  return {
    session: updated,
    items,
    customer: {
      id: session.customerId,
      fullName: row.CustomerName ?? null,
      phone: row.CustomerPhone ?? null,
      email: row.CustomerEmail ?? null,
    },
    validations,
    latestValidation: validations[0] ?? null,
  };
}
