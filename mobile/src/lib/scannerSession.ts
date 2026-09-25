import { captureAccountScope, isCurrentAccountScope, type AccountScope } from './accountScope';
import { createRequestGeneration, type RequestGeneration } from './requestGeneration';
import { normaliseProductIdForMatch } from './shoppingListBatch';

export type ScannerMode = 'browse' | 'checklist';
export type ScannerPhase = 'scan' | 'lookup' | 'result' | 'error';

// Serializable Home-stack param so each checklist visit is a fresh session.
export function createChecklistScanSessionId(): string {
  return `cls-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isChecklistScanSessionId(value: unknown): boolean {
  return typeof value === 'string' && /^cls-\d+-[a-z0-9]+$/i.test(value.trim());
}

export function normaliseChecklistTargetItemId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const id = value.trim();
  return id.length > 0 && id.length <= 80 ? id : undefined;
}

export function normaliseExpectedProductId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const id = value.trim();
  return id.length > 0 && id.length <= 128 ? id : undefined;
}

export type ChecklistScanParams = {
  sessionId: string;
  targetItemId?: string;
  expectedProductId?: string;
};

// Fresh serialisable checklist session; optional row and expected product id.
export function createChecklistScanParams(
  targetItemId?: string,
  expectedProductId?: string,
): ChecklistScanParams {
  const sessionId = createChecklistScanSessionId();
  const extra = normaliseChecklistTargetItemId(targetItemId);
  const expected = normaliseExpectedProductId(expectedProductId);
  const params: ChecklistScanParams = { sessionId };
  if (extra) params.targetItemId = extra;
  if (expected) params.expectedProductId = expected;
  return params;
}

export function shouldShowScanDiagnostics(envValue: string | undefined | null): boolean {
  const v = typeof envValue === 'string' ? envValue.trim().toLowerCase() : '';
  return v === '1' || v === 'true' || v === 'yes';
}

// Only one camera preview can run; stop it when the screen is hidden or busy.
export function shouldRenderCameraPreview(opts: {
  isFocused: boolean;
  appActive: boolean;
  phase: ScannerPhase;
  cameraGranted: boolean;
  processing: boolean;
  // Live CameraView blocks the iOS software keyboard; unmount while typing.
  inputFocused?: boolean;
}): boolean {
  return (
    opts.isFocused === true &&
    opts.appActive === true &&
    opts.phase === 'scan' &&
    opts.cameraGranted === true &&
    opts.processing !== true &&
    opts.inputFocused !== true
  );
}

export function shouldCommitAsyncResult(opts: {
  closed: boolean;
  generationCurrent: boolean;
  sessionId: string;
  resultSessionId: string;
}): boolean {
  return (
    opts.closed !== true &&
    opts.generationCurrent === true &&
    opts.sessionId === opts.resultSessionId
  );
}

export function shouldReturnToChecklistAfterAdd(opts: {
  mode: ScannerMode;
  closed: boolean;
  generationCurrent: boolean;
  basketAdded: boolean;
}): boolean {
  return (
    opts.mode === 'checklist' &&
    opts.basketAdded === true &&
    opts.closed !== true &&
    opts.generationCurrent === true
  );
}

export function shouldDisableAddSubmit(opts: {
  productId: string | null | undefined;
  adding: boolean;
  alreadyAdded: boolean;
  unresolved?: boolean;
}): boolean {
  return (
    !opts.productId ||
    opts.adding === true ||
    opts.alreadyAdded === true ||
    opts.unresolved === true
  );
}

export type CartLineQuantity = {
  productId: string;
  quantity: number;
};

export type AmbiguousAddRefresh =
  | { status: 'ok'; items: readonly CartLineQuantity[] }
  | { status: 'failed' };

// Check that the quantity actually increased by the expected amount.
export function quantityOfProduct(
  items: readonly CartLineQuantity[] | null | undefined,
  productId: string,
): number {
  const target = normaliseProductIdForMatch(productId);
  if (!target || !items) return 0;
  let total = 0;
  for (const item of items) {
    if (normaliseProductIdForMatch(item.productId) !== target) continue;
    const qty = Number(item.quantity);
    if (Number.isFinite(qty) && qty > 0) total += qty;
  }
  return total;
}

export type AmbiguousAddDecision =
  | { kind: 'unresolved'; reason: 'refresh_failed'; allowRepeatAdd: false }
  | {
      kind: 'observed_expected_quantity';
      quantity: number;
      allowRepeatAdd: false;
      certainty: 'basket_state_only';
    }
  | {
      kind: 'quantity_not_confirmed';
      currentQuantity: number;
      allowRepeatAdd: false;
    };

// After an unclear network error, do not send the add again.
export function nextActionAfterAmbiguousAdd(opts: {
  productId: string;
  preQuantity: number;
  intendedDelta: number;
  refresh: AmbiguousAddRefresh;
}): AmbiguousAddDecision {
  if (opts.refresh.status === 'failed') {
    return { kind: 'unresolved', reason: 'refresh_failed', allowRepeatAdd: false };
  }
  const delta =
    Number.isFinite(opts.intendedDelta) && opts.intendedDelta > 0 ? opts.intendedDelta : 1;
  const pre = Number.isFinite(opts.preQuantity) && opts.preQuantity > 0 ? opts.preQuantity : 0;
  const current = quantityOfProduct(opts.refresh.items, opts.productId);
  if (current >= pre + delta) {
    return {
      kind: 'observed_expected_quantity',
      quantity: current,
      allowRepeatAdd: false,
      certainty: 'basket_state_only',
    };
  }
  return { kind: 'quantity_not_confirmed', currentQuantity: current, allowRepeatAdd: false };
}

// The Scan tab (`browse`) must never carry a checklist return destination.
export function isChecklistReturnMode(mode: ScannerMode): boolean {
  return mode === 'checklist';
}

export type ScannerOperation = {
  lookupToken: number;
  addToken: number;
  sessionToken: number;
  account: AccountScope;
  sessionId: string;
};

export type ScannerSessionGuard = {
  sessionId: string;
  beginLookup: (account: AccountScope) => ScannerOperation;
  beginAdd: (account: AccountScope) => ScannerOperation;
  invalidateBlur: () => void;
  invalidateAccount: () => void;
  invalidateAll: () => void;
  isLookupCurrent: (op: ScannerOperation, currentAccount: AccountScope, closed: boolean) => boolean;
  isAddSideEffectCurrent: (
    op: ScannerOperation,
    currentAccount: AccountScope,
    closed: boolean,
  ) => boolean;
  isAddGenerationCurrent: (op: ScannerOperation) => boolean;
};

function tokensCurrent(
  gen: RequestGeneration,
  token: number,
  sessionGen: RequestGeneration,
  sessionToken: number,
  started: AccountScope,
  currentAccount: AccountScope,
): boolean {
  return (
    gen.isCurrent(token) &&
    sessionGen.isCurrent(sessionToken) &&
    isCurrentAccountScope(started, currentAccount)
  );
}

// Cancel lookups when the screen is left or the account changes.
export function createScannerSessionGuard(sessionId: string): ScannerSessionGuard {
  const lookupGen = createRequestGeneration();
  const addGen = createRequestGeneration();
  const sessionGen = createRequestGeneration();
  sessionGen.next();

  return {
    sessionId,
    beginLookup(account) {
      return {
        lookupToken: lookupGen.next(),
        addToken: addGen.current(),
        sessionToken: sessionGen.current(),
        account: captureAccountScope(account.accountId, account.generation),
        sessionId,
      };
    },
    beginAdd(account) {
      return {
        lookupToken: lookupGen.current(),
        addToken: addGen.next(),
        sessionToken: sessionGen.current(),
        account: captureAccountScope(account.accountId, account.generation),
        sessionId,
      };
    },
    invalidateBlur() {
      lookupGen.next();
      sessionGen.next();
    },
    invalidateAccount() {
      lookupGen.next();
      addGen.next();
      sessionGen.next();
    },
    invalidateAll() {
      lookupGen.next();
      addGen.next();
      sessionGen.next();
    },
    isLookupCurrent(op, currentAccount, closed) {
      return shouldCommitAsyncResult({
        closed,
        generationCurrent: tokensCurrent(
          lookupGen,
          op.lookupToken,
          sessionGen,
          op.sessionToken,
          op.account,
          currentAccount,
        ),
        sessionId,
        resultSessionId: op.sessionId,
      });
    },
    isAddSideEffectCurrent(op, currentAccount, closed) {
      return shouldCommitAsyncResult({
        closed,
        generationCurrent: tokensCurrent(
          addGen,
          op.addToken,
          sessionGen,
          op.sessionToken,
          op.account,
          currentAccount,
        ),
        sessionId,
        resultSessionId: op.sessionId,
      });
    },
    isAddGenerationCurrent(op) {
      return addGen.isCurrent(op.addToken);
    },
  };
}
