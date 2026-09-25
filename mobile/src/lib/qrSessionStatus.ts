// Polling of the QR status while the QR screen is open and the app is in front.

import { captureAccountScope, isCurrentAccountScope, type AccountScope } from './accountScope';
import { createRequestGeneration, type RequestGeneration } from './requestGeneration';

export const QR_STATUS_POLL_MS = 3000;
export const QR_STATUS_BACKOFF_CAP_MS = 15000;

const TERMINAL = new Set(['validated', 'rejected', 'cancelled', 'expired']);

export function isTerminalSessionStatus(status: unknown): boolean {
  return TERMINAL.has(String(status ?? '').trim().toLowerCase());
}

// Only a background app stops polling (the start-up state can be unknown).
export function isForegroundAppState(state: string | null | undefined): boolean {
  return String(state ?? '').trim().toLowerCase() !== 'background';
}

export function shouldPollQrStatus(opts: {
  focused: boolean;
  appActive: boolean;
  status: string | null | undefined;
}): boolean {
  return opts.focused === true && opts.appActive === true && !isTerminalSessionStatus(opts.status);
}

// If the session is not set yet, try again on the next tick instead of stopping.
export function qrPollResultWhenSessionMissing(): 'ok' {
  return 'ok';
}

export type QrRouteSessionParams = {
  sessionId: number;
  status: string;
  expiresAt: string;
  qrValue?: string;
  itemCount: number;
  uniqueProductCount: number;
};

export type QrSessionSeed = {
  id: number;
  customerId: number;
  status: string;
  expiresAt: string;
  createdAt: string;
  validatedAt: null;
  rejectedAt: null;
  cancelledAt: null;
  validationNote: null;
  itemCount: number;
  uniqueProductCount: number;
};

