import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/http';
import { fetchRecipeRecommendations } from '../api/recommendations';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { captureAccountScope, isCurrentAccountScope } from '../lib/accountScope';
import { friendlyErrorMessage } from '../lib/errors';
import { isRecipeResultCurrent } from '../lib/homePreview';
import { classifyRecommendationErrorStatus, type RecommendationErrorKind } from '../lib/recommendations';
import { createRequestGeneration } from '../lib/requestGeneration';
import type { RecommendationListData } from '../types/recommendations';

// Loads recipe recommendations for the Recipe Ideas screen and the Home preview.
export type RecipeRecommendationsStatus =
  | 'loading'
  | 'authRequired'
  | 'success'
  | 'empty'
  | 'error';

export type RecipeRecommendationsError = {
  kind: RecommendationErrorKind;
  message: string;
};

export type UseRecipeRecommendationsOptions = {
  // Optional result-count cap, forwarded to `fetchRecipeRecommendations`.
  limit?: number;
  // When the basket changes, the recommendations are refreshed.
  evidenceKey?: string;
  // Wait this long after the last evidenceKey change before refetching.
  debounceMs?: number;
};

export type UseRecipeRecommendationsResult = {
  status: RecipeRecommendationsStatus;
  // Last loaded page, kept while reloading so the screen does not go blank. Check `status` first.
  data: RecommendationListData | null;
  error: RecipeRecommendationsError | null;
  // True only while a pull-to-refresh / explicit `refresh()` is in flight.
  refreshing: boolean;
  // True while the shown recommendations are for an older basket.
  evidenceStale: boolean;
  lastFetchedAt: number;
  lastEvidenceKey: string;
  lastGeneration: number;
  // Re-run the load as a full loading state (e.g. a "Try again" button).
  retry: () => void;
  // Re-run the load as a refresh (e.g. `RefreshControl.onRefresh`); awaitable.
  refresh: () => Promise<void>;
};

type LoadMode = 'initial' | 'retry' | 'refresh';

export function useRecipeRecommendations(
  options: UseRecipeRecommendationsOptions = {},
): UseRecipeRecommendationsResult {
  const { limit, evidenceKey, debounceMs } = options;
  const { customer, loading: authLoading, accountGeneration } = useAuth();
  // Recipes are translated by the server into the app language.
  const { language } = useI18n();

  const [status, setStatus] = useState<RecipeRecommendationsStatus>('loading');
  const [data, setData] = useState<RecommendationListData | null>(null);
  const [error, setError] = useState<RecipeRecommendationsError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState(0);
  const [lastEvidenceKey, setLastEvidenceKey] = useState('');
  const [lastGeneration, setLastGeneration] = useState(0);

  const mountedRef = useRef(true);
  const requestGenerationRef = useRef(createRequestGeneration());
  const evidenceKeyRef = useRef(evidenceKey ?? '');
  evidenceKeyRef.current = evidenceKey ?? '';
  const accountId = customer?.id != null ? String(customer.id) : null;
  const accountRef = useRef(captureAccountScope(accountId, accountGeneration));
  accountRef.current = captureAccountScope(accountId, accountGeneration);
  const lastAccountRef = useRef(accountRef.current);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (mode: LoadMode) => {
      // Auth state is still being restored from device storage; wait rather
      // than flashing `authRequired` for an about-to-be-signed-in customer.
      if (authLoading) return;

      if (!accountId) {
        requestGenerationRef.current.next();
        if (mountedRef.current) {
          setStatus('authRequired');
          setData(null);
          setError(null);
          setRefreshing(false);
          setLastEvidenceKey('');
          setLastGeneration(accountGeneration);
        }
        return;
      }

      const started = captureAccountScope(accountId, accountGeneration);
      if (!isCurrentAccountScope(lastAccountRef.current, started)) {
        if (mountedRef.current) {
          setData(null);
          setError(null);
          setLastEvidenceKey('');
        }
      }
      lastAccountRef.current = started;

      const requestId = requestGenerationRef.current.next();
      const evidenceAtStart = evidenceKeyRef.current;
      if (mode === 'refresh') {
        if (mountedRef.current) setRefreshing(true);
      } else if (mountedRef.current) {
        setStatus('loading');
        setError(null);
      }

      try {
        const result = await fetchRecipeRecommendations(limit, language);
        if (
          !isRecipeResultCurrent({
            mounted: mountedRef.current,
            requestCurrent: requestGenerationRef.current.isCurrent(requestId),
            started,
            current: accountRef.current,
          })
        ) {
          return;
        }
        setData(result);
        setError(null);
        setStatus(result.recommendations.length === 0 ? 'empty' : 'success');
        setLastEvidenceKey(evidenceAtStart);
        setLastFetchedAt(Date.now());
        setLastGeneration(started.generation);
      } catch (err) {
        if (
          !isRecipeResultCurrent({
            mounted: mountedRef.current,
            requestCurrent: requestGenerationRef.current.isCurrent(requestId),
            started,
            current: accountRef.current,
          })
        ) {
          return;
        }
        const kind = classifyRecommendationErrorStatus(err instanceof ApiError ? err.status : undefined);
        if (kind === 'auth') {
          // The server does not recognise the stored customer id.
          setStatus('authRequired');
          setData(null);
          setError(null);
        } else {
          setStatus('error');
          setError({ kind, message: friendlyErrorMessage(err) });
        }
      } finally {
        if (
          isRecipeResultCurrent({
            mounted: mountedRef.current,
            requestCurrent: requestGenerationRef.current.isCurrent(requestId),
            started,
            current: accountRef.current,
          })
        ) {
          setRefreshing(false);
        }
      }
    },
    [accountId, authLoading, limit, language, accountGeneration],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  const primedEvidenceRef = useRef(false);
  useEffect(() => {
    primedEvidenceRef.current = false;
  }, [customer?.id, accountGeneration, language, limit]);

  useEffect(() => {
    if (evidenceKey === undefined) return;
    if (!primedEvidenceRef.current) {
      primedEvidenceRef.current = true;
      return;
    }
    const wait = Number.isFinite(debounceMs) && (debounceMs as number) > 0 ? (debounceMs as number) : 0;
    const timer = setTimeout(() => {
      void load('refresh');
    }, wait);
    return () => clearTimeout(timer);
  }, [evidenceKey, debounceMs, load]);

  const retry = useCallback(() => {
    void load('retry');
  }, [load]);

  const refresh = useCallback(() => load('refresh'), [load]);

  const evidenceStale =
    evidenceKey !== undefined && evidenceKey !== lastEvidenceKey;

  return {
    status,
    data,
    error,
    refreshing,
    evidenceStale,
    lastFetchedAt,
    lastEvidenceKey,
    lastGeneration,
    retry,
    refresh,
  };
}
