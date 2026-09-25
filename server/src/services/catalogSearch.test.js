import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATALOG_SEARCH_ALIAS_GROUPS,
  CATALOG_SEARCH_MAX_ALIAS_TERMS,
  CATALOG_SEARCH_MAX_CANONICAL_TYPES,
  buildCatalogSearchFilter,
  expandCatalogSearch,
  normaliseSearchText,
} from './catalogSearch.js';

test('normaliseSearchText folds case, accents, ligatures and punctuation; keeps numbers', () => {
  assert.equal(normaliseSearchText('  Tomato! '), 'tomato');
  assert.equal(normaliseSearchText('TOMATE'), 'tomate');
  assert.equal(normaliseSearchText('œufs'), 'oeufs');
  assert.equal(normaliseSearchText('ŒUFS'), 'oeufs');
  assert.equal(normaliseSearchText('beurre de cacahuète'), 'beurre de cacahuete');
  assert.equal(normaliseSearchText('huile d’olive'), 'huile d olive');
  assert.equal(normaliseSearchText('pack 6'), 'pack 6');
  assert.equal(normaliseSearchText(''), '');
  assert.equal(normaliseSearchText(null), '');
});

test('expandCatalogSearch: tomato and tomate are the same alias group', () => {
  const en = expandCatalogSearch('tomato');
  const fr = expandCatalogSearch('tomate');
  assert.equal(en.mode, 'alias');
  assert.equal(fr.mode, 'alias');
  assert.deepEqual(en.canonicalTypes, fr.canonicalTypes);
  assert.ok(en.terms.includes('tomato') && en.terms.includes('tomate'));
  assert.ok(fr.terms.includes('tomato') && fr.terms.includes('tomate'));
  assert.deepEqual(en.canonicalTypes, ['tomato']);
});

test('expandCatalogSearch: egg, uf, oeuf, oeufs and œufs are the same alias group', () => {
  const variants = ['egg', 'eggs', 'uf', 'oeuf', 'oeufs', 'œufs', 'Œufs'];
  const first = expandCatalogSearch('egg');
  assert.equal(first.mode, 'alias');
  assert.deepEqual(first.canonicalTypes, ['egg']);
  for (const q of variants) {
    const e = expandCatalogSearch(q);
    assert.equal(e.mode, 'alias', q);
    assert.deepEqual(e.canonicalTypes, ['egg'], q);
    assert.ok(e.terms.includes('egg') && e.terms.includes('oeufs'), q);
  }
});

test('expandCatalogSearch: milk/lait and cheese/fromage are bilingual aliases', () => {
  const milkEn = expandCatalogSearch('milk');
  const milkFr = expandCatalogSearch('lait');
  assert.equal(milkEn.mode, 'alias');
  assert.equal(milkFr.mode, 'alias');
  assert.deepEqual(milkEn.canonicalTypes, ['milk']);
  assert.deepEqual(milkFr.canonicalTypes, ['milk']);

  const cheeseEn = expandCatalogSearch('cheese');
  const cheeseFr = expandCatalogSearch('fromage');
  assert.equal(cheeseEn.mode, 'alias');
  assert.equal(cheeseFr.mode, 'alias');
  assert.deepEqual(cheeseEn.canonicalTypes, ['cheese', 'mozzarella', 'parmesan']);
  assert.deepEqual(cheeseFr.canonicalTypes, cheeseEn.canonicalTypes);
});

test('expandCatalogSearch: butter does not include peanut_butter; peanut butter is its own group', () => {
  const butter = expandCatalogSearch('beurre');
  assert.equal(butter.mode, 'alias');
  assert.deepEqual(butter.canonicalTypes, ['butter']);
  assert.equal(butter.canonicalTypes.includes('peanut_butter'), false);

  const peanut = expandCatalogSearch('peanut butter');
  assert.equal(peanut.mode, 'alias');
  assert.deepEqual(peanut.canonicalTypes, ['peanut_butter']);
  const peanutFr = expandCatalogSearch('beurre de cacahuète');
  assert.equal(peanutFr.mode, 'alias');
  assert.deepEqual(peanutFr.canonicalTypes, ['peanut_butter']);
});

test('expandCatalogSearch: longest phrase wins over a shorter alias', () => {
  assert.equal(expandCatalogSearch('olive oil').canonicalTypes[0], 'olive_oil');
  assert.equal(expandCatalogSearch('sweet corn').canonicalTypes[0], 'sweetcorn');
});

test('expandCatalogSearch: unknown text stays ordinary literal search', () => {
  const e = expandCatalogSearch('Bondin');
  assert.equal(e.mode, 'literal');
  assert.equal(e.foodAlias, false);
  assert.deepEqual(e.terms, ['Bondin']);
  assert.deepEqual(e.canonicalTypes, []);

  const empty = expandCatalogSearch('   ');
  assert.equal(empty.mode, 'none');
});

test('every alias group stays within bind caps', () => {
  for (const group of CATALOG_SEARCH_ALIAS_GROUPS) {
    assert.ok(group.aliases.length <= CATALOG_SEARCH_MAX_ALIAS_TERMS, group.key);
    assert.ok(group.canonicalTypes.length <= CATALOG_SEARCH_MAX_CANONICAL_TYPES, group.key);
  }
});

test('buildCatalogSearchFilter: alias SQL is parameterised and gates non-food', () => {
  const { expansion, sql, binds } = buildCatalogSearchFilter('tomate');
  assert.equal(expansion.mode, 'alias');
  assert.match(sql, /m\.CanonicalType IN \(@searchCanonical0\)/);
  assert.match(sql, /m\.CanonicalType IS NULL/);
  assert.match(sql, /DisplayCategory IN \(N'food', N'drinks'\)/);
  assert.equal(sql.includes('tomate'), false);
  assert.equal(sql.includes('DROP'), false);
  assert.ok(binds.some((b) => b.name === 'searchCanonical0' && b.value === 'tomato'));
  assert.ok(binds.some((b) => b.name.startsWith('searchAlias') && String(b.value).includes('tomate')));
  for (const b of binds) {
    assert.match(b.name, /^search(Canonical|Alias)\d+$/);
    assert.equal(sql.includes(String(b.value).replace(/%/g, '')), false);
  }
});

test('buildCatalogSearchFilter: cheese binds mozzarella and parmesan canonical types', () => {
  const { binds } = buildCatalogSearchFilter('fromage');
  const canonical = binds.filter((b) => b.name.startsWith('searchCanonical')).map((b) => b.value);
  assert.deepEqual(canonical, ['cheese', 'mozzarella', 'parmesan']);
});

test('buildCatalogSearchFilter: unknown text uses bound LIKE and never interpolates the query', () => {
  const hostile = "xyzzy'; DROP TABLE dbo.SB_Products; --";
  const { expansion, sql, binds } = buildCatalogSearchFilter(hostile);
  assert.equal(expansion.mode, 'literal');
  assert.match(sql, /@searchPattern/);
  assert.equal(sql.includes('DROP'), false);
  assert.equal(sql.includes(hostile), false);
  assert.equal(binds[0].name, 'searchPattern');
  assert.ok(String(binds[0].value).includes('xyzzy'));
});

test('buildCatalogSearchFilter: empty search produces no SQL', () => {
  const { sql, binds } = buildCatalogSearchFilter('  ');
  assert.equal(sql, '');
  assert.deepEqual(binds, []);
});
