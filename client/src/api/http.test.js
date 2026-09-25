import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handleResponse, staffFetch } from './http.js';

test('a network failure becomes a plain message', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  try {
    await assert.rejects(staffFetch('/api/x'), { message: 'Cannot reach the server.' });
  } finally {
    globalThis.fetch = original;
  }
});

test('a 5xx without a message body reads as the server being unreachable', async () => {
  const res = new Response('', { status: 502, statusText: 'Bad Gateway' });
  await assert.rejects(handleResponse(res), { message: 'Cannot reach the server.' });
});

test('server error messages are kept', async () => {
  const res = new Response(JSON.stringify({ error: 'Invalid username or password.' }), { status: 401 });
  await assert.rejects(handleResponse(res), { message: 'Invalid username or password.', status: 401 });
});
