// Lets the customer tick a handwritten list item for a scanned product.

import type { ShoppingListItem } from '../types/shoppingList';
import { captureAccountScope, isCurrentAccountScope, type AccountScope } from './accountScope';
import {
  isUncheckedManualItem,
  normaliseProductIdForMatch,
  type LinkedCollectKind,
} from './shoppingListBatch';

export type { AccountScope, LinkedCollectKind };

export type ManualMatchFailure =
  | 'stale_account'
  | 'entry_missing'
  | 'entry_checked'
  | 'entry_linked'
  | 'product_missing'
  | 'basket_unknown'
  | 'cancelled';

export type ManualMatchCandidate = {
  id: string;
  label: string;
  quantity: number;
};

export type BasketMatchProduct = {
  productId: string;
  name: string;
  quantity: number;
};

export type AfterAddMatchSession = {
  kind: 'afterAdd';
  started: AccountScope;
  productName: string;
  productId: string;
  listSynced: boolean;
};

export type BasketMatchSession = {
  kind: 'fromBasket';
  started: AccountScope;
  entryId: string;
  entryLabel: string;
  entryQuantity: number;
};

export type ManualMatchSession = AfterAddMatchSession | BasketMatchSession;

export function uncheckedManualEntries(
  items: readonly ShoppingListItem[] | null | undefined,
): ShoppingListItem[] {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => isUncheckedManualItem(item));
}

export function eligibleManualMatchEntries(
  items: readonly ShoppingListItem[] | null | undefined,
): ManualMatchCandidate[] {
  return uncheckedManualEntries(items).map((item) => ({
    id: item.id,
    label: item.label,
    quantity: item.quantity,
  }));
}

export type AddChecklistNoticeKind = 'checked' | 'already' | 'added' | 'list_failed' | 'unresolved';

export type AddChecklistFeedback = {
  noticeKind: AddChecklistNoticeKind | null;
  remaining?: number;
  offerMatchAction: boolean;
  offerGenericMatchAction: boolean;
  openMatchDialog: boolean;
};

// Decide what feedback to show after an add.
export function evaluateAddChecklistFeedback(opts: {
  addConfirmed: boolean;
  listSynced: boolean;
  collectKind: LinkedCollectKind | null | undefined;
  remainingUnchecked: number;
  eligibleManualCount: number;
  extraItemId?: string | null;
  targetedScan?: boolean;
  genericCandidateCount?: number;
  genericExtraMarked?: boolean;
  genericExtraDecremented?: boolean;
}): AddChecklistFeedback {
  const closed: AddChecklistFeedback = {
    noticeKind: null,
    offerMatchAction: false,
    offerGenericMatchAction: false,
    openMatchDialog: false,
  };
  if (opts.addConfirmed !== true) return closed;

  const extra = typeof opts.extraItemId === 'string' ? opts.extraItemId.trim() : '';
  const targeted = opts.targetedScan === true || extra.length > 0;
  const remaining = Number.isFinite(opts.remainingUnchecked)
    ? Math.max(0, Math.floor(opts.remainingUnchecked))
    : 0;
  const generics = Number.isFinite(opts.genericCandidateCount)
    ? Math.max(0, Math.floor(opts.genericCandidateCount as number))
    : 0;
  const kind = opts.collectKind;
  const genericCompleted = opts.genericExtraMarked === true && opts.genericExtraDecremented !== true;

  if (opts.listSynced !== true) {
    return {
      noticeKind: 'list_failed',
      offerMatchAction: false,
      offerGenericMatchAction: false,
      openMatchDialog: false,
    };
  }

  if (targeted) {
    if (kind === 'newly_checked' || genericCompleted) {
      return {
        noticeKind: 'checked',
        remaining,
        offerMatchAction: false,
        offerGenericMatchAction: false,
        openMatchDialog: false,
      };
    }
    return {
      noticeKind: 'added',
      offerMatchAction: false,
      offerGenericMatchAction: false,
      openMatchDialog: false,
    };
  }

  if (kind === 'newly_checked') {
    return {
      noticeKind: 'checked',
      remaining,
      offerMatchAction: false,
      offerGenericMatchAction: false,
      openMatchDialog: false,
    };
  }
  if (kind === 'already_checked') {
    return {
      noticeKind: 'already',
      offerMatchAction: false,
      offerGenericMatchAction: false,
      openMatchDialog: false,
    };
  }
  if (generics > 0) {
    return {
      noticeKind: null,
      offerMatchAction: false,
      offerGenericMatchAction: false,
      openMatchDialog: true,
    };
  }
  return {
    noticeKind: 'added',
    offerMatchAction: false,
    offerGenericMatchAction: false,
    openMatchDialog: false,
  };
}

export const ADD_NOTICE_AUTO_DISMISS_MS = 6000;

export type AddChecklistNoticeTone = 'success' | 'partial' | 'unresolved';

export type AddChecklistNoticeHeadingKey =
  | 'list.noticeCheckedHeading'
  | 'list.noticeAddedToBasket'
  | 'list.noticePartialHeading'
  | 'list.noticeUnresolvedHeading';

