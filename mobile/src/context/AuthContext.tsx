import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { loginCustomer, registerCustomer, type RegisterPayload } from '../api/customer';
import { mergeGuestCartIfNeeded } from '../api/cart';
import {
  clearCustomer,
  persistCustomer,
  readCustomer,
  type CustomerSession,
} from '../lib/storage';

type AuthContextValue = {
  customer: CustomerSession | null;
  loading: boolean;
  // Bumps on every account change, so a previous account's results are ignored.
  accountGeneration: number;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshFromStorage: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<CustomerSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountGeneration, setAccountGeneration] = useState(1);
  const seenIdRef = useRef<{ ready: boolean; id: number | null }>({ ready: false, id: null });

  const refreshFromStorage = useCallback(async () => {
    const c = await readCustomer();
    setCustomer(c);
  }, []);

  useEffect(() => {
    (async () => {
      await refreshFromStorage();
      setLoading(false);
    })();
  }, [refreshFromStorage]);

  useEffect(() => {
    const id = customer?.id ?? null;
    if (!seenIdRef.current.ready) {
      seenIdRef.current = { ready: true, id };
      return;
    }
    if (seenIdRef.current.id !== id) {
      seenIdRef.current.id = id;
      setAccountGeneration((generation) => generation + 1);
    }
  }, [customer?.id]);

  const login = useCallback(async (email: string, password: string) => {
    const c = await loginCustomer(email, password);
    await persistCustomer(c);
    setCustomer(c);
    await mergeGuestCartIfNeeded();
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const c = await registerCustomer(payload);
    await persistCustomer(c);
    setCustomer(c);
    await mergeGuestCartIfNeeded();
  }, []);

  const logout = useCallback(async () => {
    await clearCustomer();
    setCustomer(null);
  }, []);

  const value = useMemo(
    () => ({
      customer,
      loading,
      accountGeneration,
      login,
      register,
      logout,
      refreshFromStorage,
    }),
    [customer, loading, accountGeneration, login, register, logout, refreshFromStorage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
