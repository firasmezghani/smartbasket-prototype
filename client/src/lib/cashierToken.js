// Cleans a basket code from the camera, a paste or a scanner (trims it and removes the prefix).

export const SMART_BASKET_QR_PREFIX = 'SMART_BASKET:';

// token without the prefix, or '' if there is none
export function normalizeCashierToken(raw) {
  let value = String(raw ?? '').trim();
  if (!value) return '';
  if (value.toUpperCase().startsWith(SMART_BASKET_QR_PREFIX)) {
    value = value.slice(SMART_BASKET_QR_PREFIX.length).trim();
  }
  return value;
}
