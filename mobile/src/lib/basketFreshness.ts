// Checks if the basket has been idle long enough to offer Resume or Start new.

// Mirror of the server default (`STALE_BASKET_THRESHOLD_MS`).
export const STALE_BASKET_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function toEpochMs(value: unknown): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const t = new Date(trimmed).getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

export type BasketFreshnessInput = {
  // The server's answer; used first when present.
  stale?: boolean | null;
  // ISO timestamp of the latest cart-line activity (server-derived).
  lastActivityAt?: string | null;
  // Local clock, only used for the fallback path. Defaults to `Date.now()`.
  now?: number;
  thresholdMs?: number;
};

// Server verdict first, then the timestamp; missing data is never stale.
export function isStaleBasket({
  stale,
  lastActivityAt,
  now = Date.now(),
  thresholdMs = STALE_BASKET_THRESHOLD_MS,
}: BasketFreshnessInput = {}): boolean {
  if (typeof stale === 'boolean') return stale;
  const t = toEpochMs(lastActivityAt);
  if (t == null) return false;
  const age = now - t;
  if (age < 0) return false;
  const limit =
    Number.isFinite(thresholdMs) && (thresholdMs as number) > 0
      ? (thresholdMs as number)
      : STALE_BASKET_THRESHOLD_MS;
  return age >= limit;
}
