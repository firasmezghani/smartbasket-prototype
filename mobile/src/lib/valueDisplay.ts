import { getGlobalLanguage, translate } from '../i18n/translations';

// Shown when a line or estimated total is not priced in the catalogue.
export function getPriceInStoreLabel(): string {
  return translate('price.inStore', getGlobalLanguage());
}

// Format a positive amount as TND with three decimal places.
export function formatTnd(value: unknown): string {
  const n = Number(value);
  return `${n.toFixed(3)} TND`;
}

export function formatMoneyOrUnavailable(v: unknown): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) {
    return getPriceInStoreLabel();
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return getPriceInStoreLabel();
  return formatTnd(n);
}

export function formatEstimatedValue(subtotal: unknown): string {
  const m = formatMoneyOrUnavailable(subtotal);
  const inStore = getPriceInStoreLabel();
  return m === inStore ? translate('price.toBeConfirmed', getGlobalLanguage()) : m;
}

export function formatDateTime(value: unknown): string {
  if (!value) return '—';
  try {
    return new Date(String(value)).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return String(value);
  }
}
