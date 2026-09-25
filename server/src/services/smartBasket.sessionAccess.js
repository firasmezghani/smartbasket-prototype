// Helpers for reading a customer's own smart-basket session.

export function parsePositiveSessionId(raw) {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw).trim();
  if (!/^[1-9]\d{0,9}$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function sessionRowOwnedByCustomer(row, customerId) {
  if (!row || typeof row !== 'object') return false;
  const owner = Number(row.customerId ?? row.CustomerId);
  const cid = Number(customerId);
  return Number.isInteger(owner) && Number.isInteger(cid) && owner === cid && cid > 0;
}

// Flag a cancelled session that a newer QR code replaced.
export function describeSessionSuperseded({ status, sessionId, newerSessionId }) {
  const newer = Number(newerSessionId);
  const id = Number(sessionId);
  const superseded =
    String(status ?? '').toLowerCase() === 'cancelled' &&
    Number.isInteger(newer) &&
    Number.isInteger(id) &&
    newer > id;
  return {
    superseded,
    newerSessionId: superseded ? newer : null,
  };
}

export function countSessionUnitsAndProducts(items) {
  const list = Array.isArray(items) ? items : [];
  const ids = new Set();
  let itemCount = 0;
  for (const item of list) {
    itemCount += Number(item?.quantity) || 0;
    const id = String(item?.productId ?? '').trim();
    if (id) ids.add(id.toLowerCase());
  }
  return { itemCount, uniqueProductCount: ids.size };
}
