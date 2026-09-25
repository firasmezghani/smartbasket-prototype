// Works out how long a basket has been idle, so the app can offer Resume or Start new.

// A basket is stale after 24 hours without changes.
export const STALE_BASKET_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// Parse a timestamp to milliseconds, or null if invalid.
function toEpochMs(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const t = new Date(trimmed).getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

// Latest cart-line activity (updatedAt or createdAt) as an ISO string, or null.
export function resolveLastActivityAt(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  let latest = null;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const created = toEpochMs(item.createdAt);
    const updated = toEpochMs(item.updatedAt);
    const lineLatest =
      created != null && updated != null
        ? Math.max(created, updated)
        : created ?? updated;
    if (lineLatest == null) continue;
    if (latest == null || lineLatest > latest) latest = lineLatest;
  }
  return latest == null ? null : new Date(latest).toISOString();
}

// Basket age in milliseconds, or null without a valid timestamp (never negative).
export function basketAgeMs({ lastActivityAt, now = Date.now() } = {}) {
  const t = toEpochMs(lastActivityAt);
  if (t == null) return null;
  const age = now - t;
  return age < 0 ? 0 : age;
}

// Whether the basket is stale. Missing timestamps count as not stale.
export function isBasketStale({
  lastActivityAt,
  now = Date.now(),
  thresholdMs = STALE_BASKET_THRESHOLD_MS,
} = {}) {
  const age = basketAgeMs({ lastActivityAt, now });
  if (age == null) return false;
  const limit = Number.isFinite(thresholdMs) && thresholdMs > 0 ? thresholdMs : STALE_BASKET_THRESHOLD_MS;
  return age >= limit;
}

// Activity fields returned with the cart (last activity, server time, stale flag).
export function summariseBasketActivity(items, { now = Date.now(), thresholdMs = STALE_BASKET_THRESHOLD_MS } = {}) {
  const lastActivityAt = resolveLastActivityAt(items);
  return {
    lastActivityAt,
    serverTime: new Date(now).toISOString(),
    stale: isBasketStale({ lastActivityAt, now, thresholdMs }),
    staleThresholdMs: Number.isFinite(thresholdMs) && thresholdMs > 0 ? thresholdMs : STALE_BASKET_THRESHOLD_MS,
  };
}
