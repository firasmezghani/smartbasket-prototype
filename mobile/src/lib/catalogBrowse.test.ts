import test from 'node:test';
import assert from 'node:assert/strict';

import {
  catalogChipSelection,
  catalogColumnCount,
  catalogFilterLabel,
  catalogQueryForFilter,
  resolveCatalogView,
  selectionFromSectionKey,
} from './catalogBrowse';

test('no selection and no search term shows the landing state', () => {
  assert.deepEqual(resolveCatalogView('', null), { mode: 'landing' });
  assert.deepEqual(resolveCatalogView('   ', null), { mode: 'landing' });
});

test('typing a search term enters the results state', () => {
  assert.deepEqual(resolveCatalogView('  olive oil ', null), {
    mode: 'results',
    filter: { kind: 'search', term: 'olive oil' },
  });
});

test('choosing a category enters the results state', () => {
  const selection = selectionFromSectionKey('household');
  assert.deepEqual(selection, { kind: 'category', category: 'household' });
  assert.deepEqual(resolveCatalogView('', selection), { mode: 'results', filter: selection });
});

test('choosing Featured / All products enters the results state', () => {
  assert.deepEqual(selectionFromSectionKey('featured'), { kind: 'featured' });
  assert.deepEqual(resolveCatalogView('', { kind: 'featured' }), {
    mode: 'results',
    filter: { kind: 'featured' },
  });
  assert.deepEqual(resolveCatalogView('', { kind: 'all' }), {
    mode: 'results',
    filter: { kind: 'all' },
  });
});

test('clearing the selection and the search term returns to the landing state', () => {
  // simulate "back to categories": selection -> null, search -> ''
  assert.deepEqual(resolveCatalogView('', null), { mode: 'landing' });
});

test('catalogQueryForFilter maps each filter to the right API query', () => {
  assert.deepEqual(catalogQueryForFilter({ kind: 'search', term: 'rice' }), { search: 'rice' });
  assert.deepEqual(catalogQueryForFilter({ kind: 'all' }), {});
  assert.deepEqual(catalogQueryForFilter({ kind: 'featured' }), { featured: true });
  assert.deepEqual(catalogQueryForFilter({ kind: 'category', category: 'drinks' }), {
    displayCategory: 'drinks',
  });
});

test('a search term narrows within an explicit selection', () => {
  assert.deepEqual(catalogQueryForFilter({ kind: 'all' }, 'apple'), { search: 'apple' });
  assert.deepEqual(catalogQueryForFilter({ kind: 'featured' }, 'apple'), {
    featured: true,
    search: 'apple',
  });
  assert.deepEqual(catalogQueryForFilter({ kind: 'category', category: 'food' }, ' apple '), {
    displayCategory: 'food',
    search: 'apple',
  });
});

test('landing highlights Featured; search-across-all highlights no chip', () => {
  assert.equal(catalogChipSelection({ mode: 'landing' }), 'featured');
  assert.equal(catalogChipSelection({ mode: 'results', filter: { kind: 'featured' } }), 'featured');
  assert.equal(
    catalogChipSelection({ mode: 'results', filter: { kind: 'category', category: 'food' } }),
    'food',
  );
  assert.equal(catalogChipSelection({ mode: 'results', filter: { kind: 'all' } }), 'all');
  assert.equal(
    catalogChipSelection({ mode: 'results', filter: { kind: 'search', term: 'milk' } }),
    null,
  );
});

test('catalogColumnCount drops a column when text is enlarged', () => {
  assert.equal(catalogColumnCount(390, 1), 2);
  assert.equal(catalogColumnCount(700, 1), 3);
  assert.equal(catalogColumnCount(1000, 1), 4);
  assert.equal(catalogColumnCount(390, 1.3), 2);
  assert.equal(catalogColumnCount(700, 1.3), 2);
  assert.equal(catalogColumnCount(1000, 1.6), 1);
  assert.equal(catalogColumnCount(0, 1), 2);
});

test('catalogFilterLabel yields an i18n descriptor per filter', () => {
  assert.deepEqual(catalogFilterLabel({ kind: 'search', term: 'tea' }), {
    key: 'catalog.resultsFor',
    params: { query: 'tea' },
  });
  assert.deepEqual(catalogFilterLabel({ kind: 'all' }), { key: 'catalog.allProducts' });
  assert.deepEqual(catalogFilterLabel({ kind: 'featured' }), { key: 'catalog.sectionFeatured' });
  assert.deepEqual(catalogFilterLabel({ kind: 'category', category: 'other' }), {
    key: 'catalog.categoryOther',
  });
});
