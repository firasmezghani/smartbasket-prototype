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
import { useI18n } from '../i18n/I18nContext';
import type { ProductListInput, ShoppingListBatchSummary, ShoppingListItem } from '../types/shoppingList';
import {
  applyCollectedMarks,
  inspectLinkedCollect,
  cleanShoppingListLabel,
  normaliseStoredShoppingListItems,
  prepareShoppingListProductBatch,
  cleanShoppingListQuantity,
  resolveChecklistScanTarget,
  SHOPPING_LIST_MAX_ITEMS,
  type LinkedCollectKind,
} from '../lib/shoppingListBatch';
import {
  evaluateAfterAddGenericMatch,
  evaluateGenericMatchCommit,
  genericTypeLabelKey,
  isSupportedGenericType,
  type GenericChecklistType,
  type GenericMatchCandidate,
} from '../lib/genericChecklist';
import {
  currentAccountScope,
  eligibleManualMatchEntries,
  evaluateAddChecklistFeedback,
  evaluateManualMatchCommit,
  persistConfirmedManualMatch,
  shouldDiscardMatchSession,
  shouldDismissMatchAfterFailure,
  type AddChecklistNoticeKind,
  type ManualMatchFailure,
  type ManualMatchSession,
} from '../lib/manualListMatch';
import {
  evaluatePersonalNoteEdit,
  persistPersonalNoteEdit,
} from '../lib/personalNoteEdit';
import {
  LEGACY_SHOPPING_LIST_KEY,
  shoppingListStorageKey,
} from '../lib/shoppingListStorage';
import { retryFailedListSyncOnly } from '../lib/cartAddOutcome';
import {
  checklistAddResultFromAppend,
  checklistAddResultFromProductBatch,
  type ChecklistAddResult,
} from '../lib/checklistAddVisibility';
import { createRequestGeneration } from '../lib/requestGeneration';
import { commitShoppingListForAccount, type ListPersistSnapshot } from '../lib/shoppingListPersistence';
import { prepareMixedChecklistBatch, type MixedChecklistEntry } from '../lib/personalRecipeChecklist';
import { useAppConfig } from './AppConfigContext';
import { useAuth } from './AuthContext';

export type { ManualMatchFailure, ManualMatchSession };

const MAX_ITEMS = SHOPPING_LIST_MAX_ITEMS;

export type ChecklistNotice = {
  name: string;
  productId: string;
  listSynced: boolean;
  extraItemId?: string;
  kind?: AddChecklistNoticeKind;
  remaining?: number;
  offerMatch?: boolean;
  offerGenericMatch?: boolean;
  started?: { accountId: string | null; generation: number };
  productCanonicalType?: string | null;
  classificationStatus?: string | null;
  packageLabel?: string;
};

export type GenericMatchSession = {
  started: { accountId: string | null; generation: number };
  productName: string;
  productId: string;
  productCanonicalType: string;
  packageLabel: string;
  candidates: GenericMatchCandidate[];
  listSynced: boolean;
};

export type CollectedMarkPlan = ListPersistSnapshot & {
  nextItems: ShoppingListItem[];
  marked: number;
  collectKind: LinkedCollectKind;
  remainingUnchecked: number;
  eligibleManualCount: number;
  extraMarked: boolean;
  extraDecremented: boolean;
};

