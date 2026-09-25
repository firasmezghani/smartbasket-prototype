import type { Cart } from '../types/cart';
import {
  getOrCreateCartSessionId,
  readCartSessionId,
  readCustomer,
} from '../lib/storage';
import { apiUrl, handleResponse } from './http';

const SESSION_ID_REGEX = /^[a-zA-Z0-9-]{1,100}$/;

export async function getCartIdentityHeaders(): Promise<Record<string, string>> {
  const customer = await readCustomer();
  if (customer?.id) {
    return { 'x-customer-id': String(customer.id) };
  }
  const sessionId = await getOrCreateCartSessionId();
  return { 'x-cart-session-id': sessionId };
}

function parseCart(data: unknown): Cart {
  const o = data && typeof data === 'object' ? (data as Cart) : null;
  return {
    items: Array.isArray(o?.items) ? o.items : [],
    totalQuantity: Number(o?.totalQuantity) || 0,
    grandTotal: Number(o?.grandTotal) || 0,
    lastActivityAt: typeof o?.lastActivityAt === 'string' ? o.lastActivityAt : null,
    serverTime: typeof o?.serverTime === 'string' ? o.serverTime : null,
    stale: o?.stale === true,
    staleThresholdMs:
      typeof o?.staleThresholdMs === 'number' && Number.isFinite(o.staleThresholdMs)
        ? o.staleThresholdMs
        : null,
  };
}

export async function fetchCart(): Promise<Cart> {
  const res = await fetch(apiUrl('/api/cart'), {
    headers: await getCartIdentityHeaders(),
  });
  const body = await handleResponse<{ data: Cart }>(res);
  return parseCart(body.data);
}

export async function addCartItem(productId: string, quantity = 1): Promise<Cart> {
  const res = await fetch(apiUrl('/api/cart/items'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await getCartIdentityHeaders()),
    },
    body: JSON.stringify({ productId, quantity }),
  });
  const body = await handleResponse<{ data: Cart }>(res);
  return parseCart(body.data);
}

export async function updateCartItem(itemId: number | string, quantity: number): Promise<Cart> {
  const res = await fetch(apiUrl(`/api/cart/items/${encodeURIComponent(String(itemId))}`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await getCartIdentityHeaders()),
    },
    body: JSON.stringify({ quantity }),
  });
  const body = await handleResponse<{ data: Cart }>(res);
  return parseCart(body.data);
}

export async function removeCartItem(itemId: number | string): Promise<Cart> {
  const res = await fetch(apiUrl(`/api/cart/items/${encodeURIComponent(String(itemId))}`), {
    method: 'DELETE',
    headers: await getCartIdentityHeaders(),
  });
  const body = await handleResponse<{ data: Cart }>(res);
  return parseCart(body.data);
}

// Empty the basket (used by "Start new basket").
export async function clearCart(): Promise<Cart> {
  const res = await fetch(apiUrl('/api/cart'), {
    method: 'DELETE',
    headers: await getCartIdentityHeaders(),
  });
  const body = await handleResponse<{ data: Cart }>(res);
  return parseCart(body.data);
}

export async function mergeGuestCartFromSession(sessionId: string): Promise<Cart> {
  const res = await fetch(apiUrl('/api/cart/merge-from-session'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await getCartIdentityHeaders()),
    },
    body: JSON.stringify({ sessionId }),
  });
  const body = await handleResponse<{ data: Cart }>(res);
  return parseCart(body.data);
}

// After login: merge guest cart if a session id existed.
export async function mergeGuestCartIfNeeded(): Promise<Cart | null> {
  const sessionId = await readCartSessionId();
  if (!sessionId || !SESSION_ID_REGEX.test(sessionId)) return null;
  const customer = await readCustomer();
  if (!customer?.id) return null;
  return mergeGuestCartFromSession(sessionId);
}
