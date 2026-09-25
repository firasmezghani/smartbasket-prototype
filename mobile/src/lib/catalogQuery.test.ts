import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCatalogQueryString } from './catalogQuery';

test('empty query produces an empty string', () => {
  assert.equal(buildCatalogQueryString({}), '');
});

test('pagination and search are included and trimmed', () => {
  assert.equal(
    buildCatalogQueryString({ limit: 20, offset: 40, search: '  milk  ' }),
    'limit=20&offset=40&search=milk',
  );
});

test('default sort "recommended" is omitted, explicit sorts are kept', () => {
  assert.equal(buildCatalogQueryString({ sort: 'recommended' }), '');
  assert.equal(buildCatalogQueryString({ sort: 'price_asc' }), 'sort=price_asc');
});

test('catalogue filters: displayCategory, featured, curated', () => {
  assert.equal(
    buildCatalogQueryString({ displayCategory: 'personal-care' }),
    'displayCategory=personal-care',
  );
  assert.equal(buildCatalogQueryString({ featured: true }), 'featured=true');
  assert.equal(buildCatalogQueryString({ curated: true }), 'curated=true');
  // false / undefined never emit a param
  assert.equal(buildCatalogQueryString({ featured: false, curated: false }), '');
});

test('hasPromo only emits for boolean true or the string "true"', () => {
  assert.equal(buildCatalogQueryString({ hasPromo: true }), 'hasPromo=true');
  assert.equal(buildCatalogQueryString({ hasPromo: 'true' }), 'hasPromo=true');
  assert.equal(buildCatalogQueryString({ hasPromo: false }), '');
});

test('values are URL-encoded', () => {
  assert.equal(buildCatalogQueryString({ search: 'a&b=c d' }), 'search=a%26b%3Dc%20d');
});

test('a combined category + search query keeps both', () => {
  assert.equal(
    buildCatalogQueryString({ displayCategory: 'food', search: 'rice', limit: 20, offset: 0 }),
    'limit=20&offset=0&search=rice&displayCategory=food',
  );
});
