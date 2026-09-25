import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closePool } from '../config/db.js';
import { env } from '../config/env.js';
import { getProducts } from './catalog.service.js';

// Checks bilingual catalogue search against a real database.
// Read-only; skips when the database or curated seed is unavailable.

const PRIL_LEMON_ID = '028D8FC8-CD26-4B5B-A8AB-D37BF03AD884';
const DURU_CUCUMBER_ID = 'AA0571B3-EC42-479D-944B-9549C8CC3278';
const PEANUT_BUTTER_IDS = new Set([
  '0CADC996-0A28-4CC1-AB43-82ACD692F7CC',
  '2370D1F4-9691-49E4-9FB8-056A6D81C4F6',
]);
const BUTTER_ID = '210D449D-D2CA-4339-BBBC-1F462B136278';

const HOUSEHOLD_OR_CARE = new Set(['household', 'personal-care', 'other']);

let dbReady = false;
const originalMode = env.CATALOGUE_MODE;

before(async () => {
  // Private-catalogue tests only run when `SB_PRIVATE_CATALOGUE_READ_TESTS=YES`.
  if (process.env.SB_PRIVATE_CATALOGUE_READ_TESTS !== 'YES') return;
  if (process.env.SB_TEST_DATABASE || process.env.SB_TEST_DISPOSABLE) {
    throw new Error('Do not mix private catalogue reads with disposable write tests.');
  }
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    env.CATALOGUE_MODE = 'curated';
    const { total } = await getProducts({ limit: 1 });
    dbReady = total === 91;
  } catch {
    dbReady = false;
  }
});

after(async () => {
  env.CATALOGUE_MODE = originalMode;
  await closePool();
});

function ids(products) {
  return products.map((p) => String(p.id).toLowerCase());
}

function assertNoFalsePositives(products, query) {
  const found = ids(products);
  assert.equal(
    found.includes(PRIL_LEMON_ID.toLowerCase()),
    false,
    `"${query}" matched household lemon detergent`,
  );
  assert.equal(
    found.includes(DURU_CUCUMBER_ID.toLowerCase()),
    false,
    `"${query}" matched cucumber soap`,
  );
  for (const p of products) {
    assert.equal(
      HOUSEHOLD_OR_CARE.has(p.displayCategory),
      false,
      `"${query}" leaked ${p.displayCategory} product ${p.name}`,
    );
    assert.equal(p.isCurated, true, `"${query}" leaked a non-curated product`);
  }
}

test('(setup) curated 91-product catalogue is searchable', (t) => {
  if (!dbReady) t.skip('No reachable DB with the 91-product curated catalogue.');
});

test('tomato and tomate find the same curated tomato products', async (t) => {
  if (!dbReady) return t.skip('prerequisites not met');
  env.CATALOGUE_MODE = 'curated';
  const en = await getProducts({ search: 'tomato', limit: 100 });
  const fr = await getProducts({ search: 'tomate', limit: 100 });
  assert.ok(en.products.length > 0, 'tomato should find curated tomato products');
  assert.ok(fr.products.length > 0, 'tomate should find curated tomato products');
  assert.deepEqual(ids(en.products).sort(), ids(fr.products).sort());
  assert.equal(en.total, fr.total);
  assert.equal(new Set(ids(en.products)).size, en.products.length, 'each product once');
  assertNoFalsePositives(en.products, 'tomato');
  assertNoFalsePositives(fr.products, 'tomate');
});

test('egg / uf / oeuf / oeufs / œufs find genuine egg products', async (t) => {
  if (!dbReady) return t.skip('prerequisites not met');
  env.CATALOGUE_MODE = 'curated';
  const variants = ['egg', 'uf', 'oeuf', 'oeufs', 'œufs'];
  let expected = null;
  for (const q of variants) {
    const { products, total } = await getProducts({ search: q, limit: 100 });
    assert.ok(products.length > 0, `"${q}" should find egg products`);
    const got = ids(products).sort();
    if (!expected) expected = got;
    else assert.deepEqual(got, expected, `"${q}" should match the same products as egg`);
    assert.equal(total, expected.length);
    assertNoFalsePositives(products, q);
  }
});