type ShoppingListContextValue = {
  items: ShoppingListItem[];
  ready: boolean;
  // Whether a customer is signed in. Mutations require this.
  signedIn: boolean;
  // Unsaved manual-entry text; survives pushing the checklist scanner.
  draftLabel: string;
  setDraftLabel: (value: string) => void;
  notice: ChecklistNotice | null;
  setNotice: (notice: ChecklistNotice | null) => void;
  addManualItem: (label: string, quantity?: number) => Promise<ChecklistAddResult>;
  updateManualItemLabel: (opts: {
    entryId: string;
    nextLabel: string;
    started: { accountId: string | null; generation: number };
  }) => Promise<'updated' | 'unchanged'>;
  addGenericItem: (genericType: GenericChecklistType, quantity?: number) => Promise<ChecklistAddResult>;
  addProductItem: (input: ProductListInput) => Promise<ChecklistAddResult>;
  addProductItems: (inputs: readonly ProductListInput[]) => Promise<ShoppingListBatchSummary>;
  addMixedChecklistEntries: (entries: readonly MixedChecklistEntry[]) => Promise<ShoppingListBatchSummary>;
  toggleItem: (id: string) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  markProductCollected: (productId: string) => Promise<number>;
  prepareProductCollected: (productId: string) => CollectedMarkPlan | null;
  prepareCollectedMarks: (opts: {
    productId?: string;
    extraItemId?: string;
  }) => CollectedMarkPlan | null;
  commitPreparedCollected: (plan: CollectedMarkPlan) => Promise<number>;
  pendingMatch: ManualMatchSession | null;
  presentAddFeedback: (opts: {
    started: { accountId: string | null; generation: number };
    addConfirmed: boolean;
    extraItemId?: string | null;
    targetedScan?: boolean;
    productName: string;
    productId: string;
    listSynced: boolean;
    collectKind: LinkedCollectKind;
    remainingUnchecked: number;
    eligibleManualCount: number;
    extraMarked?: boolean;
    extraDecremented?: boolean;
    productCanonicalType?: string | null;
    classificationStatus?: string | null;
    packageLabel?: string;
  }) => void;
  offerMatchFromNotice: () => boolean;
  offerGenericMatchFromNotice: () => boolean;
  retryNoticeListSync: () => Promise<boolean>;
  offerBasketMatch: (entryId: string) => boolean;
  dismissPendingMatch: () => ManualMatchSession | null;
  confirmManualMatch: (opts: {
    entryId: string;
    selectedProductId?: string;
    cart?: { items: { productId?: string | null }[] } | null;
    basketKnown?: boolean;
  }) => Promise<{ ok: true } | { ok: false; reason: ManualMatchFailure }>;
  pendingGenericMatch: GenericMatchSession | null;
  dismissPendingGenericMatch: () => GenericMatchSession | null;
  confirmGenericMatch: (opts: {
    entryId: string;
  }) => Promise<{ ok: true } | { ok: false; reason: ManualMatchFailure }>;
};

const ShoppingListContext = createContext<ShoppingListContextValue | null>(null);

function createId(): string {
  if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseRawList(raw: string | null): ShoppingListItem[] {
  if (!raw) return [];
  try {
    return normaliseStoredShoppingListItems(JSON.parse(raw));
  } catch {
    return [];
  }
}

// Delete the shared list from older installs without reading it.
async function retireLegacyShoppingList(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LEGACY_SHOPPING_LIST_KEY);
  } catch {
    // Ignore errors: this key is never read.
  }
}

