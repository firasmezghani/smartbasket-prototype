import { API_BASE_URL } from '../config/api';
import { getGlobalLanguage, translate, type TranslationKey } from '../i18n/translations';

// Server error codes shown to the customer in their language.
const SERVER_ERROR_KEYS: Record<string, TranslationKey> = {
  BASKET_LOCKED: 'errors.basketBusy',
  BASKET_PRODUCT_LIMIT: 'errors.smartBasketLimit',
  CUSTOMER_NOT_FOUND: 'errors.accountNotFound',
  DATABASE_ERROR: 'errors.generic',
  EMAIL_ALREADY_REGISTERED: 'errors.emailTaken',
  INVALID_CART_QUANTITY: 'errors.invalidQuantity',
  INVALID_CREDENTIALS: 'errors.invalidCredentials',
  NOT_IN_CURATED_CATALOGUE: 'errors.barcodeNotInCatalogue',
};

// Translated message for a server error code; unknown codes get the generic message.
export function serverErrorMessage(
  code: string,
  details: Record<string, unknown> | null = null,
): string {
  const lang = getGlobalLanguage();
  if (code === 'BASKET_CAPACITY_EXCEEDED') {
    const max = Number(details?.maxBasketQuantity);
    return Number.isInteger(max) && max > 0
      ? translate('errors.basketCapacity', lang, { max })
      : translate('errors.basketCapacityGeneric', lang);
  }
  return translate(SERVER_ERROR_KEYS[code] ?? 'errors.generic', lang);
}

export class ApiError extends Error {
  status: number;
  // Stable machine-readable code from the server error body, if any (e.g. 'BASKET_CAPACITY_EXCEEDED').
  code: string | null;
  // Small structured payload from the server error body, if any (e.g. `{ maxBasketQuantity: 2 }`).
  details: Record<string, unknown> | null;

  constructor(message: string, status = 0, code: string | null = null, details: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function handleResponse<T = Record<string, unknown>>(res: Response): Promise<T> {
  const data = await parseJson(res);
  if (!res.ok) {
    const code = typeof data.code === 'string' && data.code ? data.code : null;
    const details =
      data.details && typeof data.details === 'object' && !Array.isArray(data.details)
        ? (data.details as Record<string, unknown>)
        : null;
    const msg = code
      ? serverErrorMessage(code, details)
      : (typeof data.message === 'string' && data.message) ||
        (typeof data.error === 'string' && data.error) ||
        res.statusText ||
        'Request failed';
    throw new ApiError(msg, res.status, code, details);
  }
  return data as T;
}

export function apiUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  const rel = path.startsWith('/') ? path : `/${path}`;
  return `${base}${rel}`;
}
