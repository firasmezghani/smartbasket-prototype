import test from 'node:test';
import assert from 'node:assert/strict';

import { decideBarcodeLookupResult } from './catalog.service.js';

test('unknown barcode (no listable hit) is unknown, not NOT_IN_CURATED_CATALOGUE', () => {
  assert.deepEqual(
    decideBarcodeLookupResult({ hitCount: 0, curatedProduct: null, catalogueMode: 'curated' }),
    { kind: 'unknown' },
  );
});

test('ambiguous barcode stays 409 regardless of catalogue mode', () => {
  assert.deepEqual(
    decideBarcodeLookupResult({
      hitCount: 2,
      curatedProduct: { id: 'a' },
      catalogueMode: 'curated',
    }),
    { kind: 'ambiguous' },
  );
});

test('a curated hit resolves as found', () => {
  assert.deepEqual(
    decideBarcodeLookupResult({
      hitCount: 1,
      curatedProduct: { id: 'curated' },
      catalogueMode: 'curated',
    }),
    { kind: 'found' },
  );
});

test('a real listable hit outside the curated set is NOT_IN_CURATED_CATALOGUE', () => {
  assert.deepEqual(
    decideBarcodeLookupResult({
      hitCount: 1,
      curatedProduct: null,
      catalogueMode: 'curated',
    }),
    { kind: 'not_in_curated' },
  );
});

test('full mode does not relabel a missing curated row as not-in-curated', () => {
  assert.deepEqual(
    decideBarcodeLookupResult({
      hitCount: 1,
      curatedProduct: null,
      catalogueMode: 'full',
    }),
    { kind: 'unknown' },
  );
});