export type AddChecklistNoticeDetailKey =
  | 'list.noticeCheckedDetailZero'
  | 'list.noticeCheckedDetailOne'
  | 'list.noticeCheckedDetailOther'
  | 'list.noticeAddedDetail'
  | 'list.noticePartialDetail'
  | 'list.noticeUnresolvedDetail';

export type AddChecklistNoticeView = {
  tone: AddChecklistNoticeTone;
  headingKey: AddChecklistNoticeHeadingKey;
  detailKey: AddChecklistNoticeDetailKey;
  params: { name: string; remaining?: number };
  autoDismiss: boolean;
};

export function addedCheckedNoticeKey(
  remaining: number,
): 'list.noticeCheckedDetailZero' | 'list.noticeCheckedDetailOne' | 'list.noticeCheckedDetailOther' {
  if (remaining <= 0) return 'list.noticeCheckedDetailZero';
  if (remaining === 1) return 'list.noticeCheckedDetailOne';
  return 'list.noticeCheckedDetailOther';
}

// Heading, detail and tone for the shared add notice. Never styles unresolved as success.
export function resolveAddChecklistNoticeView(opts: {
  kind: AddChecklistNoticeKind | null | undefined;
  name: string;
  remaining?: number;
  listSynced?: boolean;
  offerMatch?: boolean;
  offerGenericMatch?: boolean;
}): AddChecklistNoticeView {
  const name = opts.name;
  const persist = opts.offerMatch === true || opts.offerGenericMatch === true;
  if (opts.kind === 'unresolved') {
    return {
      tone: 'unresolved',
      headingKey: 'list.noticeUnresolvedHeading',
      detailKey: 'list.noticeUnresolvedDetail',
      params: { name },
      autoDismiss: false,
    };
  }
  if (opts.kind === 'list_failed' || (opts.kind == null && opts.listSynced === false)) {
    return {
      tone: 'partial',
      headingKey: 'list.noticePartialHeading',
      detailKey: 'list.noticePartialDetail',
      params: { name },
      autoDismiss: false,
    };
  }
  if (opts.kind === 'checked') {
    const remaining = Number.isFinite(opts.remaining)
      ? Math.max(0, Math.floor(opts.remaining as number))
      : 0;
    return {
      tone: 'success',
      headingKey: 'list.noticeCheckedHeading',
      detailKey: addedCheckedNoticeKey(remaining),
      params: { name, remaining },
      autoDismiss: !persist,
    };
  }
  return {
    tone: 'success',
    headingKey: 'list.noticeAddedToBasket',
    detailKey: 'list.noticeAddedDetail',
    params: { name },
    autoDismiss: !persist,
  };
}

export function addChecklistNoticeCopy(opts: {
  kind: AddChecklistNoticeKind | null | undefined;
  name: string;
  remaining?: number;
  listSynced?: boolean;
  offerMatch?: boolean;
}): AddChecklistNoticeView {
  return resolveAddChecklistNoticeView(opts);
}

export function previewUncheckedItems(
  items: readonly ShoppingListItem[] | null | undefined,
  limit = 3,
): ShoppingListItem[] {
  if (!Array.isArray(items)) return [];
  const cap = Number.isInteger(limit) && limit > 0 ? limit : 3;
  return items.filter((item) => item != null && item.checked !== true).slice(0, cap);
}

type CartLike = {
  items?: readonly {
    productId?: string | null;
    productName?: string | null;
    productCode?: string | null;
    quantity?: number;
  }[];
} | null | undefined;

export function basketProductsForMatch(cart: CartLike): BasketMatchProduct[] {
  const items = cart?.items;
  if (!Array.isArray(items)) return [];
  const out: BasketMatchProduct[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const productId = typeof item?.productId === 'string' ? item.productId.trim() : '';
    if (!productId) continue;
    const key = normaliseProductIdForMatch(productId);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const name =
      (typeof item.productName === 'string' && item.productName.trim()) ||
      (typeof item.productCode === 'string' && item.productCode.trim()) ||
      productId;
    const qty = Number(item.quantity);
    out.push({
      productId,
      name,
      quantity: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1,
    });
  }
  return out;
}

export function productStillInBasket(cart: CartLike, productId: unknown): boolean {
  const target = normaliseProductIdForMatch(productId);
  if (!target) return false;
  const items = cart?.items;
  if (!Array.isArray(items)) return false;
  return items.some((item) => normaliseProductIdForMatch(item?.productId) === target);
}

export type BasketMatchAvailability =
  | { status: 'unknown' }
  | { status: 'empty' }
  | { status: 'ready'; products: BasketMatchProduct[] };

export function basketAvailabilityForMatch(opts: {
  loading: boolean;
  error?: string | null;
  cart: CartLike;
}): BasketMatchAvailability {
  const products = basketProductsForMatch(opts.cart);
  if (products.length > 0) return { status: 'ready', products };
  if (opts.loading === true) return { status: 'unknown' };
  if (typeof opts.error === 'string' && opts.error.trim()) return { status: 'unknown' };
  if (opts.cart == null) return { status: 'unknown' };
  if (!Array.isArray(opts.cart.items)) return { status: 'unknown' };
  return { status: 'empty' };
}

