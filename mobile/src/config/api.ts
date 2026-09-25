// API address. A real phone needs EXPO_PUBLIC_API_BASE_URL; simulators use localhost.
import { resolveApiBaseUrl } from '../lib/apiBaseUrl';

const resolution = resolveApiBaseUrl({
  envValue: process.env.EXPO_PUBLIC_API_BASE_URL,
  platformOS: process.env.EXPO_OS,
});

// Log one line when a development fallback is used, and only inside Expo.
if (resolution.warning && typeof process.env.EXPO_OS === 'string') {
  // eslint-disable-next-line no-console
  console.warn(`[SmartBasket] ${resolution.warning}`);
}

// The resolved, normalised backend base URL (no trailing slash).
export const API_BASE_URL: string = resolution.url;