// Seed the displayed session from route params so the first poll tick has an id.
export function sessionSnapshotFromRoute(
  params: QrRouteSessionParams | null | undefined,
  customerId: number | null | undefined,
): QrSessionSeed | null {
  if (!params || customerId == null) return null;
  const id = Number(params.sessionId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const owner = Number(customerId);
  if (!Number.isInteger(owner) || owner <= 0) return null;
  return {
    id,
    customerId: owner,
    status: String(params.status ?? 'active'),
    expiresAt: params.expiresAt,
    createdAt: params.expiresAt,
    validatedAt: null,
    rejectedAt: null,
    cancelledAt: null,
    validationNote: null,
    itemCount: params.itemCount,
    uniqueProductCount: params.uniqueProductCount,
  };
}

// Store the session before starting the poller.
export function commitDisplayedQrSession<T>(
  sessionRef: { current: T | null },
  next: T | null,
): T | null {
  sessionRef.current = next;
  return sessionRef.current;
}

export function isStaleQrStatusResponse(opts: {
  requestId: number;
  currentRequestId: number;
  requestedSessionId: number;
  displayedSessionId: number;
  startedScope: AccountScope;
  currentScope: AccountScope;
}): boolean {
  if (opts.requestId !== opts.currentRequestId) return true;
  if (!isCurrentAccountScope(opts.startedScope, opts.currentScope)) return true;
  if (opts.requestedSessionId !== opts.displayedSessionId) return true;
  return false;
}

// Route params must not revive a confirmed terminal state as active.
export function retainTerminalAgainstRoute(opts: {
  confirmedSessionId: number | null | undefined;
  confirmedStatus: string | null | undefined;
  routeSessionId: number;
  routeStatus: string | null | undefined;
}): boolean {
  return (
    Number(opts.confirmedSessionId) === Number(opts.routeSessionId) &&
    isTerminalSessionStatus(opts.confirmedStatus) &&
    !isTerminalSessionStatus(opts.routeStatus)
  );
}

export function classifyRemoteSession(opts: {
  displayedSessionId: number;
  incomingId: number;
  incomingStatus: string;
  superseded?: boolean;
}): 'apply' | 'ignore' | 'superseded' {
  if (Number(opts.incomingId) !== Number(opts.displayedSessionId)) return 'ignore';
  if (opts.superseded === true) return 'superseded';
  return 'apply';
}

export function hideUsableQr(opts: {
  status: string | null | undefined;
  remainingSeconds: number;
  qrValue: string;
}): boolean {
  if (isTerminalSessionStatus(opts.status)) return true;
  if (opts.remainingSeconds <= 0) return true;
  const value = String(opts.qrValue ?? '').trim();
  return !(value.length > 16 && value.includes(':'));
}

export function nextPollDelayMs(consecutiveFailures: number, baseMs = QR_STATUS_POLL_MS): number {
  const n = Math.max(0, Number(consecutiveFailures) || 0);
  const delay = baseMs * 2 ** Math.min(n, 3);
  return Math.min(delay, QR_STATUS_BACKOFF_CAP_MS);
}

export function shouldAnnounceTerminal(opts: {
  sessionId: number;
  status: string;
  lastAnnounced: { sessionId: number; status: string } | null;
}): boolean {
  if (!isTerminalSessionStatus(opts.status)) return false;
  if (
    opts.lastAnnounced &&
    opts.lastAnnounced.sessionId === opts.sessionId &&
    opts.lastAnnounced.status === opts.status
  ) {
    return false;
  }
  return true;
}

export type QrPollResult = 'ok' | 'fail' | 'stop';

export type QrPolledSession = {
  id: number;
  status: string;
  superseded?: boolean;
};

// One poll step (separate so it can be tested).
export async function runQrStatusPollTick<T extends QrPolledSession>(opts: {
  displayed: T | null;
  generation: RequestGeneration;
  accountId: string | null;
  accountGeneration: number;
  latestDisplayed: () => T | null;
  currentScope: () => AccountScope;
  fetchSession: (id: number) => Promise<T>;
  applyIncoming: (incoming: T) => Promise<void> | void;
  onNetworkError?: () => void;
}): Promise<QrPollResult> {
  const displayed = opts.displayed;
  if (!displayed) return qrPollResultWhenSessionMissing();
  const started = beginQrStatusRequest(opts.generation, opts.accountId, opts.accountGeneration);
  const stale = () =>
    isStaleQrStatusResponse({
      requestId: started.requestId,
      currentRequestId: opts.generation.current(),
      requestedSessionId: displayed.id,
      displayedSessionId: opts.latestDisplayed()?.id ?? displayed.id,
      startedScope: started.startedScope,
      currentScope: opts.currentScope(),
    });
  try {
    const incoming = await opts.fetchSession(displayed.id);
    if (stale()) return 'fail';
    await opts.applyIncoming(incoming);
    const latest = opts.latestDisplayed() ?? incoming;
    if (isTerminalSessionStatus(latest.status) || latest.superseded === true || incoming.superseded) {
      return 'stop';
    }
    return 'ok';
  } catch {
    if (stale()) return 'fail';
    opts.onNetworkError?.();
    return 'fail';
  }
}

export type QrPollScheduler = {
  set: (fn: () => void, ms: number) => { cancel: () => void };
};

export function createQrStatusPoller(opts: {
  intervalMs?: number;
  backoffMs?: (failures: number) => number;
  shouldRun: () => boolean;
  poll: () => Promise<QrPollResult>;
  scheduler?: QrPollScheduler;
}): {
  checkNow: () => Promise<void>;
  start: () => void;
  stop: () => void;
  get inFlight(): boolean;
} {
  const intervalMs = opts.intervalMs ?? QR_STATUS_POLL_MS;
  const backoff = opts.backoffMs ?? nextPollDelayMs;
  const schedule: QrPollScheduler =
    opts.scheduler ??
    {
      set: (fn, ms) => {
        const id = setTimeout(fn, ms);
        return { cancel: () => clearTimeout(id) };
      },
    };

  let inFlight = false;
  let stopped = true;
  let handle: { cancel: () => void } | null = null;
  let failures = 0;

  const arm = (ms: number) => {
    handle?.cancel();
    handle = null;
    if (stopped) return;
    handle = schedule.set(() => {
      void tick();
    }, ms);
  };

  const tick = async () => {
    if (stopped || inFlight) return;
    if (!opts.shouldRun()) {
      stopped = true;
      handle?.cancel();
      handle = null;
      return;
    }
    inFlight = true;
    let result: QrPollResult = 'fail';
    try {
      result = await opts.poll();
    } catch {
      result = 'fail';
    } finally {
      inFlight = false;
    }
    if (result === 'stop') {
      stopped = true;
      handle?.cancel();
      handle = null;
      failures = 0;
      return;
    }
    if (result === 'fail') failures += 1;
    else failures = 0;
    if (!stopped) arm(failures > 0 ? backoff(failures) : intervalMs);
  };

  return {
    checkNow: async () => {
      stopped = false;
      await tick();
    },
    start: () => {
      stopped = false;
      void tick();
    },
    stop: () => {
      stopped = true;
      handle?.cancel();
      handle = null;
    },
    get inFlight() {
      return inFlight;
    },
  };
}

export function beginQrStatusRequest(
  generation: RequestGeneration,
  accountId: string | null,
  accountGeneration: number,
): { requestId: number; startedScope: AccountScope } {
  return {
    requestId: generation.next(),
    startedScope: captureAccountScope(accountId, accountGeneration),
  };
}

export { createRequestGeneration, captureAccountScope, isCurrentAccountScope };
