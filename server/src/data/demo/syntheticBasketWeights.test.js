import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  SYNTHETIC_BASKET_WEIGHT_FIXTURE_VERSION,
  SYNTHETIC_BASKET_WEIGHT_PROVENANCE,
  SyntheticBasketWeightFixtureError,
  formatIntegerGrams,
  freezeSimulatedWeightLine,
  loadSyntheticBasketWeightFixture,
  lookupSyntheticUnitWeightGrams,
  summariseSimulatedBasketWeight,
  validateSyntheticBasketWeightFixture,
} from './syntheticBasketWeights.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function fixtureDoc(overrides = {}) {
  return {
    fixtureVersion: 'v1',
    provenance: 'synthetic',
    unit: 'g',
    weights: [
      { productId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', grams: 250 },
      { productId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', grams: 500 },
    ],
    ...overrides,
  };
}

test('shipped v1 fixture covers the 91 visible product IDs with positive synthetic grams', () => {
  const curated = JSON.parse(
    readFileSync(join(__dirname, '../catalogue/curated-v3-approved.json'), 'utf8'),
  );
  const ids = new Set(curated.products.map((p) => String(p.productId).trim().toLowerCase()));
  assert.equal(ids.size, 91);
  const loaded = loadSyntheticBasketWeightFixture();
  assert.equal(loaded.fixtureVersion, SYNTHETIC_BASKET_WEIGHT_FIXTURE_VERSION);
  assert.equal(loaded.provenance, SYNTHETIC_BASKET_WEIGHT_PROVENANCE);
  assert.equal(loaded.byProductId.size, 91);
  for (const id of ids) {
    const grams = loaded.byProductId.get(id);
    assert.ok(Number.isInteger(grams) && grams > 0, `missing/invalid grams for ${id}`);
  }
  assert.equal(lookupSyntheticUnitWeightGrams('not-a-product', loaded), null);
});

test('invalid fixture data is rejected: duplicates, zero/negative grams, missing ids', () => {
  assert.throws(
    () =>
      validateSyntheticBasketWeightFixture(
        fixtureDoc({
          weights: [
            { productId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', grams: 10 },
            { productId: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', grams: 20 },
          ],
        }),
      ),
    SyntheticBasketWeightFixtureError,
  );
  assert.throws(
    () =>
      validateSyntheticBasketWeightFixture(
        fixtureDoc({
          weights: [{ productId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', grams: 0 }],
        }),
      ),
    SyntheticBasketWeightFixtureError,
  );
  assert.throws(
    () =>
      validateSyntheticBasketWeightFixture(
        fixtureDoc({
          weights: [{ productId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', grams: -5 }],
        }),
      ),
    SyntheticBasketWeightFixtureError,
  );
  assert.throws(
    () => validateSyntheticBasketWeightFixture(fixtureDoc({ weights: [{ grams: 10 }] })),
    SyntheticBasketWeightFixtureError,
  );
});

test('known arithmetic uses frozen unit weight × snapshot quantity', () => {
  const fixture = validateSyntheticBasketWeightFixture(fixtureDoc());
  const milk = freezeSimulatedWeightLine({
    enabled: true,
    fixture,
    productId: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
    quantity: 2,
  });
  const butter = freezeSimulatedWeightLine({
    enabled: true,
    fixture,
    productId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    quantity: 3,
  });
  assert.equal(milk.simulatedUnitWeightGrams, 250);
  assert.equal(milk.simulatedLineWeightGrams, 500);
  assert.equal(butter.simulatedLineWeightGrams, 1500);
  const summary = summariseSimulatedBasketWeight([milk, butter]);
  assert.equal(summary.available, true);
  assert.equal(summary.coverageComplete, true);
  assert.equal(summary.knownGrams, 2000);
  assert.equal(summary.knownLineCount, 2);
  assert.equal(summary.knownUnitCount, 5);
  assert.equal(summary.unknownLineCount, 0);
  assert.equal(formatIntegerGrams(summary.knownGrams), '2,000 g');
});

test('incomplete coverage reports a known subtotal, not a complete total', () => {
  const fixture = validateSyntheticBasketWeightFixture(fixtureDoc());
  const known = freezeSimulatedWeightLine({
    enabled: true,
    fixture,
    productId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    quantity: 2,
  });
  const missing = freezeSimulatedWeightLine({
    enabled: true,
    fixture,
    productId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    quantity: 4,
  });
  assert.equal(missing.simulatedUnitWeightGrams, null);
  assert.equal(missing.simulatedLineWeightGrams, null);
  assert.equal(missing.simulatedWeightProvenance, 'synthetic');
  const summary = summariseSimulatedBasketWeight([known, missing]);
  assert.equal(summary.coverageComplete, false);
  assert.equal(summary.knownGrams, 500);
  assert.equal(summary.knownLineCount, 1);
  assert.equal(summary.unknownLineCount, 1);
  assert.equal(summary.knownUnitCount, 2);
  assert.equal(summary.unknownUnitCount, 4);
});

test('demo mode disabled records no simulated weight', () => {
  const fixture = validateSyntheticBasketWeightFixture(fixtureDoc());
  const line = freezeSimulatedWeightLine({
    enabled: false,
    fixture,
    productId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    quantity: 2,
  });
  assert.equal(line.simulatedUnitWeightGrams, null);
  assert.equal(line.simulatedLineWeightGrams, null);
  assert.equal(line.simulatedWeightProvenance, null);
  const summary = summariseSimulatedBasketWeight([line]);
  assert.equal(summary.available, false);
  assert.equal(summary.knownGrams, null);
});

test('old sessions with no weight columns stay unavailable and are not backfilled', () => {
  const summary = summariseSimulatedBasketWeight([
    { productId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', quantity: 2 },
  ]);
  assert.equal(summary.available, false);
  assert.equal(summary.knownGrams, null);
  assert.equal(summary.knownLineCount, 0);
});

test('changing the fixture later does not rewrite a frozen snapshot', () => {
  const original = validateSyntheticBasketWeightFixture(fixtureDoc());
  const frozen = freezeSimulatedWeightLine({
    enabled: true,
    fixture: original,
    productId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    quantity: 2,
  });
  const changed = validateSyntheticBasketWeightFixture(
    fixtureDoc({
      fixtureVersion: 'v2',
      weights: [
        { productId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', grams: 999 },
        { productId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', grams: 500 },
      ],
    }),
  );
  assert.equal(lookupSyntheticUnitWeightGrams('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', changed), 999);
  const summary = summariseSimulatedBasketWeight([frozen]);
  assert.equal(summary.knownGrams, 500);
  assert.equal(summary.fixtureVersion, 'v1');
  assert.equal(frozen.simulatedUnitWeightGrams, 250);
});