export function shouldDiscardMatchSession(
  started: AccountScope | null | undefined,
  current: AccountScope,
): boolean {
  if (!started) return true;
  return !isCurrentAccountScope(started, current);
}

export function currentAccountScope(
  accountId: string | number | null | undefined,
  generation: number,
): AccountScope {
  return captureAccountScope(accountId == null ? null : String(accountId), generation);
}

export function evaluateManualMatchCommit(opts: {
  started: AccountScope;
  current: AccountScope;
  items: readonly ShoppingListItem[] | null | undefined;
  entryId: unknown;
  requireProductInBasket?: {
    productId: unknown;
    cart: CartLike;
    basketKnown: boolean;
  };
}): { ok: true; extraItemId: string } | { ok: false; reason: ManualMatchFailure } {
  if (!isCurrentAccountScope(opts.started, opts.current)) {
    return { ok: false, reason: 'stale_account' };
  }
  const id = typeof opts.entryId === 'string' ? opts.entryId.trim() : '';
  if (!id) return { ok: false, reason: 'entry_missing' };
  const list = Array.isArray(opts.items) ? opts.items : [];
  const item = list.find((row) => row.id === id);
  if (!item) return { ok: false, reason: 'entry_missing' };
  if (item.checked === true) return { ok: false, reason: 'entry_checked' };
  if (!isUncheckedManualItem(item)) return { ok: false, reason: 'entry_linked' };
  if (opts.requireProductInBasket) {
    if (opts.requireProductInBasket.basketKnown !== true) {
      return { ok: false, reason: 'basket_unknown' };
    }
    if (!productStillInBasket(opts.requireProductInBasket.cart, opts.requireProductInBasket.productId)) {
      return { ok: false, reason: 'product_missing' };
    }
  }
  return { ok: true, extraItemId: id };
}

// Save a manual tick. It never adds anything to the basket.
export async function persistConfirmedManualMatch(opts: {
  evaluation: { ok: true; extraItemId: string } | { ok: false; reason: ManualMatchFailure };
  markList: (extraItemId: string) => Promise<void>;
  addToBasket?: (productId: string, quantity?: number) => Promise<unknown>;
}): Promise<{ listMarked: boolean; basketPosted: boolean; reason?: ManualMatchFailure }> {
  if (!opts.evaluation.ok) {
    return { listMarked: false, basketPosted: false, reason: opts.evaluation.reason };
  }
  await opts.markList(opts.evaluation.extraItemId);
  return { listMarked: true, basketPosted: false };
}

export type ManualMatchStep = 'pick' | 'review';

export type MatchReviewPairing = {
  productLabel: string;
  noteLabel: string;
};

// Choosing a row only prepares the review; it is not saved yet.
export function matchStepAfterSelectingOption(): ManualMatchStep {
  return 'review';
}

export function matchStepAfterChangeSelection(): ManualMatchStep {
  return 'pick';
}

export function shouldCommitMatchConfirm(opts: {
  step: ManualMatchStep | null | undefined;
  busy: boolean;
  selectedId?: string | null;
}): boolean {
  if (opts.step !== 'review') return false;
  if (opts.busy === true) return false;
  return typeof opts.selectedId === 'string' && opts.selectedId.trim().length > 0;
}

export function buildMatchReviewPairing(opts: {
  productLabel?: string | null;
  noteLabel?: string | null;
}): MatchReviewPairing | null {
  const productLabel = typeof opts.productLabel === 'string' ? opts.productLabel.trim() : '';
  const noteLabel = typeof opts.noteLabel === 'string' ? opts.noteLabel.trim() : '';
  if (!productLabel || !noteLabel) return null;
  return { productLabel, noteLabel };
}

export function resolveAfterAddReviewNote(
  entries: readonly ManualMatchCandidate[] | null | undefined,
  selectedId: unknown,
): ManualMatchCandidate | null {
  const id = typeof selectedId === 'string' ? selectedId.trim() : '';
  if (!id || !Array.isArray(entries)) return null;
  return entries.find((row) => row.id === id) ?? null;
}

export function resolveBasketReviewProduct(
  products: readonly BasketMatchProduct[] | null | undefined,
  selectedProductId: unknown,
): BasketMatchProduct | null {
  const target = normaliseProductIdForMatch(selectedProductId);
  if (!target || !Array.isArray(products)) return null;
  return products.find((row) => normaliseProductIdForMatch(row.productId) === target) ?? null;
}

// Terminal failures that must not retry a list write.
export function shouldDismissMatchAfterFailure(reason: ManualMatchFailure | undefined): boolean {
  return (
    reason === 'stale_account' ||
    reason === 'entry_missing' ||
    reason === 'entry_checked' ||
    reason === 'entry_linked' ||
    reason === 'cancelled'
  );
}
