import { getCustomerIdentityHeaders } from './customerIdentity';
import { apiUrl, handleResponse } from './http';
import type { PurchaseHistoryDetail, PurchaseHistorySummary } from '../types/purchaseHistory';
import { getGlobalLanguage, translate } from '../i18n/translations';

export async function fetchPurchaseHistory(): Promise<PurchaseHistorySummary[]> {
  const headers = await getCustomerIdentityHeaders();
  if (!headers['x-customer-id']) {
    throw new Error(translate('errors.signInRequired', getGlobalLanguage()));
  }
  const res = await fetch(apiUrl('/api/purchase-history'), { headers });
  const body = await handleResponse<{ data: PurchaseHistorySummary[] }>(res);
  return Array.isArray(body.data) ? body.data : [];
}

export async function fetchPurchaseHistoryDetail(
  recordId: string,
): Promise<PurchaseHistoryDetail> {
  const headers = await getCustomerIdentityHeaders();
  if (!headers['x-customer-id']) {
    throw new Error(translate('errors.signInRequired', getGlobalLanguage()));
  }
  const res = await fetch(
    apiUrl(`/api/purchase-history/${encodeURIComponent(recordId)}`),
    { headers },
  );
  const body = await handleResponse<{ data: PurchaseHistoryDetail }>(res);
  return body.data;
}
