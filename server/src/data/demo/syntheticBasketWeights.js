// Simulated item weights for the cashier demo, read from a fixture file (not a real scale).

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export const SYNTHETIC_BASKET_WEIGHT_FIXTURE_VERSION = 'v1';
export const SYNTHETIC_BASKET_WEIGHT_PROVENANCE = 'synthetic';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, 'syntheticBasketWeights.v1.json');

export class SyntheticBasketWeightFixtureError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SyntheticBasketWeightFixtureError';
  }
}

function normaliseProductId(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function positiveIntGrams(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

// Validate the weight fixture (no duplicates, positive weights).
export function validateSyntheticBasketWeightFixture(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SyntheticBasketWeightFixtureError('Fixture must be an object.');
  }
  const version =
    typeof raw.fixtureVersion === 'string' ? raw.fixtureVersion.trim() : '';
  if (!version) {
    throw new SyntheticBasketWeightFixtureError('Fixture version is missing.');
  }
  const provenance =
    typeof raw.provenance === 'string' ? raw.provenance.trim().toLowerCase() : '';
  if (provenance !== SYNTHETIC_BASKET_WEIGHT_PROVENANCE) {
    throw new SyntheticBasketWeightFixtureError('Fixture provenance must be synthetic.');
  }
  const rows = Array.isArray(raw.weights) ? raw.weights : null;
  if (!rows || rows.length === 0) {
    throw new SyntheticBasketWeightFixtureError('Fixture has no product weights.');
  }
  const map = new Map();
  for (const row of rows) {
    const productId = normaliseProductId(row?.productId);
    if (!productId) {
      throw new SyntheticBasketWeightFixtureError('Fixture row is missing a product ID.');
    }
    if (map.has(productId)) {
      throw new SyntheticBasketWeightFixtureError(`Duplicate product ID in fixture: ${productId}`);
    }
    const grams = positiveIntGrams(row?.grams);
    if (grams == null) {
      throw new SyntheticBasketWeightFixtureError(`Invalid synthetic grams for ${productId}.`);
    }
    map.set(productId, grams);
  }
  return {
    fixtureVersion: version,
    provenance: SYNTHETIC_BASKET_WEIGHT_PROVENANCE,
    unit: 'g',
    byProductId: map,
  };
}

let cached = null;

export function loadSyntheticBasketWeightFixture(path = FIXTURE_PATH) {
  if (path === FIXTURE_PATH && cached) return cached;
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const fixture = validateSyntheticBasketWeightFixture(raw);
  if (path === FIXTURE_PATH) cached = fixture;
  return fixture;
}

export function lookupSyntheticUnitWeightGrams(productId, fixture) {
  const id = normaliseProductId(productId);
  if (!id || !fixture?.byProductId) return null;
  return fixture.byProductId.has(id) ? fixture.byProductId.get(id) : null;
}

// Weight for one basket line; unknown stays null. Nothing is stored when the demo is off.
export function freezeSimulatedWeightLine(opts) {
  const quantityRaw = Math.floor(Number(opts.quantity));
  const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;
  if (opts.enabled !== true) {
    return {
      quantity,
      simulatedUnitWeightGrams: null,
      simulatedLineWeightGrams: null,
      simulatedWeightProvenance: null,
      simulatedWeightFixtureVersion: null,
    };
  }
  const unit = lookupSyntheticUnitWeightGrams(opts.productId, opts.fixture);
  if (unit == null) {
    return {
      quantity,
      simulatedUnitWeightGrams: null,
      simulatedLineWeightGrams: null,
      simulatedWeightProvenance: SYNTHETIC_BASKET_WEIGHT_PROVENANCE,
      simulatedWeightFixtureVersion: opts.fixture?.fixtureVersion ?? SYNTHETIC_BASKET_WEIGHT_FIXTURE_VERSION,
    };
  }
  return {
    quantity,
    simulatedUnitWeightGrams: unit,
    simulatedLineWeightGrams: unit * quantity,
    simulatedWeightProvenance: SYNTHETIC_BASKET_WEIGHT_PROVENANCE,
    simulatedWeightFixtureVersion: opts.fixture?.fixtureVersion ?? SYNTHETIC_BASKET_WEIGHT_FIXTURE_VERSION,
  };
}

export function formatIntegerGrams(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return `${n.toLocaleString('en-GB')} g`;
}

// Total the stored weights of a session.
export function summariseSimulatedBasketWeight(lines) {
  const rows = Array.isArray(lines) ? lines : [];
  const recorded = rows.filter(
    (row) =>
      row?.simulatedWeightProvenance ||
      row?.simulatedWeightFixtureVersion ||
      row?.simulatedUnitWeightGrams != null ||
      row?.simulatedLineWeightGrams != null,
  );
  if (recorded.length === 0) {
    return {
      available: false,
      demonstration: true,
      coverageComplete: false,
      knownGrams: null,
      knownLineCount: 0,
      unknownLineCount: rows.length,
      knownUnitCount: 0,
      unknownUnitCount: rows.reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row?.quantity) || 0)), 0),
      totalLineCount: rows.length,
      totalUnitCount: rows.reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row?.quantity) || 0)), 0),
      provenance: null,
      fixtureVersion: null,
    };
  }

  let knownGrams = 0;
  let knownLineCount = 0;
  let unknownLineCount = 0;
  let knownUnitCount = 0;
  let unknownUnitCount = 0;
  let provenance = null;
  let fixtureVersion = null;

  for (const row of rows) {
    const qty = Math.max(0, Math.floor(Number(row?.quantity) || 0));
    const lineGrams = positiveIntGrams(row?.simulatedLineWeightGrams);
    const unitGrams = positiveIntGrams(row?.simulatedUnitWeightGrams);
    if (typeof row?.simulatedWeightProvenance === 'string' && row.simulatedWeightProvenance.trim()) {
      provenance = row.simulatedWeightProvenance.trim();
    }
    if (typeof row?.simulatedWeightFixtureVersion === 'string' && row.simulatedWeightFixtureVersion.trim()) {
      fixtureVersion = row.simulatedWeightFixtureVersion.trim();
    }
    if (lineGrams != null) {
      knownGrams += lineGrams;
      knownLineCount += 1;
      knownUnitCount += qty;
    } else if (unitGrams != null) {
      knownGrams += unitGrams * (qty || 1);
      knownLineCount += 1;
      knownUnitCount += qty;
    } else {
      unknownLineCount += 1;
      unknownUnitCount += qty;
    }
  }

  const coverageComplete = unknownLineCount === 0 && rows.length > 0;
  return {
    available: true,
    demonstration: true,
    coverageComplete,
    knownGrams: knownLineCount > 0 ? knownGrams : null,
    knownLineCount,
    unknownLineCount,
    knownUnitCount,
    unknownUnitCount,
    totalLineCount: rows.length,
    totalUnitCount: knownUnitCount + unknownUnitCount,
    provenance: provenance || SYNTHETIC_BASKET_WEIGHT_PROVENANCE,
    fixtureVersion,
  };
}
