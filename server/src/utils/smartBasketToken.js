import { createHash, randomBytes } from 'crypto';

export const SMART_BASKET_QR_PREFIX = 'SMART_BASKET:';

const TOKEN_BYTES = 32;

export function hashSmartBasketToken(plainToken) {
  return createHash('sha256').update(String(plainToken), 'utf8').digest('hex');
}

export function generateSmartBasketToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function formatSmartBasketQrValue(plainToken) {
  return `${SMART_BASKET_QR_PREFIX}${plainToken}`;
}

// Accept a raw token or `SMART_BASKET:<token>` from a QR scan or manual entry.
export function normalizeSmartBasketTokenInput(raw) {
  let value = String(raw ?? '').trim();
  if (!value) return '';
  try {
    value = decodeURIComponent(value);
  } catch {
    // use raw
  }
  const upper = value.toUpperCase();
  const prefix = SMART_BASKET_QR_PREFIX.toUpperCase();
  if (upper.startsWith(prefix)) {
    return value.slice(SMART_BASKET_QR_PREFIX.length).trim();
  }
  return value;
}
