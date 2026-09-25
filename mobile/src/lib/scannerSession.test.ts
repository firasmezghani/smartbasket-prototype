import test from 'node:test';
import assert from 'node:assert/strict';

import { createRequestGeneration } from './requestGeneration';
import { captureAccountScope, isCurrentAccountScope } from './accountScope';
import {
  createChecklistScanParams,
  createChecklistScanSessionId,
  isChecklistReturnMode,
  isChecklistScanSessionId,
  nextActionAfterAmbiguousAdd,
  quantityOfProduct,
  shouldCommitAsyncResult,
  shouldDisableAddSubmit,
  shouldRenderCameraPreview,
  shouldReturnToChecklistAfterAdd,
  shouldShowScanDiagnostics,
} from './scannerSession';

test('checklist session ids are serialisable and distinct', () => {
  const a = createChecklistScanSessionId();
  const b = createChecklistScanSessionId();
  assert.notEqual(a, b);
  assert.equal(isChecklistScanSessionId(a), true);
  assert.equal(isChecklistScanSessionId('browse'), false);
  assert.equal(isChecklistScanSessionId({}), false);
});

test('checklist scan params carry an optional target row without selecting one by default', () => {
  const general = createChecklistScanParams();
  assert.equal(isChecklistScanSessionId(general.sessionId), true);
  assert.equal('targetItemId' in general, false);
  assert.equal('expectedProductId' in general, false);
  const targeted = createChecklistScanParams('  row-eggs  ');
  assert.equal(targeted.targetItemId, 'row-eggs');
  assert.equal('expectedProductId' in targeted, false);
  assert.notEqual(targeted.sessionId, general.sessionId);
  assert.equal(createChecklistScanParams('').targetItemId, undefined);
  assert.equal(createChecklistScanParams('   ').targetItemId, undefined);
  const linked = createChecklistScanParams('row-milk', '  SKU-9  ');
  assert.equal(linked.targetItemId, 'row-milk');
  assert.equal(linked.expectedProductId, 'SKU-9');
  assert.equal(createChecklistScanParams('row', '   ').expectedProductId, undefined);
});

test('scan diagnostics stay off unless an explicit env flag is set', () => {
  assert.equal(shouldShowScanDiagnostics(undefined), false);
  assert.equal(shouldShowScanDiagnostics(''), false);
  assert.equal(shouldShowScanDiagnostics('0'), false);
  assert.equal(shouldShowScanDiagnostics('true'), true);
  assert.equal(shouldShowScanDiagnostics('1'), true);
  assert.equal(shouldShowScanDiagnostics('YES'), true);
});

test('Scan tab browse mode never inherits a checklist return', () => {
  assert.equal(isChecklistReturnMode('browse'), false);
  assert.equal(isChecklistReturnMode('checklist'), true);
});

test('repeat-add protection disables submit while adding, after success, or while unresolved', () => {
  assert.equal(shouldDisableAddSubmit({ productId: 'p', adding: false, alreadyAdded: false }), false);
  assert.equal(shouldDisableAddSubmit({ productId: 'p', adding: true, alreadyAdded: false }), true);
  assert.equal(shouldDisableAddSubmit({ productId: 'p', adding: false, alreadyAdded: true }), true);
  assert.equal(shouldDisableAddSubmit({ productId: 'p', adding: false, alreadyAdded: false, unresolved: true }), true);
  assert.equal(shouldDisableAddSubmit({ productId: null, adding: false, alreadyAdded: false }), true);
});

test('stale lookup/add results from another session or generation are ignored', () => {
  const gen = createRequestGeneration();
  const live = 'cls-1-aaa';
  const token = gen.next();
  assert.equal(
    shouldCommitAsyncResult({
      closed: false,
      generationCurrent: gen.isCurrent(token),
      sessionId: live,
      resultSessionId: live,
    }),
    true,
  );
  gen.next();
  assert.equal(
    shouldCommitAsyncResult({
      closed: false,
      generationCurrent: gen.isCurrent(token),
      sessionId: live,
      resultSessionId: live,
    }),
    false,
  );
  assert.equal(
    shouldCommitAsyncResult({
      closed: false,
      generationCurrent: true,
      sessionId: live,
      resultSessionId: 'cls-2-bbb',
    }),
    false,
  );
  assert.equal(
    shouldCommitAsyncResult({
      closed: true,
      generationCurrent: true,
      sessionId: live,
      resultSessionId: live,
    }),
    false,
  );
});

