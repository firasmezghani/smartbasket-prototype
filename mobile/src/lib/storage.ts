import AsyncStorage from '@react-native-async-storage/async-storage';

const CUSTOMER_USER_KEY = 'customerUser';
const CART_SESSION_KEY = 'cartSessionId';

export type CustomerSession = {
  id: number;
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
};

export async function readCustomer(): Promise<CustomerSession | null> {
  const raw = await AsyncStorage.getItem(CUSTOMER_USER_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as CustomerSession;
    const id = Number(o?.id);
    if (Number.isInteger(id) && id > 0) return { ...o, id };
  } catch {
    // ignore
  }
  return null;
}

export async function persistCustomer(customer: CustomerSession | null): Promise<void> {
  if (!customer?.id) {
    await clearCustomer();
    return;
  }
  await AsyncStorage.setItem(CUSTOMER_USER_KEY, JSON.stringify(customer));
}

export async function clearCustomer(): Promise<void> {
  await AsyncStorage.removeItem(CUSTOMER_USER_KEY);
}

const SESSION_ID_REGEX = /^[a-zA-Z0-9-]{1,100}$/;

export async function getOrCreateCartSessionId(): Promise<string> {
  const existing = await AsyncStorage.getItem(CART_SESSION_KEY);
  if (existing && SESSION_ID_REGEX.test(existing)) return existing;
  const id =
    typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  const trimmed = id.length > 100 ? id.slice(0, 100) : id;
  await AsyncStorage.setItem(CART_SESSION_KEY, trimmed);
  return trimmed;
}

export async function readCartSessionId(): Promise<string | null> {
  const v = await AsyncStorage.getItem(CART_SESSION_KEY);
  return v && SESSION_ID_REGEX.test(v) ? v : null;
}
