import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closePool } from '../config/db.js';
import { env } from '../config/env.js';
import {
  getProducts,
  getProductById,
  getProductByBarcode,
  getCatalogSections,
  getFamilies,
  isProductInCustomerCatalogue,
} from './catalog.service.js';
import { AppError } from '../utils/AppError.js';

// Curated catalogue mode against a real database (read only). Skipped when no
// database is available.

let curatedReady = false;
let fullImportReady = false;
let curatedId = null;
let nonCuratedId = null;
let nonCuratedName = null;
let nonCuratedBarcode = null;
let importedBaseline = null;
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

    const curated = await pool.request().query(`
      SELECT TOP 1 m.ProductId
      FROM dbo.SB_ProductMetadata m
      WHERE m.CurationVersion IS NOT NULL
        AND (m.IsVisible IS NULL OR m.IsVisible = 1)
      ORDER BY m.ProductId
    `);
    curatedId = curated.recordset[0]?.ProductId ?? null;

    // A listable, non-hidden source product that is not in the curated set, and
    // that has at least one barcode (so we can exercise the scan path).
    const nonCurated = await pool.request().query(`
      SELECT TOP 1 s.IDArt, s.LibArt, bc.CodBar
      FROM dbo.TabStocksaico s
      LEFT JOIN dbo.SB_ProductMetadata m ON m.ProductId = s.IDArt
      CROSS APPLY (
        SELECT TOP 1 LTRIM(RTRIM(b.CodBar)) AS CodBar
        FROM dbo.TabStockBarCodesaico b
        WHERE b.IDArt = s.IDArt AND LTRIM(RTRIM(b.CodBar)) <> N''
        ORDER BY b.CodBar
      ) bc
      WHERE m.CurationVersion IS NULL
        AND (m.IsVisible IS NULL OR m.IsVisible = 1)
        AND (s.Archived IS NULL OR s.Archived = 0)
        AND (s.Blockage IS NULL OR s.Blockage = 0)
      ORDER BY s.IDArt
    `);
    nonCuratedId = nonCurated.recordset[0]?.IDArt ?? null;
    nonCuratedName = nonCurated.recordset[0]?.LibArt ?? null;
    nonCuratedBarcode = nonCurated.recordset[0]?.CodBar ?? null;

    // Confirm the non-curated pick is reachable in `full` mode
    // (site policy etc.) so the "full mode restores" assertions are meaningful.
    if (nonCuratedId) {
      env.CATALOGUE_MODE = 'full';
      const reachable = await getProductById(nonCuratedId);
      env.CATALOGUE_MODE = originalMode;
      if (!reachable) nonCuratedId = null;
    }

    const counts = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.SB_Products) AS Products,
        (SELECT COUNT(*) FROM dbo.SB_ProductBarcodes) AS Barcodes,
        (SELECT COUNT(*) FROM dbo.TabStocksaico) AS Stock
    `);
    importedBaseline = counts.recordset[0];

    curatedReady = Boolean(curatedId);
    fullImportReady = Boolean(curatedId && nonCuratedId && nonCuratedBarcode);
  } catch {
    curatedReady = false;
    fullImportReady = false;
  }
});

after(async () => {
  env.CATALOGUE_MODE = originalMode;
  await closePool();
});

test('(setup) curated 91-product seed is available', (t) => {
  if (!curatedReady) {
    t.skip('No reachable DB with the curated 91-product seed.');
  }
});

test('(setup) full import still has a non-curated barcoded product', (t) => {
  if (!fullImportReady) {
    t.skip(
      'No non-curated barcoded product (expected on SmartBasketDemo). Isolated fixture coverage: catalog.curatedBarcode.contract.test.js.',
    );
  }
});

test('curated mode: product list only returns curated products', async (t) => {
  if (!curatedReady) return t.skip('prerequisites not met');
  env.CATALOGUE_MODE = 'curated';
  const { products, total } = await getProducts({ limit: 100, offset: 0 });
  assert.ok(products.length > 0, 'expected some curated products');
  assert.equal(total, 91, `curated total ${total} should be the approved 91-product set`);
  for (const p of products) {
    assert.equal(p.isCurated, true, `product ${p.id} (${p.name}) leaked into a curated-mode list`);
  }
});

test('curated mode: search never surfaces a non-curated product', async (t) => {
  if (!fullImportReady) return t.skip('requires a non-curated source product');
  env.CATALOGUE_MODE = 'curated';
  const token = String(nonCuratedName || '').trim().split(/\s+/)[0] || '';
  if (token.length < 3) return t.skip('no usable search token for the non-curated product');
  const { products } = await getProducts({ search: token, limit: 100 });
  assert.ok(
    !products.some((p) => p.id === nonCuratedId),
    `search "${token}" leaked non-curated product ${nonCuratedId}`,
  );
  for (const p of products) assert.equal(p.isCurated, true);
});

test('curated mode: detail returns a curated product and hides a non-curated one', async (t) => {
  if (!fullImportReady) return t.skip('requires a non-curated source product');
  env.CATALOGUE_MODE = 'curated';
  const curated = await getProductById(curatedId);
  assert.ok(curated && curated.id === curatedId, 'curated product detail should resolve');
  const hidden = await getProductById(nonCuratedId);
  assert.equal(hidden, null, 'non-curated product detail must be null in curated mode');
});

test('curated mode: eligibility + brand facets exclude non-curated products', async (t) => {
  if (!fullImportReady) return t.skip('requires a non-curated source product');
  env.CATALOGUE_MODE = 'curated';
  assert.equal(await isProductInCustomerCatalogue(nonCuratedId), false);
  assert.equal(await isProductInCustomerCatalogue(curatedId), true);
  const families = await getFamilies();
  assert.ok(Array.isArray(families), 'families facet still returns a list');
});

test('curated mode: catalogue sections count only curated visible products', async (t) => {
  if (!curatedReady) return t.skip('prerequisites not met');
  env.CATALOGUE_MODE = 'curated';
  const pool = await getPool();
  const { recordset } = await pool.request().query(`
    SELECT COUNT(*) AS c
    FROM dbo.SB_ProductMetadata m
    JOIN dbo.TabStocksaico s ON s.IDArt = m.ProductId
    WHERE m.CurationVersion IS NOT NULL AND m.IsVisible = 1
  `);
  const curatedVisible = recordset[0].c;
  const sections = await getCatalogSections();
  const featured = sections.find((s) => s.key === 'featured');
  const categoryTotal = sections
    .filter((s) => s.key !== 'featured')
    .reduce((n, s) => n + s.count, 0);
  assert.equal(categoryTotal, curatedVisible, 'category section counts must sum to the curated visible set');
  assert.ok(featured.count <= curatedVisible);
});

test('curated mode: scanning a real-but-not-curated barcode raises NOT_IN_CURATED_CATALOGUE', async (t) => {
  if (!fullImportReady) return t.skip('requires a non-curated barcode; fixture coverage is catalog.curatedBarcode.contract.test.js');
  env.CATALOGUE_MODE = 'curated';
  await assert.rejects(
    () => getProductByBarcode(nonCuratedBarcode),
    (err) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 404);
      assert.equal(err.code, 'NOT_IN_CURATED_CATALOGUE');
      return true;
    },
  );
});

test('recipeEligibleOnly narrows to curated recipe-eligible rows with a real canonical type', async (t) => {
  if (!curatedReady) return t.skip('prerequisites not met');
  env.CATALOGUE_MODE = 'curated';
  const { products } = await getProducts({ recipeEligibleOnly: true, limit: 100 });
  assert.ok(products.length > 0, 'expected some curated recipe-eligible products');
  const ids = products.map((p) => p.id);
  const pool = await getPool();
  const req = pool.request();
  ids.forEach((id, i) => req.input(`id${i}`, id));
  const bound = await req.query(`
    SELECT m.ProductId, m.CurationVersion, m.IsRecipeEligible, m.CanonicalType
    FROM dbo.SB_ProductMetadata m
    WHERE m.ProductId IN (${ids.map((_, i) => `@id${i}`).join(', ')})
  `);
  assert.equal(bound.recordset.length, ids.length, 'every returned product has a metadata row');
  for (const row of bound.recordset) {
    assert.notEqual(row.CurationVersion, null);
    assert.equal(row.IsRecipeEligible, true);
    assert.ok(row.CanonicalType && row.CanonicalType !== 'non_food', `bad canonical type for ${row.ProductId}`);
  }
});

test('full mode restores whole-catalogue reads', async (t) => {
  if (!fullImportReady) return t.skip('requires the full imported catalogue');
  env.CATALOGUE_MODE = 'full';
  const detail = await getProductById(nonCuratedId);
  assert.ok(detail && detail.id === nonCuratedId, 'full mode must resolve a non-curated product');
  const byBarcode = await getProductByBarcode(nonCuratedBarcode);
  assert.ok(byBarcode && byBarcode.id === nonCuratedId, 'full mode barcode scan resolves the product');
  const { total } = await getProducts({ limit: 1 });
  assert.ok(total > 1000, `full mode should see the whole import, got total ${total}`);
  env.CATALOGUE_MODE = 'curated';
});

test('imported tables are unchanged by every read in this file', async (t) => {
  if (!curatedReady) return t.skip('prerequisites not met');
  const pool = await getPool();
  const { recordset } = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM dbo.SB_Products) AS Products,
      (SELECT COUNT(*) FROM dbo.SB_ProductBarcodes) AS Barcodes,
      (SELECT COUNT(*) FROM dbo.TabStocksaico) AS Stock
  `);
  assert.deepEqual(recordset[0], importedBaseline, 'imported table row counts must be identical before/after');
});

