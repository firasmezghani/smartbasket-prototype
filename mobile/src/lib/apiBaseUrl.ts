// Checks and normalises the backend address. config/api.ts supplies the real values.

// iOS simulator / web dev fallback. `localhost` on the host machine.
export const LOCALHOST_API_BASE_URL = 'http://127.0.0.1:3001';

// Android emulator address for the host computer.
export const ANDROID_EMULATOR_API_BASE_URL = 'http://10.0.2.2:3001';

export type ApiBaseUrlNormalisation =
  | { ok: true; url: string }
  | { ok: false; error: string };

// Normalise a base URL: trim, drop trailing slashes, query and fragment, and
// require http(s) with a host and no embedded credentials.
export function normalizeApiBaseUrl(raw: unknown): ApiBaseUrlNormalisation {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'must be a string' };
  }
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed === '') {
    return { ok: false, error: 'is empty' };
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, error: 'must start with http:// or https://' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'is not a valid URL' };
  }

  if (parsed.username !== '' || parsed.password !== '') {
    return { ok: false, error: 'must not contain credentials (user:pass@)' };
  }
  if (parsed.hostname === '') {
    return { ok: false, error: 'has no host' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'must start with http:// or https://' };
  }

  const path = parsed.pathname.replace(/\/+$/, '');
  return { ok: true, url: `${parsed.protocol}//${parsed.host}${path}` };
}

export type ApiBaseUrlSource = 'env' | 'android-emulator' | 'localhost';

export type ApiBaseUrlResolution = {
  url: string;
  source: ApiBaseUrlSource;
  // A one-line note when a development fallback is used, otherwise null.
  warning: string | null;
};

const PHYSICAL_DEVICE_HINT =
  'A physical device cannot reach a fallback loopback address — set ' +
  'EXPO_PUBLIC_API_BASE_URL to the computer’s current LAN address ' +
  '(see mobile/.env.example) and restart Expo.';

// Choose the base URL: `EXPO_PUBLIC_API_BASE_URL` if set (throws if invalid),
// otherwise the simulator or emulator address for development.
export function resolveApiBaseUrl(input: {
  envValue?: string | null | undefined;
  platformOS?: string | null | undefined;
}): ApiBaseUrlResolution {
  const envRaw = typeof input.envValue === 'string' ? input.envValue.trim() : '';
  if (envRaw !== '') {
    const normalised = normalizeApiBaseUrl(envRaw);
    if (!normalised.ok) {
      throw new Error(
        `EXPO_PUBLIC_API_BASE_URL is set but invalid: it ${normalised.error}. ` +
          'Expected e.g. http://192.168.1.100:3001 — http(s) only, no trailing ' +
          'slash, no user:pass@, no secrets.',
      );
    }
    return { url: normalised.url, source: 'env', warning: null };
  }

  const os = typeof input.platformOS === 'string' ? input.platformOS.trim().toLowerCase() : '';
  if (os === 'android') {
    return {
      url: ANDROID_EMULATOR_API_BASE_URL,
      source: 'android-emulator',
      warning:
        `EXPO_PUBLIC_API_BASE_URL is not set; using the Android emulator ` +
        `fallback ${ANDROID_EMULATOR_API_BASE_URL}. ${PHYSICAL_DEVICE_HINT}`,
    };
  }
  return {
    url: LOCALHOST_API_BASE_URL,
    source: 'localhost',
    warning:
      `EXPO_PUBLIC_API_BASE_URL is not set; using the iOS simulator / web ` +
      `fallback ${LOCALHOST_API_BASE_URL}. ${PHYSICAL_DEVICE_HINT}`,
  };
}
