import { useEffect, useRef, useState } from 'react';
import { fetchProducts } from '../api/catalog';
import { useAuth } from '../context/AuthContext';
import { captureAccountScope } from '../lib/accountScope';
import {
  CHECKLIST_DRAFT_DEBOUNCE_MS,
  checklistDraftCatalogQuery,
  draftSearchStatusFromResult,
  resolveDraftSuggestionView,
  shouldAcceptDraftSearchResult,
  shouldSearchChecklistDraft,
  type DraftSearchStatus,
} from '../lib/checklistDraftSearch';
import { createRequestGeneration } from '../lib/requestGeneration';
import type { Product } from '../types/catalog';

// Product suggestions while typing a checklist item (debounced).
export function useChecklistDraftSuggestions(draft: string, enabled: boolean): {
  status: DraftSearchStatus;
  products: Product[];
} {
  const { customer, accountGeneration } = useAuth();
  const accountId = customer?.id != null ? String(customer.id) : null;
  const [status, setStatus] = useState<DraftSearchStatus>('idle');
  const [products, setProducts] = useState<Product[]>([]);
  const [debounced, setDebounced] = useState('');
  const genRef = useRef(createRequestGeneration());
  const mountedRef = useRef(true);
  const accountRef = useRef(captureAccountScope(accountId, accountGeneration));
  accountRef.current = captureAccountScope(accountId, accountGeneration);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !shouldSearchChecklistDraft(draft)) {
      genRef.current.next();
      setDebounced('');
      setStatus('idle');
      setProducts([]);
      return;
    }
    const timer = setTimeout(() => setDebounced(draft.trim()), CHECKLIST_DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, enabled]);

  useEffect(() => {
    if (!enabled || !shouldSearchChecklistDraft(debounced)) {
      return;
    }
    const query = checklistDraftCatalogQuery(debounced);
    if (!query) return;
    const started = accountRef.current;
    const token = genRef.current.next();
    setStatus('loading');
    setProducts([]);
    void (async () => {
      try {
        const result = await fetchProducts(query);
        if (
          !shouldAcceptDraftSearchResult({
            mounted: mountedRef.current,
            requestCurrent: genRef.current.isCurrent(token),
            started,
            current: accountRef.current,
          })
        ) {
          return;
        }
        const next = Array.isArray(result.data) ? result.data : [];
        setProducts(next);
        setStatus(draftSearchStatusFromResult({ error: false, products: next }));
      } catch {
        if (
          !shouldAcceptDraftSearchResult({
            mounted: mountedRef.current,
            requestCurrent: genRef.current.isCurrent(token),
            started,
            current: accountRef.current,
          })
        ) {
          return;
        }
        setProducts([]);
        setStatus('error');
      }
    })();
    return () => {
      genRef.current.next();
    };
  }, [debounced, enabled, accountId, accountGeneration]);

  return resolveDraftSuggestionView({
    enabled,
    draft,
    debounced,
    status,
    products,
  });
}