test('milk and lait find milk; cheese and fromage find genuine cheese', async (t) => {
  if (!dbReady) return t.skip('prerequisites not met');
  env.CATALOGUE_MODE = 'curated';
  const milkEn = await getProducts({ search: 'milk', limit: 100 });
  const milkFr = await getProducts({ search: 'lait', limit: 100 });
  assert.ok(milkEn.products.length > 0, 'milk should find milk');
  assert.deepEqual(ids(milkEn.products).sort(), ids(milkFr.products).sort());
  assertNoFalsePositives(milkEn.products, 'milk');

  const cheeseEn = await getProducts({ search: 'cheese', limit: 100 });
  const cheeseFr = await getProducts({ search: 'fromage', limit: 100 });
  assert.ok(cheeseEn.products.length > 0, 'cheese should find cheese products');
  assert.deepEqual(ids(cheeseEn.products).sort(), ids(cheeseFr.products).sort());
  assertNoFalsePositives(cheeseEn.products, 'cheese');
  assertNoFalsePositives(cheeseFr.products, 'fromage');
});

test('food aliases do not match household or personal-care false positives', async (t) => {
  if (!dbReady) return t.skip('prerequisites not met');
  env.CATALOGUE_MODE = 'curated';
  for (const q of ['tomato', 'tomate', 'egg', 'œufs', 'milk', 'lait', 'cheese', 'fromage', 'butter', 'beurre']) {
    const { products } = await getProducts({ search: q, limit: 100 });
    assertNoFalsePositives(products, q);
  }
});

test('butter alias does not return peanut butter', async (t) => {
  if (!dbReady) return t.skip('prerequisites not met');
  env.CATALOGUE_MODE = 'curated';
  const { products } = await getProducts({ search: 'beurre', limit: 100 });
  const found = ids(products);
  assert.ok(found.includes(BUTTER_ID.toLowerCase()), 'beurre should find dairy butter');
  for (const id of PEANUT_BUTTER_IDS) {
    assert.equal(found.includes(id.toLowerCase()), false, 'beurre must not match peanut butter');
  }
});

test('pagination totals stay stable and pages do not overlap', async (t) => {
  if (!dbReady) return t.skip('prerequisites not met');
  env.CATALOGUE_MODE = 'curated';
  const page1 = await getProducts({ search: 'tomato', limit: 1, offset: 0 });
  const page2 = await getProducts({ search: 'tomato', limit: 1, offset: 1 });
  assert.ok(page1.total >= 1);
  assert.equal(page2.total, page1.total);
  if (page1.total > 1) {
    assert.equal(page1.products.length, 1);
    assert.equal(page2.products.length, 1);
    assert.notEqual(ids(page1.products)[0], ids(page2.products)[0]);
  }
  const unpaged = await getProducts({ search: 'tomato', limit: 100 });
  assert.equal(unpaged.products.length, unpaged.total);
  assert.equal(unpaged.total, page1.total);
});

test('unknown free text remains ordinary search and stays inside the 91-product gate', async (t) => {
  if (!dbReady) return t.skip('prerequisites not met');
  env.CATALOGUE_MODE = 'curated';
  const miss = await getProducts({ search: 'xyzzy-not-a-product', limit: 100 });
  assert.equal(miss.products.length, 0);
  assert.equal(miss.total, 0);

  const brand = await getProducts({ search: 'Bondin', limit: 100 });
  assert.ok(brand.products.length > 0, 'unknown brand-like text should still match names');
  for (const p of brand.products) {
    assert.equal(p.isCurated, true);
    assert.match(String(p.name || p.sourceName || ''), /bondin/i);
  }

  const all = await getProducts({ limit: 1 });
  assert.equal(all.total, 91);
});
