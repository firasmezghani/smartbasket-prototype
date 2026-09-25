import test from 'node:test';
import assert from 'node:assert/strict';

import { captureAccountScope } from './accountScope.js';
import { createRequestGeneration } from './requestGeneration.js';
import {
  QR_STATUS_POLL_MS,
  beginQrStatusRequest,
  classifyRemoteSession,
  createQrStatusPoller,
  hideUsableQr,
  isStaleQrStatusResponse,
  isTerminalSessionStatus,
  nextPollDelayMs,
  retainTerminalAgainstRoute,
  shouldAnnounceTerminal,
  shouldPollQrStatus,
  isForegroundAppState,
  qrPollResultWhenSessionMissing,
  sessionSnapshotFromRoute,
} from './qrSessionStatus.js';

test('launch AppState values keep a focused pending session pollable', () => {
  assert.equal(isForegroundAppState(null), true);
  assert.equal(isForegroundAppState('unknown'), true);
  assert.equal(isForegroundAppState('inactive'), true);
  assert.equal(isForegroundAppState('background'), false);
  assert.equal(qrPollResultWhenSessionMissing(), 'ok');
  const seed = sessionSnapshotFromRoute(
    {
      sessionId: 21,
      status: 'active',
      expiresAt: '2099-01-01T00:00:00.000Z',
      itemCount: 1,
      uniqueProductCount: 1,
    },
    66,
  );
  assert.equal(seed?.id, 21);
  assert.equal(seed?.customerId, 66);
  assert.equal(sessionSnapshotFromRoute(null, 66), null);
});

test('terminal statuses stop polling', () => {
  assert.equal(isTerminalSessionStatus('validated'), true);
  assert.equal(isTerminalSessionStatus('rejected'), true);
  assert.equal(isTerminalSessionStatus('cancelled'), true);
  assert.equal(isTerminalSessionStatus('expired'), true);
  assert.equal(isTerminalSessionStatus('active'), false);
  assert.equal(
    shouldPollQrStatus({ focused: true, appActive: true, status: 'active' }),
    true,
  );
  assert.equal(
    shouldPollQrStatus({ focused: true, appActive: true, status: 'validated' }),
    false,
  );
  assert.equal(
    shouldPollQrStatus({ focused: false, appActive: true, status: 'active' }),
    false,
  );
  assert.equal(
    shouldPollQrStatus({ focused: true, appActive: false, status: 'active' }),
    false,
  );
});

test('stale responses after account-generation or session changes are ignored', () => {
  const a = captureAccountScope('63', 1);
  const b = captureAccountScope('63', 2);
  const same = captureAccountScope('63', 1);
  assert.equal(
    isStaleQrStatusResponse({
      requestId: 1,
      currentRequestId: 1,
      requestedSessionId: 10,
      displayedSessionId: 10,
      startedScope: a,
      currentScope: same,
    }),
    false,
  );
  assert.equal(
    isStaleQrStatusResponse({
      requestId: 1,
      currentRequestId: 2,
      requestedSessionId: 10,
      displayedSessionId: 10,
      startedScope: a,
      currentScope: same,
    }),
    true,
  );
  assert.equal(
    isStaleQrStatusResponse({
      requestId: 1,
      currentRequestId: 1,
      requestedSessionId: 10,
      displayedSessionId: 11,
      startedScope: a,
      currentScope: same,
    }),
    true,
  );
  assert.equal(
    isStaleQrStatusResponse({
      requestId: 1,
      currentRequestId: 1,
      requestedSessionId: 10,
      displayedSessionId: 10,
      startedScope: a,
      currentScope: b,
    }),
    true,
  );
});

test('route params do not reset a confirmed terminal state to active', () => {
  assert.equal(
    retainTerminalAgainstRoute({
      confirmedSessionId: 13,
      confirmedStatus: 'validated',
      routeSessionId: 13,
      routeStatus: 'active',
    }),
    true,
  );
  assert.equal(
    retainTerminalAgainstRoute({
      confirmedSessionId: 13,
      confirmedStatus: 'active',
      routeSessionId: 13,
      routeStatus: 'active',
    }),
    false,
  );
});

test('another session id is ignored rather than mixed into the displayed QR', () => {
  assert.equal(
    classifyRemoteSession({ displayedSessionId: 10, incomingId: 11, incomingStatus: 'active' }),
    'ignore',
  );
  assert.equal(
    classifyRemoteSession({
      displayedSessionId: 10,
      incomingId: 10,
      incomingStatus: 'cancelled',
      superseded: true,
    }),
    'superseded',
  );
  assert.equal(
    classifyRemoteSession({ displayedSessionId: 10, incomingId: 10, incomingStatus: 'validated' }),
    'apply',
  );
});

test('local expiry hides the usable QR even before the server round-trip', () => {
  assert.equal(
    hideUsableQr({
      status: 'active',
      remainingSeconds: 0,
      qrValue: 'SMART_BASKET:abcdefghijklmnopqrstuvwxyz012345',
    }),
    true,
  );
  assert.equal(
    hideUsableQr({
      status: 'active',
      remainingSeconds: 12,
      qrValue: 'SMART_BASKET:abcdefghijklmnopqrstuvwxyz012345',
    }),
    false,
  );
  assert.equal(
    hideUsableQr({
      status: 'validated',
      remainingSeconds: 12,
      qrValue: 'SMART_BASKET:abcdefghijklmnopqrstuvwxyz012345',
    }),
    true,
  );
});

