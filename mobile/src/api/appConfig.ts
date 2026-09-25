import { apiUrl, handleResponse } from './http';
import { parseAppConfig, type AppConfig } from '../lib/appConfig';

// Get the public settings (the caller keeps the cached value on error).
export async function fetchAppConfig(): Promise<AppConfig> {
  const res = await fetch(apiUrl('/api/app-config'));
  const body = await handleResponse<Record<string, unknown>>(res);
  return parseAppConfig(body);
}
