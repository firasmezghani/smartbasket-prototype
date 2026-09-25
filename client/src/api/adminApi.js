// Calls to the admin API. The server checks the ADMIN role on every request.

import { handleResponse, staffAuthHeaders, staffFetch } from './http.js';

export async function fetchAdminAppConfig() {
  const res = await staffFetch('/api/admin/app-config', {
    credentials: 'include',
    headers: staffAuthHeaders(),
  });
  return handleResponse(res);
}

export async function updateMaxBasketQuantity(value) {
  const res = await staffFetch('/api/admin/app-config/max-basket-quantity', {
    method: 'PUT',
    credentials: 'include',
    headers: staffAuthHeaders(),
    body: JSON.stringify({ value }),
  });
  return handleResponse(res);
}
