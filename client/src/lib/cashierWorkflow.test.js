import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { normalizeCashierToken, SMART_BASKET_QR_PREFIX } from './cashierToken.js';
import {
  cameraNoteAfterLookup,
  canDecideBasket,
  canLookupBasket,
  isTerminalCashierStatus,
  lineAmount,
  nextCustomerLocalState,
} from './cashierWorkflow.js';

const root = dirname(fileURLToPath(import.meta.url));

test('full SMART_BASKET payload normalises to the same lookup token as the QR', () => {
  const bare = 'Abc_Token-With.Punctuation~0123456789abcdefghijklmnopqrstuv';
  const qrValue = `${SMART_BASKET_QR_PREFIX}${bare}`;
  assert.equal(normalizeCashierToken(qrValue), bare);
  assert.equal(normalizeCashierToken(`  ${qrValue}  `), bare);
  assert.equal(normalizeCashierToken(bare), bare);
});

test('repeated decisions stay blocked once deciding or not active', () => {
  assert.equal(canDecideBasket({ status: 'active', loading: false, deciding: false }), true);
  assert.equal(canDecideBasket({ status: 'active', loading: false, deciding: true }), false);
  assert.equal(canDecideBasket({ status: 'validated', loading: false, deciding: false }), false);
  assert.equal(canDecideBasket({ status: 'rejected', deciding: false }), false);
  assert.equal(canLookupBasket({ loading: true, deciding: false }), false);
  assert.equal(canLookupBasket({ loading: false, deciding: true }), false);
});

test('lookup success or failure clears the detecting note', () => {
  assert.equal(cameraNoteAfterLookup(), null);
});

test('Next customer resets local lookup state only', () => {
  const next = nextCustomerLocalState();
  assert.equal(next.tokenInput, '');
  assert.equal(next.basket, null);
  assert.equal(next.message, null);
  assert.equal(next.cameraNote, null);
  assert.equal(next.deciding, false);
  assert.equal(isTerminalCashierStatus('validated'), true);
  assert.equal(isTerminalCashierStatus('rejected'), true);
  assert.equal(isTerminalCashierStatus('active'), false);
});

test('cashier page uses full-code paste, Next customer, and does not mutate completed sessions', () => {
  const page = readFileSync(join(root, '../components/admin/AdminCashierPage.jsx'), 'utf8');
  assert.match(page, /Paste basket code/);
  assert.match(page, /Customer can also show this code from their app\./);
  assert.match(page, /onNextCustomer/);
  assert.match(page, /nextCustomerLocalState\(\)/);
  assert.match(page, /canDecideBasket/);
  assert.match(page, /cameraNoteAfterLookup/);
  assert.doesNotMatch(page, /QR detected — looking up/);
  assert.doesNotMatch(page, /clearCart|DELETE \/api\/cart/);
});

test('line amount is quantity times unit price', () => {
  assert.equal(lineAmount(2, 1.98), 3.96);
  assert.equal(lineAmount(1, null), null);
});
