// Preview of the latest validated basket on the Account screen.

import type { PurchaseHistorySummary } from '../types/purchaseHistory';
import { isCurrentAccountScope, type AccountScope } from './accountScope';

export type AccountHistoryPreviewKind = 'hidden' | 'loading' | 'unavailable' | 'empty' | 'ready';

export type AccountHistoryPreview = {
  kind: AccountHistoryPreviewKind;
  latest: PurchaseHistorySummary | null;
};

export function isValidatedHistoryStatus(status: unknown): boolean {
  return String(status ?? '').trim().toLowerCase() === 'validated';
}

function historyTime(row: PurchaseHistorySummary): number {
  const raw = row.completedAt || row.createdAt || '';
  const n = Date.parse(String(raw));
  return Number.isFinite(n) ? n : 0;
}

// Newest cashier-validated basket from the existing history list.
export function pickLatestValidatedBasket(
  records: readonly PurchaseHistorySummary[] | null | undefined,
): PurchaseHistorySummary | null {
  if (!Array.isArray(records) || records.length === 0) return null;
  const validated = records.filter((row) => isValidatedHistoryStatus(row.status));
  if (validated.length === 0) return null;
  return [...validated].sort((a, b) => historyTime(b) - historyTime(a))[0] ?? null;
}

export function accountHistoryPreviewState(opts: {
  signedIn: boolean;
  loading: boolean;
  error?: string | null;
  records: readonly PurchaseHistorySummary[] | null | undefined;
}): AccountHistoryPreview {
  if (!opts.signedIn) return { kind: 'hidden', latest: null };
  const list = Array.isArray(opts.records) ? opts.records : null;
  const hasRows = Boolean(list && list.length > 0);
  if (opts.loading && !hasRows && !opts.error) {
    return { kind: 'loading', latest: null };
  }
  if (opts.error && !hasRows) {
    return { kind: 'unavailable', latest: null };
  }
  if (!list) return { kind: 'unavailable', latest: null };
  const latest = pickLatestValidatedBasket(list);
  if (!latest) return { kind: 'empty', latest: null };
  return { kind: 'ready', latest };
}

// Ignore unmounted, superseded, or other-account history responses.
export function isHistoryResultCurrent(opts: {
  mounted: boolean;
  requestCurrent: boolean;
  started: AccountScope;
  current: AccountScope;
}): boolean {
  if (opts.mounted !== true) return false;
  if (opts.requestCurrent !== true) return false;
  return isCurrentAccountScope(opts.started, opts.current);
}
