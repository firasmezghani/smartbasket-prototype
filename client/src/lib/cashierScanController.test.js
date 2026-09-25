import test from 'node:test';
import assert from 'node:assert/strict';

import { createCashierScanGate } from './cashierScanController.js';

test('accepts the first usable decode and returns the normalised token', () => {
  const gate = createCashierScanGate();
  const r = gate.accept('SMART_BASKET:tok-1', 1000);
  assert.deepEqual(r, { accepted: true, token: 'tok-1' });
  assert.equal(gate.isAccepted, true);
});

test('ignores empty / prefix-only decodes without consuming the gate', () => {
  const gate = createCashierScanGate();
  assert.deepEqual(gate.accept('', 1000), { accepted: false, token: null });
  assert.deepEqual(gate.accept('SMART_BASKET:', 1000), { accepted: false, token: null });
  assert.equal(gate.isAccepted, false);
  // A real code afterwards is still the first accept.
  assert.deepEqual(gate.accept('SMART_BASKET:real', 1000), { accepted: true, token: 'real' });
});

test('rejects the burst of repeated callbacks after the first accept', () => {
  const gate = createCashierScanGate();
  assert.equal(gate.accept('tok', 0).accepted, true);
  for (let i = 1; i <= 20; i += 1) {
    assert.deepEqual(gate.accept('tok', i * 50), { accepted: false, token: null });
  }
});

test('reset() re-arms the gate, but the same token within the window is still blocked', () => {
  const gate = createCashierScanGate({ windowMs: 4000 });
  assert.equal(gate.accept('tok', 1000).accepted, true);
  gate.reset();
  // still within 4s of the accepted scan, same token -> blocked
  assert.equal(gate.accept('tok', 2500).accepted, false);
  // a different token is allowed after reset
  assert.equal(gate.accept('other', 2600).accepted, true);
});

test('after the window elapses, reset() allows the same token again', () => {
  const gate = createCashierScanGate({ windowMs: 4000 });
  assert.equal(gate.accept('tok', 1000).accepted, true);
  gate.reset();
  assert.equal(gate.accept('tok', 5001).accepted, true);
});

test('clear() wipes the recent-token memory too', () => {
  const gate = createCashierScanGate({ windowMs: 4000 });
  assert.equal(gate.accept('tok', 1000).accepted, true);
  gate.clear();
  assert.equal(gate.accept('tok', 1200).accepted, true);
});

test('a non-positive / NaN window falls back to the 4s default', () => {
  const gate = createCashierScanGate({ windowMs: 0 });
  assert.equal(gate.accept('tok', 1000).accepted, true);
  gate.reset();
  assert.equal(gate.accept('tok', 3000).accepted, false); // still inside default 4s
  gate.reset();
  assert.equal(gate.accept('tok', 5001).accepted, true);
});