test('terminal outcomes are announced once per session status', () => {
  assert.equal(
    shouldAnnounceTerminal({ sessionId: 1, status: 'validated', lastAnnounced: null }),
    true,
  );
  assert.equal(
    shouldAnnounceTerminal({
      sessionId: 1,
      status: 'validated',
      lastAnnounced: { sessionId: 1, status: 'validated' },
    }),
    false,
  );
  assert.equal(
    shouldAnnounceTerminal({
      sessionId: 1,
      status: 'rejected',
      lastAnnounced: { sessionId: 1, status: 'validated' },
    }),
    true,
  );
  assert.equal(shouldAnnounceTerminal({ sessionId: 1, status: 'active', lastAnnounced: null }), false);
});

test('network failures back off from the three-second interval', () => {
  assert.equal(QR_STATUS_POLL_MS, 3000);
  assert.equal(nextPollDelayMs(0), 3000);
  assert.equal(nextPollDelayMs(1), 6000);
  assert.equal(nextPollDelayMs(2), 12000);
  assert.equal(nextPollDelayMs(8), 15000);
});

test('local expiry hides the QR but a later approved status still applies', () => {
  assert.equal(
    hideUsableQr({
      status: 'active',
      remainingSeconds: 0,
      qrValue: 'SMART_BASKET:abcdefghijklmnopqrstuvwxyz012345',
    }),
    true,
  );
  assert.equal(isTerminalSessionStatus('active'), false);
  assert.equal(
    classifyRemoteSession({
      displayedSessionId: 10,
      incomingId: 10,
      incomingStatus: 'validated',
    }),
    'apply',
  );
  assert.equal(
    classifyRemoteSession({
      displayedSessionId: 10,
      incomingId: 10,
      incomingStatus: 'rejected',
    }),
    'apply',
  );
});

test('poller does not overlap requests, stops on terminal, and cancels on stop', async () => {
  const timers: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
  const scheduler = {
    set: (fn: () => void, ms: number) => {
      const rec = { fn, ms, cancelled: false };
      timers.push(rec);
      return {
        cancel: () => {
          rec.cancelled = true;
        },
      };
    },
  };
  let polls = 0;
  let release!: () => void;
  const first = new Promise<void>((resolve) => {
    release = resolve;
  });
  const poller = createQrStatusPoller({
    intervalMs: 3000,
    shouldRun: () => true,
    scheduler,
    poll: async () => {
      polls += 1;
      if (polls === 1) await first;
      return polls >= 2 ? 'stop' : 'ok';
    },
  });
  const started = poller.checkNow();
  assert.equal(poller.inFlight, true);
  await poller.checkNow();
  assert.equal(polls, 1);
  release();
  await started;
  assert.equal(polls, 1);
  const follow = timers.find((t) => !t.cancelled);
  assert.ok(follow);
  assert.equal(follow?.ms, 3000);
  follow?.fn();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(polls, 2);
  poller.stop();
  assert.equal(timers.every((t) => t.cancelled || polls >= 2), true);
});

test('poller pauses when shouldRun becomes false (background) and resumes with checkNow', async () => {
  let focused = true;
  let polls = 0;
  const timers: Array<{ fn: () => void; cancelled: boolean }> = [];
  const poller = createQrStatusPoller({
    intervalMs: 3000,
    shouldRun: () => focused,
    scheduler: {
      set: (fn) => {
        const rec = { fn, cancelled: false };
        timers.push(rec);
        return {
          cancel: () => {
            rec.cancelled = true;
          },
        };
      },
    },
    poll: async () => {
      polls += 1;
      return 'ok';
    },
  });
  await poller.checkNow();
  assert.equal(polls, 1);
  focused = false;
  const armed = timers.find((t) => !t.cancelled);
  armed?.fn();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(polls, 1);
  focused = true;
  await poller.checkNow();
  assert.equal(polls, 2);
});

test('failed polls keep the last confirmed state by not replacing status in the helper', () => {
  const generation = createRequestGeneration();
  const started = beginQrStatusRequest(generation, '63', 1);
  const stale = isStaleQrStatusResponse({
    requestId: started.requestId,
    currentRequestId: generation.current(),
    requestedSessionId: 10,
    displayedSessionId: 10,
    startedScope: started.startedScope,
    currentScope: captureAccountScope('63', 1),
  });
  assert.equal(stale, false);
  generation.next();
  assert.equal(
    isStaleQrStatusResponse({
      requestId: started.requestId,
      currentRequestId: generation.current(),
      requestedSessionId: 10,
      displayedSessionId: 10,
      startedScope: started.startedScope,
      currentScope: captureAccountScope('63', 1),
    }),
    true,
  );
});

test('beginQrStatusRequest captures account scope', () => {
  const generation = createRequestGeneration();
  const started = beginQrStatusRequest(generation, '63', 4);
  assert.equal(started.startedScope.accountId, '63');
  assert.equal(started.startedScope.generation, 4);
  assert.equal(started.requestId, 1);
});
