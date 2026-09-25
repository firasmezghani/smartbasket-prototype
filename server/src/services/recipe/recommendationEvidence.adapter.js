// Loads the customer's current basket and validated purchase history (read only).

import sql from 'mssql';
import { AppError } from '../../utils/AppError.js';

// Session status that may contribute purchase-history evidence.
export const VALIDATED_HISTORY_STATUS = 'validated';

// Session statuses that must never contribute history evidence.
export const EXCLUDED_HISTORY_STATUSES = Object.freeze([
  'active',
  'rejected',
  'cancelled',
  'expired',
]);

// Hard cap on how many of the customer's most recent validated sessions are read.
export const RECOMMENDATION_HISTORY_SESSION_LIMIT = 20;

// Page size for catalogue products used in recipe links (max 100).
export const RECOMMENDATION_CATALOGUE_DEFAULT_LIMIT = 50;
export const RECOMMENDATION_CATALOGUE_MAX_LIMIT = 100;

const EVIDENCE_UNAVAILABLE = 'Recommendation evidence is temporarily unavailable.';

// Current basket of a signed-in customer.
export const CURRENT_BASKET_SQL = `
    SELECT
      c.ProductId AS id,
      c.Quantity AS basketQuantity,
      s.LibArt AS name,
      s.LibFam AS family,
      CASE
        WHEN s.ExLibArtWeb IS NOT NULL AND LTRIM(RTRIM(s.ExLibArtWeb)) <> N''
          THEN LTRIM(RTRIM(s.ExLibArtWeb))
        WHEN s.ExLibArt IS NOT NULL AND LTRIM(RTRIM(s.ExLibArt)) <> N''
          THEN LTRIM(RTRIM(s.ExLibArt))
        ELSE N''
      END AS description,
      s.Marque AS brand
    FROM dbo.SB_CartItems c
    INNER JOIN dbo.TabStocksaico s ON s.IDArt = c.ProductId
    WHERE c.CustomerId = @customerId
    ORDER BY c.Id
`;

// Products from the customer's latest validated baskets.
export const VALIDATED_HISTORY_SQL = `
    SELECT
      i.ProductId AS id,
      COALESCE(NULLIF(LTRIM(RTRIM(s.LibArt)), N''), i.ProductNameSnapshot) AS name,
      s.LibFam AS family,
      CASE
        WHEN s.ExLibArtWeb IS NOT NULL AND LTRIM(RTRIM(s.ExLibArtWeb)) <> N''
          THEN LTRIM(RTRIM(s.ExLibArtWeb))
        WHEN s.ExLibArt IS NOT NULL AND LTRIM(RTRIM(s.ExLibArt)) <> N''
          THEN LTRIM(RTRIM(s.ExLibArt))
        ELSE N''
      END AS description,
      s.Marque AS brand
    FROM dbo.SB_SmartBasketItems i
    INNER JOIN dbo.SB_SmartBasketSessions sess
      ON sess.Id = i.SessionId
    LEFT JOIN dbo.TabStocksaico s ON s.IDArt = i.ProductId
    WHERE sess.CustomerId = @customerId
      AND sess.Status = N'validated'
      AND sess.Id IN (
        SELECT TOP (@sessionLimit) innerSess.Id
        FROM dbo.SB_SmartBasketSessions innerSess
        WHERE innerSess.CustomerId = @customerId
          AND innerSess.Status = N'validated'
        ORDER BY innerSess.ValidatedAt DESC, innerSess.Id DESC
      )
    ORDER BY sess.ValidatedAt DESC, sess.Id DESC, i.Id ASC
`;

export function isValidatedHistoryStatus(status) {
  return String(status ?? '').trim().toLowerCase() === VALIDATED_HISTORY_STATUS;
}

// Validate a customer id (positive integer).
export function assertOwnedCustomerId(customerId) {
  if (typeof customerId === 'number') {
    if (!Number.isInteger(customerId) || customerId <= 0) {
      throw new AppError('Please sign in to continue.', 401);
    }
    return customerId;
  }
  const raw = String(customerId ?? '').trim();
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new AppError('Please sign in to continue.', 401);
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError('Please sign in to continue.', 401);
  }
  return parsed;
}

function wrapEvidenceFailure(err) {
  if (err instanceof AppError) return err;
  return new AppError(EVIDENCE_UNAVAILABLE, 503);
}

function coerceField(value) {
  if (value == null) return '';
  return String(value).trim();
}

