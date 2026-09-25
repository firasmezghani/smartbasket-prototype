import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const service = readFileSync(join(root, 'smartBasket.service.js'), 'utf8');

test('QR creation freezes simulated weight from the fixture, never source Poids', () => {
  assert.match(service, /freezeSimulatedWeightLine/);
  assert.match(service, /loadSyntheticBasketWeightFixture/);
  assert.match(service, /SIMULATED_BASKET_WEIGHT/);
  assert.doesNotMatch(service, /Poids/);
  assert.match(service, /summariseSimulatedBasketWeight/);
});

test('cashier approval and rejection do not read simulated weight', () => {
  const start = service.indexOf('async function finalizeValidation');
  const end = service.indexOf('export async function validateBasketByToken');
  assert.ok(start > 0 && end > start);
  const finalize = service.slice(start, end);
  assert.doesNotMatch(finalize, /simulatedWeight|SimulatedUnitWeight|fixture/);
  assert.match(finalize, /Status = N'validated'/);
  assert.match(finalize, /Status = N'rejected'/);
});
