import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { captureAccountScope, isCurrentAccountScope } from '../lib/accountScope';
import { createRequestGeneration } from '../lib/requestGeneration';
import {
  commitPersonalRecipesForAccount,
  evaluatePersonalRecipeDelete,
  evaluatePersonalRecipeSave,
  parsePersonalRecipesRaw,
  persistPersonalRecipeChange,
  type PersonalRecipesPersistSnapshot,
} from '../lib/personalRecipes';
import { personalRecipesStorageKey } from '../lib/personalRecipesStorage';
import type { PersonalRecipe, PersonalRecipeDraft } from '../types/personalRecipes';

export type PersonalRecipesStatus = 'signedOut' | 'loading' | 'error' | 'ready';

export type PersonalRecipesSaveResult =
  | { ok: true; kind: 'create' | 'update' | 'delete' | 'unchanged'; recipe: PersonalRecipe | null }
  | { ok: false; reason: string };

type PersonalRecipesContextValue = {
  status: PersonalRecipesStatus;
  recipes: PersonalRecipe[];
  signedIn: boolean;
  retry: () => void;
  recipeById: (id: string) => PersonalRecipe | null;
  saveRecipe: (draft: PersonalRecipeDraft) => Promise<PersonalRecipesSaveResult>;
  deleteRecipe: (recipeId: string) => Promise<PersonalRecipesSaveResult>;
};

const PersonalRecipesContext = createContext<PersonalRecipesContextValue | null>(null);

export function PersonalRecipesProvider({ children }: { children: React.ReactNode }) {
  const { customer, loading: authLoading, accountGeneration } = useAuth();
  const customerId = customer?.id ?? null;
  const storageKey = personalRecipesStorageKey(customerId);
  const signedIn = storageKey != null;

  const [status, setStatus] = useState<PersonalRecipesStatus>(authLoading ? 'loading' : signedIn ? 'loading' : 'signedOut');
  const [recipes, setRecipes] = useState<PersonalRecipe[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  const genRef = useRef(createRequestGeneration());
  const activeKeyRef = useRef<string | null>(storageKey);
  const accountGenerationRef = useRef(accountGeneration);
  accountGenerationRef.current = accountGeneration;
  const recipesRef = useRef<PersonalRecipe[]>(recipes);
  recipesRef.current = recipes;

  useEffect(() => {
    const token = genRef.current.next();
    const startedGeneration = accountGeneration;
    activeKeyRef.current = storageKey;
    setRecipes([]);
    recipesRef.current = [];

    if (authLoading) {
      setStatus('loading');
      return;
    }
    if (storageKey == null || customerId == null) {
      setStatus('signedOut');
      return;
    }

    setStatus('loading');
    let cancelled = false;
    void (async () => {
      let nextStatus: PersonalRecipesStatus = 'error';
      let loaded: PersonalRecipe[] = [];
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const parsed = parsePersonalRecipesRaw(raw);
        if (parsed.status === 'malformed') {
          nextStatus = 'error';
        } else {
          loaded = parsed.status === 'ready' ? parsed.recipes : [];
          nextStatus = 'ready';
        }
      } catch {
        nextStatus = 'error';
      }
      if (cancelled) return;
      if (!genRef.current.isCurrent(token)) return;
      if (activeKeyRef.current !== storageKey) return;
      if (accountGenerationRef.current !== startedGeneration) return;
      setRecipes(loaded);
      recipesRef.current = loaded;
      setStatus(nextStatus);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, customerId, storageKey, accountGeneration, reloadToken]);

  const snapshotAccount = useCallback((): PersonalRecipesPersistSnapshot | null => {
    const key = activeKeyRef.current;
    if (key == null) return null;
    return { key, generation: accountGenerationRef.current };
  }, []);

  const commit = useCallback(
    async (next: PersonalRecipe[], snapshot: PersonalRecipesPersistSnapshot) => {
      await commitPersonalRecipesForAccount({
        storage: AsyncStorage,
        snapshot,
        recipes: next,
        getCurrentKey: () => activeKeyRef.current,
        getCurrentGeneration: () => accountGenerationRef.current,
        applyVisible: (visible) => {
          recipesRef.current = visible;
          setRecipes(visible);
          setStatus('ready');
        },
      });
    },
    [],
  );

  const saveRecipe = useCallback(
    async (draft: PersonalRecipeDraft): Promise<PersonalRecipesSaveResult> => {
      const snapshot = snapshotAccount();
      if (!snapshot || !signedIn) return { ok: false, reason: 'stale_account' };
      const started = captureAccountScope(customerId != null ? String(customerId) : null, snapshot.generation);
      const current = captureAccountScope(
        customerId != null ? String(customerId) : null,
        accountGenerationRef.current,
      );
      if (!isCurrentAccountScope(started, current)) return { ok: false, reason: 'stale_account' };
      const evaluation = evaluatePersonalRecipeSave({
        started,
        current,
        recipes: recipesRef.current,
        draft,
      });
      const persisted = await persistPersonalRecipeChange({
        evaluation,
        commit: (nextRecipes) => commit(nextRecipes, snapshot),
      });
      if (!evaluation.ok) return { ok: false, reason: evaluation.reason };
      if (evaluation.kind === 'unchanged') {
        return { ok: true, kind: 'unchanged', recipe: recipesRef.current.find((row) => row.id === draft.id) ?? null };
      }
      if (!persisted.wrote) return { ok: false, reason: persisted.reason ?? 'save_failed' };
      return {
        ok: true,
        kind: evaluation.kind,
        recipe: evaluation.recipe,
      };
    },
    [commit, customerId, signedIn, snapshotAccount],
  );

  const deleteRecipe = useCallback(
    async (recipeId: string): Promise<PersonalRecipesSaveResult> => {
      const snapshot = snapshotAccount();
      if (!snapshot || !signedIn) return { ok: false, reason: 'stale_account' };
      const started = captureAccountScope(customerId != null ? String(customerId) : null, snapshot.generation);
      const current = captureAccountScope(
        customerId != null ? String(customerId) : null,
        accountGenerationRef.current,
      );
      const evaluation = evaluatePersonalRecipeDelete({
        started,
        current,
        recipes: recipesRef.current,
        recipeId,
      });
      const persisted = await persistPersonalRecipeChange({
        evaluation,
        commit: (nextRecipes) => commit(nextRecipes, snapshot),
      });
      if (!evaluation.ok) return { ok: false, reason: evaluation.reason };
      if (evaluation.kind === 'unchanged') return { ok: true, kind: 'unchanged', recipe: null };
      if (!persisted.wrote) return { ok: false, reason: persisted.reason ?? 'save_failed' };
      return { ok: true, kind: 'delete', recipe: null };
    },
    [commit, customerId, signedIn, snapshotAccount],
  );

  const recipeById = useCallback((id: string) => {
    const needle = id.trim();
    return recipesRef.current.find((row) => row.id === needle) ?? null;
  }, []);

  const retry = useCallback(() => setReloadToken((value) => value + 1), []);

  const value = useMemo<PersonalRecipesContextValue>(
    () => ({
      status,
      recipes,
      signedIn,
      retry,
      recipeById,
      saveRecipe,
      deleteRecipe,
    }),
    [deleteRecipe, recipeById, recipes, retry, saveRecipe, signedIn, status],
  );

  return <PersonalRecipesContext.Provider value={value}>{children}</PersonalRecipesContext.Provider>;
}

export function usePersonalRecipes(): PersonalRecipesContextValue {
  const value = useContext(PersonalRecipesContext);
  if (!value) throw new Error('usePersonalRecipes must be used within PersonalRecipesProvider');
  return value;
}
