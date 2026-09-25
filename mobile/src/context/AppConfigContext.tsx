import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { fetchAppConfig } from '../api/appConfig';
import {
  DEFAULT_APP_CONFIG,
  DEFAULT_MAX_BASKET_QUANTITY,
  parseAppConfig,
  type AppConfig,
} from '../lib/appConfig';

// Loads the basket limit from the cache, then refreshes it from the server.

const STORAGE_KEY = 'smartBasketAppConfigV1';

type AppConfigContextValue = {
  config: AppConfig;
  // Convenience alias.
  maxBasketQuantity: number;
  ready: boolean;
  refresh: () => Promise<void>;
  // Update the cached limit with a value the server just returned.
  applyAuthoritativeMaxBasketQuantity: (value: number) => Promise<void>;
};

const AppConfigContext = createContext<AppConfigContextValue | null>(null);

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [ready, setReady] = useState(false);

  const persist = useCallback(async (next: AppConfig) => {
    setConfig(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // A failed cache write is non-fatal, the value is still in memory.
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const fresh = await fetchAppConfig();
      await persist(fresh);
    } catch {
      // Keep the current (cached or default) value.
    }
  }, [persist]);

  const applyAuthoritativeMaxBasketQuantity = useCallback(
    async (value: number) => {
      await persist({ maxBasketQuantity: value, maxBasketQuantitySource: 'database' });
    },
    [persist],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && raw) {
          setConfig(parseAppConfig(JSON.parse(raw)));
        }
      } catch {
        // ignore, fall back to default
      }
      await refresh();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const value = useMemo<AppConfigContextValue>(
    () => ({
      config,
      maxBasketQuantity: config.maxBasketQuantity || DEFAULT_MAX_BASKET_QUANTITY,
      ready,
      refresh,
      applyAuthoritativeMaxBasketQuantity,
    }),
    [config, ready, refresh, applyAuthoritativeMaxBasketQuantity],
  );

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig(): AppConfigContextValue {
  const ctx = useContext(AppConfigContext);
  if (!ctx) throw new Error('useAppConfig must be used within AppConfigProvider');
  return ctx;
}
