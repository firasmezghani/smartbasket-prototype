import { getGlobalLanguage, translate } from '../i18n/translations';
import { colors } from '../theme/colors';
import type { PurchaseHistoryType } from '../types/purchaseHistory';
import { formatDateTime, formatEstimatedValue } from './valueDisplay';

export function getPurchaseSourceLabel(fallback?: string): string {
  if (fallback?.trim()) return fallback;
  return translate('purchase.sourceSmartBasket', getGlobalLanguage());
}

export function getPurchaseStatusLabel(_type: PurchaseHistoryType, status: unknown): string {
  const s = String(status ?? '').trim().toLowerCase();
  if (s === 'validated') return translate('purchase.statusValidated', getGlobalLanguage());
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : translate('purchase.statusValidated', getGlobalLanguage());
}

export function getPurchaseStatusColors(
  _type: PurchaseHistoryType,
  status: unknown,
): { bg: string; text: string } {
  const s = String(status ?? '').trim().toLowerCase();
  if (s === 'validated') {
    return { bg: '#d1fae5', text: colors.success };
  }
  return { bg: colors.primaryLight, text: colors.primaryDark };
}

export function formatPurchaseAmount(
  _type: PurchaseHistoryType,
  _total: number | null | undefined,
  estimatedTotal: number | null | undefined,
): string {
  return formatEstimatedValue(estimatedTotal);
}

export function formatPurchaseListTitle(item: {
  type: PurchaseHistoryType;
  id: string;
  summary?: string;
}): string {
  const num = item.id.replace(/^smart-basket-/i, '');
  return translate('purchase.smartBasketNumber', getGlobalLanguage(), { id: num });
}

export { formatDateTime as formatPurchaseDateTime };
