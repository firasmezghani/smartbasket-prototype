import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { simulatedWeightPanelView } from './simulatedBasketWeight.js';

const root = dirname(fileURLToPath(import.meta.url));

test('complete coverage shows a simulated total and never a verified-scale claim', () => {
  const view = simulatedWeightPanelView({
    available: true,
    coverageComplete: true,
    knownGrams: 2000,
    knownLineCount: 2,
    unknownLineCount: 0,
    knownUnitCount: 5,
    unknownUnitCount: 0,
    totalLineCount: 2,
    totalUnitCount: 5,
  });
  assert.equal(view.state, 'complete');
  assert.equal(view.title, 'Simulated basket weight — demonstration only');
  assert.equal(view.heading, 'Simulated total');
  assert.equal(view.amount, '2,000 g');
  assert.match(view.coverage, /2 of 2 product lines/);
  assert.match(view.coverage, /5 of 5 basket units/);
  assert.match(view.explanation, /No scale is connected/);
  assert.doesNotMatch(view.explanation, /theft|weight verified/i);
  assert.doesNotMatch(view.heading, /verified/i);
});

test('incomplete coverage shows a known subtotal rather than a complete total', () => {
  const view = simulatedWeightPanelView({
    available: true,
    coverageComplete: false,
    knownGrams: 500,
    knownLineCount: 1,
    unknownLineCount: 1,
    knownUnitCount: 2,
    unknownUnitCount: 4,
    totalLineCount: 2,
    totalUnitCount: 6,
  });
  assert.equal(view.state, 'partial');
  assert.equal(view.heading, 'Known simulated-weight subtotal');
  assert.equal(view.amount, '500 g');
  assert.match(view.coverage, /1 of 2 product lines/);
  assert.match(view.coverage, /2 of 6 basket units/);
});

test('old or demo-disabled sessions use an unavailable state', () => {
  const view = simulatedWeightPanelView({ available: false });
  assert.equal(view.state, 'unavailable');
  assert.match(view.heading, /Not recorded/);
  assert.equal(view.amount, undefined);
});

test('cashier page shows the demonstration panel and does not gate approval on weight', () => {
  const page = readFileSync(join(root, '../components/admin/AdminCashierPage.jsx'), 'utf8');
  assert.match(page, /simulatedWeightPanelView/);
  assert.match(page, /view\.title/);
  assert.doesNotMatch(page, /theft-risk|weight verified|measured weight/i);
  const approve = page.slice(page.indexOf('onValidate'), page.indexOf('onReject'));
  assert.doesNotMatch(approve, /simulatedWeight/);
  assert.match(page, /canDecideBasket/);
  assert.match(page, /Next customer/);
  assert.match(page, /Paste basket code/);
  assert.doesNotMatch(page, /Customer may pay/);
  assert.doesNotMatch(page, /QR detected — looking up/);
});
