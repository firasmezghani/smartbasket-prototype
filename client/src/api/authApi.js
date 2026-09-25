// Staff login API.

import { handleResponse, staffFetch } from './http.js';

export async function login(username, password) {
  const res = await staffFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  });
  return handleResponse(res);
}
