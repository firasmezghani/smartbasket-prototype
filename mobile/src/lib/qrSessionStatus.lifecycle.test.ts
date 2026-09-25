import test from 'node:test';
import assert from 'node:assert/strict';

import { captureAccountScope } from './accountScope.js';
import { createRequestGeneration } from './requestGeneration.js';
import {
  classifyRemoteSession,
  commitDisplayedQrSession,
  createQrStatusPoller,
  isForegroundAppState,
  qrPollResultWhenSessionMissing,
  retainTerminalAgainstRoute,
  runQrStatusPollTick,
  sessionSnapshotFromRoute,
  shouldPollQrStatus,
  type QrPolledSession,
  type QrRouteSessionParams,
} from './qrSessionStatus.js';

type Timer = { fn: () => void; ms: number; cancelled: boolean };

function createTimers() {
  const timers: Timer[] = [];
  return {
    timers,
    scheduler: {
      set: (fn: () => void, ms: number) => {
        const rec: Timer = { fn, ms, cancelled: false };
        timers.push(rec);
        return {
          cancel: () => {
            rec.cancelled = true;
          },
        };
      },
    },
    armed: () => timers.find((t) => !t.cancelled) ?? null,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const ROUTE: QrRouteSessionParams = {
  sessionId: 21,
  status: 'active',
  expiresAt: '2099-01-01T00:00:00.000Z',
  qrValue: 'SMART_BASKET:test-token-not-logged',
  itemCount: 2,
  uniqueProductCount: 2,
};

type LoopSession = QrPolledSession & { customerId?: number };

// Same setup as BasketQrScreen, without React.
function createScreenLikeLoop(opts: {
  fetchSession: (id: number) => Promise<LoopSession>;
  appState: () => string | null;
  focused: () => boolean;
  accountId?: string;
  generation?: number;
}) {
  const sessionRef: { current: LoopSession | null } = { current: null };
  const ui: { status: string | null; sessionId: number | null; refreshBasket: number } = {
    status: null,
    sessionId: null,
    refreshBasket: 0,
  };
  const networkErrors: number[] = [];
  const clock = createTimers();
  const generation = createRequestGeneration();
  const accountId = opts.accountId ?? '66';
  const accountGeneration = opts.generation ?? 1;
  const scope = () => captureAccountScope(accountId, accountGeneration);

  const applyIncoming = async (incoming: LoopSession) => {
    const displayed = sessionRef.current;
    if (!displayed) return;
    const kind = classifyRemoteSession({
      displayedSessionId: displayed.id,
      incomingId: incoming.id,
      incomingStatus: incoming.status,
      superseded: incoming.superseded === true,
    });
    if (kind === 'ignore') return;
    const next: LoopSession = kind === 'superseded' ? { ...incoming, superseded: true } : incoming;
    commitDisplayedQrSession(sessionRef, next);
    ui.status = next.status;
    ui.sessionId = next.id;
    if (next.status === 'validated') ui.refreshBasket += 1;
  };

  const pollOnce = () =>
    runQrStatusPollTick({
      displayed: sessionRef.current,
      generation,
      accountId,
      accountGeneration,
      latestDisplayed: () => sessionRef.current,
      currentScope: scope,
      fetchSession: opts.fetchSession,
      applyIncoming,
      onNetworkError: () => {
        networkErrors.push(Date.now());
      },
    });

  const poller = createQrStatusPoller({
    intervalMs: 3000,
    scheduler: clock.scheduler,
    shouldRun: () =>
      shouldPollQrStatus({
        focused: opts.focused(),
        appActive: isForegroundAppState(opts.appState()),
        status: sessionRef.current?.status,
      }),
    poll: pollOnce,
  });

  return { sessionRef, ui, poller, clock, networkErrors, applyIncoming };
}

test('author reproduction: first focus starts polling before React has flushed setSession', async () => {
  // Phone: generate QR and leave the screen open. Polling must start even
  // though sessionRef is still null on the first focus.
  const requests: Array<{ id: number; at: number }> = [];
  let serverStatus = 'active';
  let focused = true;
  const loop = createScreenLikeLoop({
    focused: () => focused,
    appState: () => null,
    fetchSession: async (id) => {
      requests.push({ id, at: requests.length });
      return { id, status: serverStatus };
    },
  });

  assert.equal(qrPollResultWhenSessionMissing(), 'ok');
  assert.notEqual(qrPollResultWhenSessionMissing(), 'stop');

  // useFocusEffect: setSession(seed) then poller.start() before the commit.
  loop.poller.start();
  await flush();
  assert.equal(requests.length, 0);
  const firstArm = loop.clock.armed();
  assert.ok(firstArm, 'missing session must retry, not permanently stop');
  assert.equal(firstArm?.ms, 3000);

  const seeded = sessionSnapshotFromRoute(ROUTE, 66);
  assert.ok(seeded);
  commitDisplayedQrSession(loop.sessionRef, seeded);
  loop.ui.status = seeded?.status ?? null;
  loop.ui.sessionId = seeded?.id ?? null;

  firstArm?.fn();
  await flush();
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.id, 21);
  assert.equal(loop.ui.status, 'active');

  const secondArm = loop.clock.armed();
  assert.ok(secondArm);
  assert.equal(secondArm?.ms, 3000);

  serverStatus = 'validated';
  secondArm?.fn();
  await flush();
  assert.equal(requests.length, 2);
  assert.equal(loop.ui.status, 'validated');
  assert.equal(loop.ui.refreshBasket, 1);
  assert.equal(loop.clock.armed(), null, 'terminal approval must stop polling');

  focused = false;
  loop.poller.stop();
});

test('unknown AppState does not disable a focused pending session poll', async () => {
  assert.equal(isForegroundAppState(null), true);
  assert.equal(isForegroundAppState('unknown'), true);
  assert.equal(isForegroundAppState('inactive'), true);
  assert.equal(isForegroundAppState('active'), true);
  assert.equal(isForegroundAppState('background'), false);
  assert.equal(
    shouldPollQrStatus({
      focused: true,
      appActive: isForegroundAppState(null),
      status: 'active',
    }),
    true,
  );
  assert.equal(
    shouldPollQrStatus({
      focused: true,
      appActive: isForegroundAppState('background'),
      status: 'active',
    }),
    false,
  );

  const requests: number[] = [];
  const loop = createScreenLikeLoop({
    focused: () => true,
    appState: () => 'unknown',
    fetchSession: async (id) => {
      requests.push(id);
      return { id, status: 'active' };
    },
  });
  commitDisplayedQrSession(loop.sessionRef, sessionSnapshotFromRoute(ROUTE, 66));
  loop.poller.start();
  await flush();
  assert.equal(requests.length, 1);
  assert.ok(loop.clock.armed());
});

test('seeding the displayed session before start fetches immediately and applies rejection', async () => {
  let serverStatus = 'active';
  const requests: number[] = [];
  const loop = createScreenLikeLoop({
    focused: () => true,
    appState: () => 'active',
    fetchSession: async (id) => {
      requests.push(id);
      return { id, status: serverStatus };
    },
  });
  commitDisplayedQrSession(loop.sessionRef, sessionSnapshotFromRoute(ROUTE, 66));
  loop.ui.status = 'active';
  loop.ui.sessionId = 21;
  loop.poller.start();
  await flush();
  assert.equal(requests.length, 1);
  serverStatus = 'rejected';
  loop.clock.armed()?.fn();
  await flush();
  assert.equal(requests.length, 2);
  assert.equal(loop.ui.status, 'rejected');
  assert.equal(loop.ui.refreshBasket, 0, 'rejection must not clear or refresh the basket');
  assert.equal(loop.clock.armed(), null);
});

test('focus-effect restart during an in-flight poll still schedules the next request', async () => {
  let release!: () => void;
  const first = new Promise<void>((resolve) => {
    release = resolve;
  });
  let polls = 0;
  const loop = createScreenLikeLoop({
    focused: () => true,
    appState: () => 'active',
    fetchSession: async (id) => {
      polls += 1;
      if (polls === 1) await first;
      return { id, status: 'active' };
    },
  });
  commitDisplayedQrSession(loop.sessionRef, sessionSnapshotFromRoute(ROUTE, 66));
  loop.poller.start();
  await flush();
  assert.equal(loop.poller.inFlight, true);

  // useFocusEffect cleanup and re-run when the callback identity changes.
  loop.poller.stop();
  loop.poller.start();
  release();
  await flush();
  await flush();
  const follow = loop.clock.armed();
  assert.ok(follow, 'in-flight poll must not leave the loop disarmed after a focus restart');
  assert.equal(follow?.ms, 3000);
  follow?.fn();
  await flush();
  assert.equal(polls, 2);
});

test('blur, background and terminal states stop; resume fetches immediately', async () => {
  const requests: number[] = [];
  let focused = true;
  let appState: string | null = 'active';
  const loop = createScreenLikeLoop({
    focused: () => focused,
    appState: () => appState,
    fetchSession: async (id) => {
      requests.push(id);
      return { id, status: 'active' };
    },
  });
  commitDisplayedQrSession(loop.sessionRef, sessionSnapshotFromRoute(ROUTE, 66));
  loop.poller.start();
  await flush();
  assert.equal(requests.length, 1);

  focused = false;
  loop.poller.stop();
  loop.clock.armed()?.fn();
  await flush();
  assert.equal(requests.length, 1);

  focused = true;
  appState = 'active';
  await loop.poller.checkNow();
  assert.equal(requests.length, 2);

  appState = 'background';
  loop.poller.stop();
  const beforeBackground = requests.length;
  loop.clock.armed()?.fn();
  await flush();
  assert.equal(requests.length, beforeBackground);

  appState = 'active';
  await loop.poller.checkNow();
  assert.equal(requests.length, beforeBackground + 1);
});

test('account-generation change still discards the in-flight response', async () => {
  const generation = createRequestGeneration();
  const sessionRef: { current: LoopSession | null } = {
    current: { id: 21, status: 'active' },
  };
  let applied = 0;
  let currentGeneration = 1;
  const startedScope = captureAccountScope('66', 1);
  const result = await runQrStatusPollTick({
    displayed: sessionRef.current,
    generation,
    accountId: '66',
    accountGeneration: 1,
    latestDisplayed: () => sessionRef.current,
    currentScope: () => captureAccountScope('66', currentGeneration),
    fetchSession: async (id) => {
      currentGeneration = 2;
      return { id, status: 'validated' };
    },
    applyIncoming: async () => {
      applied += 1;
    },
  });
  assert.equal(result, 'fail');
  assert.equal(applied, 0);
  assert.equal(sessionRef.current?.status, 'active');
  assert.equal(startedScope.generation, 1);
});

test('route params do not overwrite a confirmed terminal status after a poll update', () => {
  const displayed = { id: 21, status: 'validated' };
  const keep = retainTerminalAgainstRoute({
    confirmedSessionId: displayed.id,
    confirmedStatus: displayed.status,
    routeSessionId: ROUTE.sessionId,
    routeStatus: ROUTE.status,
  });
  assert.equal(keep, true);
  const seeded = sessionSnapshotFromRoute(ROUTE, 66);
  const next = keep ? displayed : seeded;
  assert.equal(next?.status, 'validated');
});
