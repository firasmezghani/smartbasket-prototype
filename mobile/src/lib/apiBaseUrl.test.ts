import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANDROID_EMULATOR_API_BASE_URL,
  LOCALHOST_API_BASE_URL,
  normalizeApiBaseUrl,
  resolveApiBaseUrl,
} from './apiBaseUrl';

// These tests use fixed, made-up addresses only. They must not depend on the
// machine's current LAN IP.

test('dev fallback constants are the documented loopback addresses', () => {
  assert.equal(LOCALHOST_API_BASE_URL, 'http://127.0.0.1:3001');
  assert.equal(ANDROID_EMULATOR_API_BASE_URL, 'http://10.0.2.2:3001');
});

test('normalizeApiBaseUrl: trims whitespace and strips trailing slashes', () => {
  assert.deepEqual(normalizeApiBaseUrl('  http://192.168.1.100:3001/  '), {
    ok: true,
    url: 'http://192.168.1.100:3001',
  });
  assert.deepEqual(normalizeApiBaseUrl('http://192.168.1.100:3001///'), {
    ok: true,
    url: 'http://192.168.1.100:3001',
  });
});

test('normalizeApiBaseUrl: keeps a path prefix but not its trailing slash', () => {
  assert.deepEqual(normalizeApiBaseUrl('https://example.test/api/'), {
    ok: true,
    url: 'https://example.test/api',
  });
});

test('normalizeApiBaseUrl: lowercases the host, keeps the port', () => {
  assert.deepEqual(normalizeApiBaseUrl('http://LAPTOP.local:3001'), {
    ok: true,
    url: 'http://laptop.local:3001',
  });
});

test('normalizeApiBaseUrl: drops query string and fragment', () => {
  assert.deepEqual(normalizeApiBaseUrl('http://10.0.0.5:3001/?x=1#frag'), {
    ok: true,
    url: 'http://10.0.0.5:3001',
  });
});

test('normalizeApiBaseUrl: accepts only http/https schemes', () => {
  for (const bad of ['ftp://host:3001', 'ws://host:3001', 'file:///x', 'http:/host']) {
    assert.equal(normalizeApiBaseUrl(bad).ok, false, bad);
  }
  assert.equal(normalizeApiBaseUrl('HTTP://Host:3001').ok, true);
  assert.equal(normalizeApiBaseUrl('HTTPS://Host:3001').ok, true);
});

test('normalizeApiBaseUrl: rejects a bare host with no scheme', () => {
  assert.equal(normalizeApiBaseUrl('192.168.1.100:3001').ok, false);
  assert.equal(normalizeApiBaseUrl('//192.168.1.100:3001').ok, false);
});

test('normalizeApiBaseUrl: rejects embedded credentials', () => {
  const r = normalizeApiBaseUrl('http://user:pass@192.168.1.100:3001');
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /credential/i);
  assert.equal(normalizeApiBaseUrl('http://user@192.168.1.100:3001').ok, false);
});

test('normalizeApiBaseUrl: rejects empty / non-string / unparseable input', () => {
  assert.equal(normalizeApiBaseUrl('').ok, false);
  assert.equal(normalizeApiBaseUrl('   ').ok, false);
  assert.equal(normalizeApiBaseUrl(null).ok, false);
  assert.equal(normalizeApiBaseUrl(undefined).ok, false);
  assert.equal(normalizeApiBaseUrl(42).ok, false);
  assert.equal(normalizeApiBaseUrl('http://').ok, false);
});

test('resolveApiBaseUrl: a valid env value wins and is normalised', () => {
  const r = resolveApiBaseUrl({ envValue: ' http://192.168.1.50:3001/ ', platformOS: 'ios' });
  assert.deepEqual(r, { url: 'http://192.168.1.50:3001', source: 'env', warning: null });
});

test('resolveApiBaseUrl: env wins even on Android', () => {
  const r = resolveApiBaseUrl({ envValue: 'https://api.example.test', platformOS: 'android' });
  assert.equal(r.url, 'https://api.example.test');
  assert.equal(r.source, 'env');
});

test('resolveApiBaseUrl: an explicitly set but invalid env value throws a clear dev error', () => {
  assert.throws(
    () => resolveApiBaseUrl({ envValue: 'http://user:pass@host:3001', platformOS: 'ios' }),
    /EXPO_PUBLIC_API_BASE_URL is set but invalid/,
  );
  assert.throws(
    () => resolveApiBaseUrl({ envValue: 'not-a-url', platformOS: 'android' }),
    /EXPO_PUBLIC_API_BASE_URL is set but invalid/,
  );
});

test('resolveApiBaseUrl: no env on Android -> emulator fallback with a warning', () => {
  const r = resolveApiBaseUrl({ envValue: undefined, platformOS: 'android' });
  assert.equal(r.url, ANDROID_EMULATOR_API_BASE_URL);
  assert.equal(r.source, 'android-emulator');
  assert.match(r.warning ?? '', /physical device/i);
});

test('resolveApiBaseUrl: no env on iOS / web / unknown -> localhost fallback with a warning', () => {
  for (const platformOS of ['ios', 'web', undefined, '']) {
    const r = resolveApiBaseUrl({ envValue: '', platformOS });
    assert.equal(r.url, LOCALHOST_API_BASE_URL, String(platformOS));
    assert.equal(r.source, 'localhost');
    assert.match(r.warning ?? '', /EXPO_PUBLIC_API_BASE_URL is not set/);
  }
});

test('resolveApiBaseUrl: whitespace-only env is treated as unset (no throw)', () => {
  const r = resolveApiBaseUrl({ envValue: '   ', platformOS: 'ios' });
  assert.equal(r.source, 'localhost');
});
