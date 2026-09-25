// Customer purchase history: only baskets validated by a cashier.

import sql from 'mssql';
import { getPool } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { tableExists } from './database.service.js';

export const PURCHASE_HISTORY_LIMIT = 10;

const RECORD_SMART_BASKET_PREFIX = 'smart-basket-';

export const CUSTOMER_HISTORY_VALIDATED_STATUS_SQL = `Status = N'validated'`;

export const CUSTOMER_HISTORY_LIST_SQL = `
    SELECT TOP (@fetchLimit)
      s.Id,
      s.Status,
      s.CreatedAt,
      s.ValidatedAt,
      s.RejectedAt,
      s.CancelledAt,
      s.ExpiresAt,
      s.ValidationNote,
      (SELECT SUM(i.Quantity) FROM dbo.SB_SmartBasketItems i WHERE i.SessionId = s.Id) AS ItemCount,
      (SELECT COUNT(DISTINCT i.ProductId) FROM dbo.SB_SmartBasketItems i WHERE i.SessionId = s.Id) AS UniqueProductCount,
      (SELECT SUM(COALESCE(i.UnitPriceSnapshot, 0) * i.Quantity)
       FROM dbo.SB_SmartBasketItems i WHERE i.SessionId = s.Id) AS EstimatedSubtotal,
      cv.Id AS ValidationRowId,
      cv.ValidatedBy,
      cv.ValidationStatus,
      cv.Notes AS ValidationNotes,
      cv.CreatedAt AS ValidationCreatedAt
    FROM dbo.SB_SmartBasketSessions s
    OUTER APPLY (
      SELECT TOP 1 v.Id, v.SessionId, v.ValidatedBy, v.ValidationStatus, v.Notes, v.CreatedAt
      FROM dbo.SB_CashierValidations v
      WHERE v.SessionId = s.Id
      ORDER BY v.CreatedAt DESC, v.Id DESC
    ) cv
    WHERE s.CustomerId = @customerId
      AND s.Status = N'validated'
    ORDER BY COALESCE(s.ValidatedAt, s.CreatedAt) DESC, s.Id DESC
`;

export const CUSTOMER_HISTORY_DETAIL_SESSION_SQL = `
      SELECT Id, CustomerId, Status, ExpiresAt, CreatedAt, ValidatedAt, RejectedAt, CancelledAt, ValidationNote
      FROM dbo.SB_SmartBasketSessions
      WHERE Id = @sessionId AND CustomerId = @customerId AND Status = N'validated'
`;

async function smartBasketHistoryReady() {
  return (
    (await tableExists('SB_SmartBasketSessions')) &&
    (await tableExists('SB_SmartBasketItems'))
  );
}

// Parse a customer history id (smart-basket-{id} only).
export function parseCustomerPurchaseHistoryRecordId(recordId) {
  const raw = String(recordId ?? '').trim();
  const sbMatch = /^smart-basket-(\d+)$/i.exec(raw);
  if (sbMatch) {
    const numericId = Number(sbMatch[1]);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new AppError('Invalid purchase history record id.', 400);
    }
    return {
      type: 'smart_basket',
      numericId,
      recordId: `${RECORD_SMART_BASKET_PREFIX}${numericId}`,
    };
  }
  throw new AppError('Invalid purchase history record id.', 400);
}

function mapValidationRow(row) {
  if (!row) return null;
  return {
    id: row.Id,
    sessionId: row.SessionId,
    validatedBy: row.ValidatedBy ?? null,
    validationStatus: row.ValidationStatus,
    notes: row.Notes ?? null,
    createdAt: row.CreatedAt,
  };
}

function mapSmartBasketItemRow(row) {
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
  };
}

// Map a validated basket row to a history record.
export function mapCustomerValidatedBasketSummary(row, validation) {
  const id = row.Id;
  const itemCount = Number(row.ItemCount ?? 0);
  const uniqueProductCount = Number(row.UniqueProductCount ?? 0);
  const estimated = row.EstimatedSubtotal != null ? Number(row.EstimatedSubtotal) : null;

  return {
    id: `${RECORD_SMART_BASKET_PREFIX}${id}`,
    type: 'smart_basket',
    sourceLabel: 'Cashier-validated basket',
    status: 'validated',
    createdAt: row.CreatedAt,
    completedAt: row.ValidatedAt ?? null,
    itemCount,
    uniqueProductCount,
    total: null,
    estimatedTotal: estimated != null && estimated > 0 ? Math.round(estimated * 1000) / 1000 : null,
    summary: `Cashier-validated basket #${id}`,
    validationStatus: validation?.validationStatus ?? null,
    validatedBy: validation?.validatedBy ?? null,
  };
}

async function fetchValidatedSmartBasketSummaries(customerId) {
  if (!(await smartBasketHistoryReady())) return [];

  const pool = await getPool();
  const result = await pool
    .request()
    .input('customerId', sql.Int, customerId)
    .input('fetchLimit', sql.Int, PURCHASE_HISTORY_LIMIT)
    .query(CUSTOMER_HISTORY_LIST_SQL);

  return (result.recordset ?? []).map((row) => {
    const validation = row.ValidationRowId
      ? mapValidationRow({
          Id: row.ValidationRowId,
          SessionId: row.Id,
          ValidatedBy: row.ValidatedBy,
          ValidationStatus: row.ValidationStatus,
          Notes: row.ValidationNotes,
          CreatedAt: row.ValidationCreatedAt,
        })
      : null;
    return mapCustomerValidatedBasketSummary(row, validation);
  });
}