test('curated mode: active membership is CurationVersion 3 with 91 products', async (t) => {
  if (!curatedReady) return t.skip('prerequisites not met');
  const pool = await getPool();
  const { recordset } = await pool.request().query(`
    SELECT
      SUM(CASE WHEN CurationVersion = 3 THEN 1 ELSE 0 END) AS Version3,
      SUM(CASE WHEN CurationVersion IN (1, 2) THEN 1 ELSE 0 END) AS LeftoverV1V2,
      SUM(CASE WHEN CurationVersion IS NOT NULL THEN 1 ELSE 0 END) AS AnyCurated,
      SUM(CASE WHEN CurationVersion = 3 AND IsRecipeEligible = 1 THEN 1 ELSE 0 END) AS RecipeEligible,
      SUM(CASE WHEN CurationVersion = 3 AND CanonicalType = N'non_food' THEN 1 ELSE 0 END) AS NonFood,
      SUM(CASE WHEN CurationVersion = 3 AND CanonicalType IS NULL THEN 1 ELSE 0 END) AS CanonicalNull,
      SUM(CASE WHEN CurationVersion = 3 AND DisplayCategory = N'drinks' AND CanonicalType = N'non_food' THEN 1 ELSE 0 END) AS DrinksNonFood,
      SUM(CASE WHEN CurationVersion = 3 AND ProductId IN (
            '028D8FC8-CD26-4B5B-A8AB-D37BF03AD884',
            'AA0571B3-EC42-479D-944B-9549C8CC3278'
          ) AND IsRecipeEligible = 1 THEN 1 ELSE 0 END) AS FalsePositiveEligible
    FROM dbo.SB_ProductMetadata
  `);
  const row = recordset[0];
  assert.equal(row.Version3, 91);
  assert.equal(row.LeftoverV1V2, 0);
  assert.equal(row.AnyCurated, 91);
  assert.equal(row.RecipeEligible, 35);
  assert.equal(row.NonFood, 26);
  assert.equal(row.CanonicalNull, 30);
  assert.equal(row.DrinksNonFood, 0);
  assert.equal(row.FalsePositiveEligible, 0);
});