// Upper safety bound for a trusted current-basket line quantity.
export const MAX_EVIDENCE_BASKET_QUANTITY = 100_000;

// Parse a basket-line quantity into a positive integer, or null if untrusted.
export function parseEvidenceBasketQuantity(raw) {
  let n;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw)) {
    n = Number(raw);
  } else {
    return null;
  }
  if (!Number.isInteger(n) || n < 1 || n > MAX_EVIDENCE_BASKET_QUANTITY) return null;
  return n;
}

export function mapEvidenceProduct(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const idRaw = raw.id ?? raw.productId ?? raw.ProductId ?? raw.IDArt;
  if (idRaw == null || String(idRaw).trim() === '') return null;
  return {
    id: String(idRaw).trim(),
    name: coerceField(raw.name ?? raw.productName ?? raw.productNameSnapshot ?? raw.LibArt),
    family: coerceField(raw.family ?? raw.familyName ?? raw.category ?? raw.LibFam),
    description: coerceField(raw.description),
    brand: coerceField(raw.brand ?? raw.Marque),
    // Trusted positive integer, or null when missing / untrusted.
    basketQuantity: parseEvidenceBasketQuantity(raw.basketQuantity ?? raw.Quantity ?? raw.quantity),
  };
}

function mapEvidenceRows(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    const mapped = mapEvidenceProduct(row);
    if (mapped) out.push(mapped);
  }
  return out;
}

function clampCatalogueLimit(limit) {
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1) return RECOMMENDATION_CATALOGUE_DEFAULT_LIMIT;
  return Math.min(n, RECOMMENDATION_CATALOGUE_MAX_LIMIT);
}

function customerIdInput(customerId) {
  return { name: 'customerId', type: sql.Int, value: customerId };
}

// executeReadOnlyQuery: (text: string, inputs?: object[]) => Promise<unknown>, getProducts: (filters?: object) => Promise<{ products?: unknown[] }>, }} deps
export function createRecommendationEvidenceAdapter(deps) {
  if (!deps || typeof deps.executeReadOnlyQuery !== 'function') {
    throw new TypeError('createRecommendationEvidenceAdapter: executeReadOnlyQuery is required.');
  }
  if (typeof deps.getProducts !== 'function') {
    throw new TypeError('createRecommendationEvidenceAdapter: getProducts is required.');
  }
  const query = deps.executeReadOnlyQuery;
  const listProducts = deps.getProducts;

  async function loadCurrentBasketProducts(customerId) {
    const ownedId = assertOwnedCustomerId(customerId);
    let rows;
    try {
      rows = await query(CURRENT_BASKET_SQL, [customerIdInput(ownedId)]);
    } catch (err) {
      throw wrapEvidenceFailure(err);
    }
    return mapEvidenceRows(rows);
  }

  async function loadValidatedHistoryProducts(customerId) {
    const ownedId = assertOwnedCustomerId(customerId);
    let rows;
    try {
      rows = await query(VALIDATED_HISTORY_SQL, [
        customerIdInput(ownedId),
        { name: 'sessionLimit', type: sql.Int, value: RECOMMENDATION_HISTORY_SESSION_LIMIT },
      ]);
    } catch (err) {
      throw wrapEvidenceFailure(err);
    }
    return mapEvidenceRows(rows);
  }

  async function loadCatalogueProductsForLinking(limit) {
    const capped = clampCatalogueLimit(limit);
    let page;
    try {
      // Only curated, recipe-eligible food products can be linked.
      page = await listProducts({
        limit: capped,
        offset: 0,
        sort: 'name_asc',
        recipeEligibleOnly: true,
      });
    } catch (err) {
      throw wrapEvidenceFailure(err);
    }
    const products = Array.isArray(page?.products) ? page.products : [];
    return mapEvidenceRows(products).slice(0, capped);
  }

  async function loadEvidence(customerId, options = {}) {
    const ownedId = assertOwnedCustomerId(customerId);
    const [basketProducts, historyProducts, catalogueProducts] = await Promise.all([
      loadCurrentBasketProducts(ownedId),
      loadValidatedHistoryProducts(ownedId),
      loadCatalogueProductsForLinking(options.catalogueLimit),
    ]);
    return { basketProducts, historyProducts, catalogueProducts };
  }

  return {
    loadCurrentBasketProducts,
    loadValidatedHistoryProducts,
    loadCatalogueProductsForLinking,
    loadEvidence,
  };
}