export async function listPurchaseHistory(customerId) {
  const cid = Number(customerId);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw new AppError('Please sign in to view purchase history.', 401);
  }

  return fetchValidatedSmartBasketSummaries(cid);
}

async function loadSmartBasketValidations(pool, sessionId) {
  if (!(await tableExists('SB_CashierValidations'))) return [];
  const result = await pool.request().input('sessionId', sql.Int, sessionId).query(`
    SELECT Id, SessionId, ValidatedBy, ValidationStatus, Notes, CreatedAt
    FROM dbo.SB_CashierValidations
    WHERE SessionId = @sessionId
    ORDER BY CreatedAt DESC, Id DESC
  `);
  return (result.recordset ?? []).map(mapValidationRow);
}

async function getValidatedSmartBasketDetail(customerId, sessionId) {
  if (!(await smartBasketHistoryReady())) {
    throw new AppError('Smart basket history is not available.', 503);
  }

  const pool = await getPool();
  const sessionResult = await pool
    .request()
    .input('sessionId', sql.Int, sessionId)
    .input('customerId', sql.Int, customerId)
    .query(CUSTOMER_HISTORY_DETAIL_SESSION_SQL);

  const sessionRow = sessionResult.recordset?.[0];
  if (!sessionRow) throw new AppError('Purchase record not found.', 404);

  const itemsResult = await pool.request().input('sessionId', sql.Int, sessionId).query(`
    SELECT Id, SessionId, ProductId, ProductNameSnapshot, BarcodeSnapshot, Quantity, UnitPriceSnapshot, CreatedAt
    FROM dbo.SB_SmartBasketItems
    WHERE SessionId = @sessionId
    ORDER BY Id
  `);

  const items = (itemsResult.recordset ?? []).map(mapSmartBasketItemRow);
  const itemCount = items.reduce((sum, line) => sum + line.quantity, 0);
  const uniqueIds = new Set(items.map((i) => String(i.productId).toLowerCase()));
  const estimatedSubtotal = items.reduce((sum, row) => {
    if (row.unitPriceSnapshot == null) return sum;
    return sum + row.unitPriceSnapshot * row.quantity;
  }, 0);

  const validations = await loadSmartBasketValidations(pool, sessionId);
  const latestValidation = validations[0] ?? null;

  const session = {
    id: sessionRow.Id,
    customerId: sessionRow.CustomerId,
    status: sessionRow.Status,
    expiresAt: sessionRow.ExpiresAt,
    createdAt: sessionRow.CreatedAt,
    validatedAt: sessionRow.ValidatedAt ?? null,
    rejectedAt: sessionRow.RejectedAt ?? null,
    cancelledAt: sessionRow.CancelledAt ?? null,
    validationNote: sessionRow.ValidationNote ?? null,
  };

  const summary = mapCustomerValidatedBasketSummary(
    {
      Id: sessionId,
      ItemCount: itemCount,
      UniqueProductCount: uniqueIds.size,
      EstimatedSubtotal: estimatedSubtotal,
      CreatedAt: sessionRow.CreatedAt,
      ValidatedAt: sessionRow.ValidatedAt,
    },
    latestValidation,
  );

  return {
    id: `${RECORD_SMART_BASKET_PREFIX}${sessionId}`,
    type: 'smart_basket',
    sourceLabel: summary.sourceLabel,
    status: 'validated',
    createdAt: sessionRow.CreatedAt,
    completedAt: sessionRow.ValidatedAt ?? null,
    itemCount,
    uniqueProductCount: uniqueIds.size,
    total: null,
    estimatedTotal:
      estimatedSubtotal > 0 ? Math.round(estimatedSubtotal * 1000) / 1000 : null,
    summary: summary.summary,
    session,
    items: items.map((line) => ({
      id: line.id,
      productId: line.productId,
      productCode: null,
      productName: line.productNameSnapshot,
      barcodeSnapshot: line.barcodeSnapshot,
      quantity: line.quantity,
      unitPrice: line.unitPriceSnapshot,
      unitPriceSnapshot: line.unitPriceSnapshot,
      lineTotal:
        line.unitPriceSnapshot != null
          ? Math.round(line.unitPriceSnapshot * line.quantity * 1000) / 1000
          : null,
    })),
    validations,
    validationNote: sessionRow.ValidationNote ?? latestValidation?.notes ?? null,
    latestValidation,
  };
}

export async function getPurchaseHistoryDetail(customerId, recordId) {
  const parsed = parseCustomerPurchaseHistoryRecordId(recordId);
  const cid = Number(customerId);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw new AppError('Please sign in to view purchase history.', 401);
  }

  return getValidatedSmartBasketDetail(cid, parsed.numericId);
}
