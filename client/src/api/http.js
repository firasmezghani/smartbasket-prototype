// Shared helpers for the staff console API calls.

export const STAFF_TOKEN_KEY = 'staffToken';

export function staffAuthHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  const token =
    typeof localStorage !== 'undefined'
      ? String(localStorage.getItem(STAFF_TOKEN_KEY) ?? '').trim()
      : '';
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

const OFFLINE_MESSAGE = 'Cannot reach the server.';

// fetch() that reports a network failure with a plain message.
export async function staffFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }
}

export async function handleResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // No message body on a 5xx usually means the dev proxy could not reach the API.
    const fallback = res.status >= 500 ? OFFLINE_MESSAGE : res.statusText || 'Request failed';
    const msg = data.message || data.error || fallback;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data.code || null;
    err.details = data.details || null;
    throw err;
  }
  return data;
}
