// Cashier basket lookup and decision API.

import { handleResponse, staffAuthHeaders, staffFetch } from './http.js';

function encodeToken(token) {
  return encodeURIComponent(String(token ?? '').trim());
}

export async function fetchCashierBasketByToken(token) {
  const res = await staffFetch(`/api/admin/cashier/basket/${encodeToken(token)}`, {
    credentials: 'include',
    headers: staffAuthHeaders(),
  });
  return handleResponse(res);
}

export async function validateCashierBasket(token) {
  const res = await staffFetch(`/api/admin/cashier/basket/${encodeToken(token)}/validate`, {
    method: 'POST',
    credentials: 'include',
    headers: staffAuthHeaders(),
  });
  return handleResponse(res);
}

export async function rejectCashierBasket(token, notes) {
  const res = await staffFetch(`/api/admin/cashier/basket/${encodeToken(token)}/reject`, {
    method: 'POST',
    credentials: 'include',
    headers: staffAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ notes: notes || null }),
  });
  return handleResponse(res);
}