export function ShoppingListProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { customer, loading: authLoading, accountGeneration } = useAuth();
  const { maxBasketQuantity } = useAppConfig();

  const customerId = customer?.id ?? null;
  const storageKey = shoppingListStorageKey(customerId);
  const signedIn = storageKey != null;

  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [ready, setReady] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [notice, setNotice] = useState<ChecklistNotice | null>(null);
  const [pendingMatch, setPendingMatch] = useState<ManualMatchSession | null>(null);
  const [pendingGenericMatch, setPendingGenericMatch] = useState<GenericMatchSession | null>(null);

  // Delete the shared list key once, on mount.
  useEffect(() => {
    void retireLegacyShoppingList();
  }, []);

  // New generation on every account change, so a stale read cannot overwrite newer data.
  const genRef = useRef(createRequestGeneration());
  const activeKeyRef = useRef<string | null>(storageKey);
  const accountGenerationRef = useRef(accountGeneration);
  accountGenerationRef.current = accountGeneration;
  const itemsRef = useRef<ShoppingListItem[]>(items);
  itemsRef.current = items;
  const pendingMatchRef = useRef<ManualMatchSession | null>(pendingMatch);
  pendingMatchRef.current = pendingMatch;
  const pendingGenericMatchRef = useRef<GenericMatchSession | null>(pendingGenericMatch);
  pendingGenericMatchRef.current = pendingGenericMatch;

  useEffect(() => {
    const token = genRef.current.next();
    const startedGeneration = accountGeneration;
    activeKeyRef.current = storageKey;
    // Drop the previous account's list at once, so the next customer never sees it.
    setItems([]);
    setReady(false);
    setDraftLabel('');
    setNotice(null);
    setPendingMatch(null);
    setPendingGenericMatch(null);

    // Wait for auth to resolve so a signed-in user on cold start never flashes
    // the signed-out state before their session is read from storage.
    if (authLoading) return;

    if (storageKey == null || customerId == null) {
      // Signed out: no list, nothing to load. The UI shows a signed-out state.
      if (genRef.current.isCurrent(token) && accountGenerationRef.current === startedGeneration) {
        setReady(true);
      }
      return;
    }

    let cancelled = false;
    (async () => {
      let loaded: ShoppingListItem[] = [];
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        loaded = parseRawList(raw);
      } catch {
        loaded = [];
      }
      // Apply only if this is still the current account and generation.
      if (cancelled) return;
      if (!genRef.current.isCurrent(token)) return;
      if (activeKeyRef.current !== storageKey) return;
      if (accountGenerationRef.current !== startedGeneration) return;
      setItems(loaded);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, customerId, storageKey, accountGeneration]);

  const snapshotAccount = useCallback((): ListPersistSnapshot | null => {
    const key = activeKeyRef.current;
    if (key == null) return null;
    return { key, generation: accountGenerationRef.current };
  }, []);

  // Save the list for the account that made the change.
  const commit = useCallback(
    async (next: ShoppingListItem[], snapshot: ListPersistSnapshot) => {
      const safe = Array.isArray(next) ? next.slice(0, MAX_ITEMS) : [];
      try {
        JSON.stringify(safe);
      } catch {
        throw new Error(t('list.saveFailed'));
      }
      try {
        await commitShoppingListForAccount({
          storage: AsyncStorage,
          snapshot,
          items: safe,
          getCurrentKey: () => activeKeyRef.current,
          getCurrentGeneration: () => accountGenerationRef.current,
          applyVisible: (visible) => {
            itemsRef.current = visible;
            setItems(visible);
          },
        });
      } catch {
        throw new Error(t('list.saveFailed'));
      }
    },
    [t],
  );

  const requireSignedIn = useCallback((): ListPersistSnapshot => {
    const snapshot = snapshotAccount();
    if (snapshot == null) {
      throw new Error(t('list.errorSignInRequired'));
    }
    return snapshot;
  }, [snapshotAccount, t]);

  const addManualItem = useCallback(
    async (label: string, quantity = 1) => {
      const snapshot = requireSignedIn();
      const currentItems = itemsRef.current;
      const cleanLabel = cleanShoppingListLabel(label);
      if (!cleanLabel) throw new Error(t('list.errorEmptyLabel'));
      if (currentItems.length >= MAX_ITEMS) throw new Error(t('list.errorFull'));
      const next = [
        ...currentItems,
        {
          id: createId(),
          label: cleanLabel,
          quantity: cleanShoppingListQuantity(quantity),
          checked: false,
          createdAt: new Date().toISOString(),
        },
      ];
      await commit(next, snapshot);
      return (
        checklistAddResultFromAppend({ previousItems: currentItems, nextItems: next }) ?? {
          id: next[next.length - 1]!.id,
          kind: 'added' as const,
          label: cleanLabel,
        }
      );
    },
    [commit, requireSignedIn, t],
  );

  const addGenericItem = useCallback(
    async (genericType: GenericChecklistType, quantity = 1) => {
      const snapshot = requireSignedIn();
      if (!isSupportedGenericType(genericType)) {
        throw new Error(t('list.errorUnknownGeneric'));
      }
      const currentItems = itemsRef.current;
      if (currentItems.length >= MAX_ITEMS) throw new Error(t('list.errorFull'));
      const label = t(genericTypeLabelKey(genericType));
      const next = [
        ...currentItems,
        {
          id: createId(),
          label,
          quantity: cleanShoppingListQuantity(quantity),
          checked: false,
          genericType,
          createdAt: new Date().toISOString(),
        },
      ];
      await commit(next, snapshot);
      return (
        checklistAddResultFromAppend({ previousItems: currentItems, nextItems: next }) ?? {
          id: next[next.length - 1]!.id,
          kind: 'added' as const,
          label,
        }
      );
    },
    [commit, requireSignedIn, t],
  );

  const addProductItem = useCallback(
    async (input: ProductListInput) => {
      const snapshot = requireSignedIn();
      const previous = itemsRef.current;
      const result = prepareShoppingListProductBatch(previous, [input], {
        maxItems: MAX_ITEMS,
        maxTotalQuantity: maxBasketQuantity,
        createId,
        nowIso: () => new Date().toISOString(),
      });
      if (result.added === 0 && result.merged === 0) {
        const reason = result.skippedDetails[0]?.reason;
        throw new Error(reason === 'capacity' ? t('list.errorFull') : t('list.errorIncompleteProduct'));
      }
      await commit(result.nextItems, snapshot);
      const touched = checklistAddResultFromProductBatch({
        productId: input.productId,
        previousItems: previous,
        nextItems: result.nextItems,
        added: result.added,
        merged: result.merged,
      });
      if (!touched) {
        throw new Error(t('list.errorIncompleteProduct'));
      }
      return touched;
    },
    [commit, maxBasketQuantity, requireSignedIn, t],
  );

  const addProductItems = useCallback(
    async (inputs: readonly ProductListInput[]): Promise<ShoppingListBatchSummary> => {
      const snapshot = requireSignedIn();
      const result = prepareShoppingListProductBatch(itemsRef.current, inputs, {
        maxItems: MAX_ITEMS,
        maxTotalQuantity: maxBasketQuantity,
        createId: createId,
        nowIso: () => new Date().toISOString(),
      });
      if (result.added === 0 && result.merged === 0) {
        const blockedByCapacity = result.skippedDetails.some((s) => s.reason === 'capacity');
        if (blockedByCapacity) {
          throw new Error(t('list.errorFull'));
        }
        return { added: 0, merged: 0, skipped: result.skipped };
      }
      await commit(result.nextItems, snapshot);
      return { added: result.added, merged: result.merged, skipped: result.skipped };
    },
    [commit, maxBasketQuantity, requireSignedIn, t],
  );

  const addMixedChecklistEntries = useCallback(
    async (entries: readonly MixedChecklistEntry[]): Promise<ShoppingListBatchSummary> => {
      const snapshot = requireSignedIn();
      const result = prepareMixedChecklistBatch(itemsRef.current, entries, {
        maxItems: MAX_ITEMS,
        maxTotalQuantity: maxBasketQuantity,
        createId: createId,
        nowIso: () => new Date().toISOString(),
      });
      if (result.added === 0 && result.merged === 0) {
        const blockedByCapacity = result.skippedDetails.some((s) => s.reason === 'capacity');
        if (blockedByCapacity) {
          throw new Error(t('list.errorFull'));
        }
        return { added: 0, merged: 0, skipped: result.skipped };
      }
      await commit(result.nextItems, snapshot);
      return { added: result.added, merged: result.merged, skipped: result.skipped };
    },
    [commit, maxBasketQuantity, requireSignedIn, t],
  );

  const toggleItem = useCallback(
    async (id: string) => {
      const snapshot = requireSignedIn();
      const now = new Date().toISOString();
      await commit(
        itemsRef.current.map((item) =>
          item.id === id
            ? { ...item, checked: !item.checked, checkedAt: item.checked ? undefined : now }
            : item,
        ),
        snapshot,
      );
    },
    [commit, requireSignedIn],
  );

  const removeItem = useCallback(
    async (id: string) => {
      const snapshot = requireSignedIn();
      await commit(itemsRef.current.filter((item) => item.id !== id), snapshot);
    },
    [commit, requireSignedIn],
  );

  const clearCompleted = useCallback(async () => {
    const snapshot = requireSignedIn();
    await commit(itemsRef.current.filter((item) => !item.checked), snapshot);
  }, [commit, requireSignedIn]);

  const prepareCollectedMarks = useCallback(
    (opts: { productId?: string; extraItemId?: string }): CollectedMarkPlan | null => {
      const snapshot = snapshotAccount();
      if (snapshot == null) return null;
      const inspect = inspectLinkedCollect(itemsRef.current, {
        productId: opts.productId,
        extraItemId: opts.extraItemId,
        nowIso: new Date().toISOString(),
      });
      return {
        ...snapshot,
        nextItems: inspect.nextItems,
        marked: inspect.marked,
        collectKind: inspect.kind,
        remainingUnchecked: inspect.remainingUnchecked,
        eligibleManualCount: inspect.eligibleManualCount,
        extraMarked: inspect.extraMarked,
        extraDecremented: inspect.extraDecremented,
      };
    },
    [snapshotAccount],
  );

  const prepareProductCollected = useCallback(
    (productId: string): CollectedMarkPlan | null => prepareCollectedMarks({ productId }),
    [prepareCollectedMarks],
  );

  const commitPreparedCollected = useCallback(
    async (plan: CollectedMarkPlan) => {
      if (plan.marked === 0) return 0;
      await commit(plan.nextItems, { key: plan.key, generation: plan.generation });
      return plan.marked;
    },
    [commit],
  );

  const markProductCollected = useCallback(
    async (productId: string) => {
      // Called after a scan. When signed out there is no list, so do nothing.
      const plan = prepareProductCollected(productId);
      if (!plan) return 0;
      return commitPreparedCollected(plan);
    },
    [commitPreparedCollected, prepareProductCollected],
  );

  const liveScope = useCallback(
    () => currentAccountScope(customerId, accountGenerationRef.current),
    [customerId],
  );

  const updateManualItemLabel = useCallback(
    async (opts: {
      entryId: string;
      nextLabel: string;
      started: { accountId: string | null; generation: number };
    }) => {
      const current = liveScope();
      if (shouldDiscardMatchSession(opts.started, current)) {
        throw new Error(t('list.matchStale'));
      }
      const snapshot = snapshotAccount();
      if (snapshot == null || snapshot.generation !== opts.started.generation) {
        throw new Error(t('list.errorSignInRequired'));
      }
      const evaluation = evaluatePersonalNoteEdit({
        started: opts.started,
        current,
        items: itemsRef.current,
        entryId: opts.entryId,
        nextLabel: opts.nextLabel,
      });
      const persisted = await persistPersonalNoteEdit({
        evaluation,
        commit: (nextItems) => commit(nextItems, snapshot),
      });
      if (!evaluation.ok) {
        if (evaluation.reason === 'empty_label') throw new Error(t('list.errorEmptyLabel'));
        if (evaluation.reason === 'stale_account') throw new Error(t('list.matchStale'));
        throw new Error(t('list.editNoteGone'));
      }
      return persisted.wrote ? ('updated' as const) : ('unchanged' as const);
    },
    [commit, liveScope, snapshotAccount, t],
  );

  const presentAddFeedback = useCallback(
    (opts: {
      started: { accountId: string | null; generation: number };
      addConfirmed: boolean;
      extraItemId?: string | null;
      targetedScan?: boolean;
      productName: string;
      productId: string;
      listSynced: boolean;
      collectKind: LinkedCollectKind;
      remainingUnchecked: number;
      eligibleManualCount: number;
      extraMarked?: boolean;
      extraDecremented?: boolean;
      productCanonicalType?: string | null;
      classificationStatus?: string | null;
      packageLabel?: string;
    }) => {
      if (shouldDiscardMatchSession(opts.started, liveScope())) return;
      const extra = typeof opts.extraItemId === 'string' ? opts.extraItemId.trim() : '';
      const targeted = opts.targetedScan === true || extra.length > 0;
      const genericOffer = evaluateAfterAddGenericMatch({
        items: itemsRef.current,
        product: {
          canonicalType: opts.productCanonicalType,
          classificationStatus: opts.classificationStatus,
        },
        collectKind: opts.collectKind,
        targetedAlreadyConfirmed: targeted,
      });
      const genericCount = genericOffer.kind === 'none' ? 0 : genericOffer.candidates.length;
      const feedback = evaluateAddChecklistFeedback({
        addConfirmed: opts.addConfirmed,
        listSynced: opts.listSynced,
        collectKind: opts.collectKind,
        remainingUnchecked: opts.remainingUnchecked,
        eligibleManualCount: opts.eligibleManualCount,
        extraItemId: opts.extraItemId,
        targetedScan: opts.targetedScan,
        genericCandidateCount: genericCount,
        genericExtraMarked: opts.extraMarked,
        genericExtraDecremented: opts.extraDecremented,
      });
      if (feedback.openMatchDialog && genericOffer.kind !== 'none') {
        setPendingMatch(null);
        setNotice(null);
        setPendingGenericMatch({
          started: opts.started,
          productName: opts.productName,
          productId: opts.productId,
          productCanonicalType: genericOffer.candidates[0]!.genericType,
          packageLabel: opts.packageLabel || opts.productName,
          candidates: genericOffer.candidates,
          listSynced: opts.listSynced,
        });
        return;
      }
      if (!feedback.noticeKind) return;
      setPendingMatch(null);
      setPendingGenericMatch(null);
      setNotice({
        name: opts.productName,
        productId: opts.productId,
        listSynced: opts.listSynced,
        extraItemId: extra || undefined,
        kind: feedback.noticeKind,
        remaining: feedback.remaining,
        offerMatch: feedback.offerMatchAction,
        offerGenericMatch: feedback.offerGenericMatchAction,
        started: opts.started,
        productCanonicalType: opts.productCanonicalType,
        classificationStatus: opts.classificationStatus,
        packageLabel: opts.packageLabel,
      });
    },
    [liveScope],
  );

  const offerMatchFromNotice = useCallback((): boolean => {
    const currentNotice = notice;
    if (!currentNotice?.offerMatch) return false;
    const started = currentNotice.started ?? liveScope();
    if (shouldDiscardMatchSession(started, liveScope())) {
      setNotice(null);
      return false;
    }
    const manuals = eligibleManualMatchEntries(itemsRef.current).length;
    if (manuals <= 0) return false;
    setPendingMatch({
      kind: 'afterAdd',
      started,
      productName: currentNotice.name,
      productId: currentNotice.productId,
      listSynced: currentNotice.listSynced,
    });
    setNotice(null);
    return true;
  }, [liveScope, notice]);

  const offerGenericMatchFromNotice = useCallback((): boolean => {
    const currentNotice = notice;
    if (!currentNotice?.offerGenericMatch) return false;
    const started = currentNotice.started ?? liveScope();
    if (shouldDiscardMatchSession(started, liveScope())) {
      setNotice(null);
      return false;
    }
    const offer = evaluateAfterAddGenericMatch({
      items: itemsRef.current,
      product: {
        canonicalType: currentNotice.productCanonicalType,
        classificationStatus: currentNotice.classificationStatus,
      },
      collectKind: 'none',
      targetedAlreadyConfirmed: false,
    });
    if (offer.kind === 'none') return false;
    setPendingGenericMatch({
      started,
      productName: currentNotice.name,
      productId: currentNotice.productId,
      productCanonicalType: offer.candidates[0]!.genericType,
      packageLabel: currentNotice.packageLabel || currentNotice.name,
      candidates: offer.candidates,
      listSynced: currentNotice.listSynced,
    });
    setNotice(null);
    return true;
  }, [liveScope, notice]);

  const retryNoticeListSync = useCallback(async (): Promise<boolean> => {
    const currentNotice = notice;
    if (!currentNotice || currentNotice.listSynced) return false;
    const started = currentNotice.started ?? liveScope();
    if (shouldDiscardMatchSession(started, liveScope())) {
      setNotice(null);
      return false;
    }
    let presented = false;
    await retryFailedListSyncOnly({
      basketAdded: true,
      listSynced: false,
      markList: async () => {
        const plan = prepareCollectedMarks({
          productId: currentNotice.productId,
          extraItemId: currentNotice.extraItemId,
        });
        if (!plan) return;
        await commitPreparedCollected(plan);
        presentAddFeedback({
          started,
          addConfirmed: true,
          extraItemId: currentNotice.extraItemId,
          productName: currentNotice.name,
          productId: currentNotice.productId,
          listSynced: true,
          collectKind: plan.collectKind,
          remainingUnchecked: plan.remainingUnchecked,
          eligibleManualCount: plan.eligibleManualCount,
          extraMarked: plan.extraMarked,
          extraDecremented: plan.extraDecremented,
          productCanonicalType: currentNotice.productCanonicalType,
          classificationStatus: currentNotice.classificationStatus,
          packageLabel: currentNotice.packageLabel,
        });
        presented = true;
      },
    });
    return presented;
  }, [commitPreparedCollected, liveScope, notice, prepareCollectedMarks, presentAddFeedback]);

  const offerBasketMatch = useCallback(
    (entryId: string): boolean => {
      const started = liveScope();
      const target = resolveChecklistScanTarget(itemsRef.current, entryId);
      if (!target) return false;
      setPendingMatch({
        kind: 'fromBasket',
        started,
        entryId: target.id,
        entryLabel: target.label,
        entryQuantity: target.quantity,
      });
      return true;
    },
    [liveScope],
  );

  const dismissPendingMatch = useCallback((): ManualMatchSession | null => {
    const previous = pendingMatchRef.current;
    setPendingMatch(null);
    return previous;
  }, []);

  const confirmManualMatch = useCallback(
    async (opts: {
      entryId: string;
      selectedProductId?: string;
      cart?: { items: { productId?: string | null }[] } | null;
      basketKnown?: boolean;
    }): Promise<{ ok: true } | { ok: false; reason: ManualMatchFailure }> => {
      const pending = pendingMatchRef.current;
      if (!pending) return { ok: false, reason: 'cancelled' };
      if (shouldDiscardMatchSession(pending.started, liveScope())) {
        setPendingMatch(null);
        return { ok: false, reason: 'stale_account' };
      }
      const entryId = pending.kind === 'fromBasket' ? pending.entryId : opts.entryId;
      const requireProductInBasket =
        pending.kind === 'fromBasket'
          ? {
              productId: opts.selectedProductId,
              cart: opts.cart,
              basketKnown: opts.basketKnown === true,
            }
          : undefined;
      const evaluation = evaluateManualMatchCommit({
        started: pending.started,
        current: liveScope(),
        items: itemsRef.current,
        entryId,
        requireProductInBasket,
      });
      const persisted = await persistConfirmedManualMatch({
        evaluation,
        markList: async (extraItemId) => {
          const snapshot = snapshotAccount();
          if (!snapshot || snapshot.generation !== pending.started.generation) {
            throw new Error(t('list.saveFailed'));
          }
          const marked = applyCollectedMarks(itemsRef.current, {
            extraItemId,
            nowIso: new Date().toISOString(),
          });
          if (marked.marked === 0) {
            throw new Error(t('list.saveFailed'));
          }
          await commit(marked.nextItems, {
            key: snapshot.key,
            generation: pending.started.generation,
          });
        },
      });
      if (!persisted.listMarked) {
        if (shouldDismissMatchAfterFailure(persisted.reason)) setPendingMatch(null);
        return { ok: false, reason: persisted.reason ?? 'cancelled' };
      }
      setPendingMatch(null);
      return { ok: true };
    },
    [commit, liveScope, snapshotAccount, t],
  );

  const dismissPendingGenericMatch = useCallback((): GenericMatchSession | null => {
    const previous = pendingGenericMatchRef.current;
    setPendingGenericMatch(null);
    return previous;
  }, []);

  const confirmGenericMatch = useCallback(
    async (opts: {
      entryId: string;
    }): Promise<{ ok: true } | { ok: false; reason: ManualMatchFailure }> => {
      const pending = pendingGenericMatchRef.current;
      if (!pending) return { ok: false, reason: 'cancelled' };
      if (shouldDiscardMatchSession(pending.started, liveScope())) {
        setPendingGenericMatch(null);
        return { ok: false, reason: 'stale_account' };
      }
      const wantedId = typeof opts.entryId === 'string' ? opts.entryId.trim() : '';
      if (!wantedId || !pending.candidates.some((row) => row.id === wantedId)) {
        return { ok: false, reason: 'entry_missing' };
      }
      const evaluation = evaluateGenericMatchCommit({
        started: pending.started,
        current: liveScope(),
        items: itemsRef.current,
        entryId: wantedId,
        expectedType: pending.productCanonicalType,
      });
      const persisted = await persistConfirmedManualMatch({
        evaluation,
        markList: async (extraItemId) => {
          const snapshot = snapshotAccount();
          if (!snapshot || snapshot.generation !== pending.started.generation) {
            throw new Error(t('list.saveFailed'));
          }
          const item = itemsRef.current.find((row) => row.id === extraItemId);
          if (!item || item.checked === true || item.genericType !== pending.productCanonicalType) {
            throw new Error(t('list.saveFailed'));
          }
          const marked = applyCollectedMarks(itemsRef.current, {
            extraItemId,
            nowIso: new Date().toISOString(),
          });
          if (marked.marked === 0) {
            throw new Error(t('list.saveFailed'));
          }
          await commit(marked.nextItems, {
            key: snapshot.key,
            generation: pending.started.generation,
          });
        },
      });
      if (!persisted.listMarked) {
        if (shouldDismissMatchAfterFailure(persisted.reason)) setPendingGenericMatch(null);
        return { ok: false, reason: persisted.reason ?? 'cancelled' };
      }
      setPendingGenericMatch(null);
      return { ok: true };
    },
    [commit, liveScope, snapshotAccount, t],
  );

  const value = useMemo(
    () => ({
      items,
      ready,
      signedIn,
      draftLabel,
      setDraftLabel,
      notice,
      setNotice,
      addManualItem,
      updateManualItemLabel,
      addGenericItem,
      addProductItem,
      addProductItems,
      addMixedChecklistEntries,
      toggleItem,
      removeItem,
      clearCompleted,
      markProductCollected,
      prepareProductCollected,
      prepareCollectedMarks,
      commitPreparedCollected,
      pendingMatch,
      presentAddFeedback,
      offerMatchFromNotice,
      offerGenericMatchFromNotice,
      retryNoticeListSync,
      offerBasketMatch,
      dismissPendingMatch,
      confirmManualMatch,
      pendingGenericMatch,
      dismissPendingGenericMatch,
      confirmGenericMatch,
    }),
    [
      items,
      ready,
      signedIn,
      draftLabel,
      notice,
      addManualItem,
      updateManualItemLabel,
      addGenericItem,
      addProductItem,
      addProductItems,
      addMixedChecklistEntries,
      toggleItem,
      removeItem,
      clearCompleted,
      markProductCollected,
      prepareProductCollected,
      prepareCollectedMarks,
      commitPreparedCollected,
      pendingMatch,
      presentAddFeedback,
      offerMatchFromNotice,
      offerGenericMatchFromNotice,
      retryNoticeListSync,
      offerBasketMatch,
      dismissPendingMatch,
      confirmManualMatch,
      pendingGenericMatch,
      dismissPendingGenericMatch,
      confirmGenericMatch,
    ],
  );

  return <ShoppingListContext.Provider value={value}>{children}</ShoppingListContext.Provider>;
}

export function useShoppingList(): ShoppingListContextValue {
  const value = useContext(ShoppingListContext);
  if (!value) throw new Error('useShoppingList must be used within ShoppingListProvider');
  return value;
}
