import { isSmartBasketLimitError } from './smartBasket';
import { getGlobalLanguage, translate } from '../i18n/translations';

const NETWORK_PATTERNS = [
  'Network request failed',
  'Failed to fetch',
  'Network Error',
  'The Internet connection appears to be offline',
  'Load failed',
  'ECONNREFUSED',
  'ETIMEDOUT',
];

// Map low-level fetch errors to a user-friendly message.
export function friendlyErrorMessage(err: unknown): string {
  if (isSmartBasketLimitError(err)) {
    return err instanceof Error ? err.message : translate('errors.smartBasketLimit', getGlobalLanguage());
  }
  const msg =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const lower = msg.toLowerCase();
  if (NETWORK_PATTERNS.some((p) => lower.includes(p.toLowerCase()))) {
    return translate('errors.serverOffline', getGlobalLanguage());
  }
  return msg.trim() || translate('errors.generic', getGlobalLanguage());
}

// True when an error looks like a dropped/unknown network outcome, not a business rejection.
export function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const lower = msg.toLowerCase();
  return NETWORK_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}