test('late add completion does not navigate a later or closed session', () => {
  assert.equal(
    shouldReturnToChecklistAfterAdd({
      mode: 'checklist',
      closed: false,
      generationCurrent: true,
      basketAdded: true,
    }),
    true,
  );
  assert.equal(
    shouldReturnToChecklistAfterAdd({
      mode: 'browse',
      closed: false,
      generationCurrent: true,
      basketAdded: true,
    }),
    false,
  );
  assert.equal(
    shouldReturnToChecklistAfterAdd({
      mode: 'checklist',
      closed: true,
      generationCurrent: true,
      basketAdded: true,
    }),
    false,
  );
  assert.equal(
    shouldReturnToChecklistAfterAdd({
      mode: 'checklist',
      closed: false,
      generationCurrent: false,
      basketAdded: true,
    }),
    false,
  );
});

test('camera preview unmounts when unfocused, backgrounded, or processing', () => {
  const base = {
    isFocused: true,
    appActive: true,
    phase: 'scan' as const,
    cameraGranted: true,
    processing: false,
  };
  assert.equal(shouldRenderCameraPreview(base), true);
  assert.equal(shouldRenderCameraPreview({ ...base, isFocused: false }), false);
  assert.equal(shouldRenderCameraPreview({ ...base, appActive: false }), false);
  assert.equal(shouldRenderCameraPreview({ ...base, phase: 'lookup' }), false);
  assert.equal(shouldRenderCameraPreview({ ...base, processing: true }), false);
  assert.equal(shouldRenderCameraPreview({ ...base, cameraGranted: false }), false);
  assert.equal(shouldRenderCameraPreview({ ...base, inputFocused: true }), false);
});

test('unique-product lines may increment; presence alone is not add evidence', () => {
  assert.equal(quantityOfProduct([{ productId: 'P1', quantity: 2 }], 'p1'), 2);

  assert.equal(
    nextActionAfterAmbiguousAdd({
      productId: 'P1',
      preQuantity: 2,
      intendedDelta: 1,
      refresh: { status: 'ok', items: [{ productId: 'p1', quantity: 2 }] },
    }).kind,
    'quantity_not_confirmed',
  );

  const observed = nextActionAfterAmbiguousAdd({
    productId: 'P1',
    preQuantity: 2,
    intendedDelta: 1,
    refresh: { status: 'ok', items: [{ productId: 'p1', quantity: 3 }] },
  });
  assert.equal(observed.kind, 'observed_expected_quantity');
  if (observed.kind === 'observed_expected_quantity') {
    assert.equal(observed.certainty, 'basket_state_only');
    assert.equal(observed.allowRepeatAdd, false);
  }

  const created = nextActionAfterAmbiguousAdd({
    productId: 'NEW',
    preQuantity: 0,
    intendedDelta: 1,
    refresh: { status: 'ok', items: [{ productId: 'NEW', quantity: 1 }] },
  });
  assert.equal(created.kind, 'observed_expected_quantity');

  const failed = nextActionAfterAmbiguousAdd({
    productId: 'P1',
    preQuantity: 2,
    intendedDelta: 1,
    refresh: { status: 'failed' },
  });
  assert.equal(failed.kind, 'unresolved');
  assert.equal(failed.allowRepeatAdd, false);
});

test('A→B→A account scope does not revive the original generation', () => {
  const started = captureAccountScope('A', 1);
  assert.equal(isCurrentAccountScope(started, captureAccountScope('B', 2)), false);
  assert.equal(isCurrentAccountScope(started, captureAccountScope('A', 3)), false);
  assert.equal(isCurrentAccountScope(started, captureAccountScope('A', 1)), true);
});
