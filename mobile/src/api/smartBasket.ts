import { getCartIdentityHeaders } from './cart';
import { apiUrl, handleResponse } from './http';

export type SmartBasketSessionItem = {
  id: number;
  sessionId: number;
  productId: string;
  productNameSnapshot: string;
  barcodeSnapshot: string | null;
  quantity: number;
  unitPriceSnapshot: number | null;
  createdAt: string;
};

export type SmartBasketSession = {
  id: number;
  customerId: number;
  status: string;
  expiresAt: string;
  createdAt: string;
  validatedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  validationNote: string | null;
  items?: SmartBasketSessionItem[];
  itemCount?: number;
  uniqueProductCount?: number;
  superseded?: boolean;
  newerSessionId?: number | null;
};

export type CreateQrSessionResult = {
  sessionId: number;
  token: string;
  expiresAt: string;
  itemCount: number;
  uniqueProductCount: number;
  status: string;
  qrValue?: string;
};

export async function createQrSession(): Promise<CreateQrSessionResult> {
  const res = await fetch(apiUrl('/api/smart-basket/session/qr'), {
    method: 'POST',
    headers: await getCartIdentityHeaders(),
  });
  const body = await handleResponse<{ data: CreateQrSessionResult }>(res);
  return body.data;
}

export async function fetchSmartBasketSession(sessionId: number): Promise<SmartBasketSession> {
  const id = Number(sessionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Invalid session id.');
  }
  const res = await fetch(apiUrl(`/api/smart-basket/session/${id}`), {
    headers: await getCartIdentityHeaders(),
  });
  const body = await handleResponse<{ data: SmartBasketSession }>(res);
  return body.data;
}

export async function cancelSmartBasketSession(sessionId: number): Promise<SmartBasketSession> {
  const res = await fetch(apiUrl(`/api/smart-basket/session/${sessionId}/cancel`), {
    method: 'POST',
    headers: await getCartIdentityHeaders(),
  });
  const body = await handleResponse<{ data: SmartBasketSession }>(res);
  return body.data;
}
