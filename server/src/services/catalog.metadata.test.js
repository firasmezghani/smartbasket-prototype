import test from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../utils/AppError.js';
import {
  CATALOG_DISPLAY_CATEGORIES,
  CATALOG_SECTION_DEFS,
  buildCatalogSectionCounts,
  buildProductImageAssetUrl,
  computeEffectiveMetadata,
  computeShoppingClassification,
  mapProductRow,
  normalizeMetadataDisplayCategory,
  parseCatalogDisplayCategoryFilter,
  parseCatalogFlag,
} from './catalog.service.js';

// A minimal imported (no-metadata) TabStocksaico row.
function importedRow(overrides = {}) {
  return {
    IDArt: '11111111-1111-1111-1111-111111111111',
    CodArt: 'P-1',
    LibArt: 'Imported Name',
    CodFam: 'F1',
    LibFam: 'Family One',
    CodSFam: 'S1',
    DesSFam: 'Sub One',
    Remise: null,
    PrixSite: 2.5,
    Qte: 3,
    HasImageBinary: 0,
    Marque: 'BrandCo',
    MetaProductId: null,
    ...overrides,
  };
}

// A row that also carries a joined metadata record.
function curatedRow(meta = {}) {
  return importedRow({
    MetaProductId: '11111111-1111-1111-1111-111111111111',
    MetaDisplayName: null,
    MetaDisplayCategory: null,
    MetaDisplaySubcategory: null,
    MetaIntelligenceType: 'none',
    MetaIsVisible: 1,
    MetaIsFeatured: 0,
    MetaIsRecipeEligible: 0,
    MetaIsReplenishmentEligible: 0,
    MetaExpectedRepurchaseDays: null,
    MetaImagePath: null,
    MetaSortOrder: 0,
    ...meta,
  });
}

// --- NormalizeMetadataDisplayCategory ---

test('normalizeMetadataDisplayCategory maps supported values and rejects the rest', () => {
  assert.equal(normalizeMetadataDisplayCategory('Food'), 'food');
  assert.equal(normalizeMetadataDisplayCategory('  DRINKS '), 'drinks');
  assert.equal(normalizeMetadataDisplayCategory('personal care'), 'personal-care');
  assert.equal(normalizeMetadataDisplayCategory('personal_care'), 'personal-care');
  assert.equal(normalizeMetadataDisplayCategory('other'), 'other');
  assert.equal(normalizeMetadataDisplayCategory('groceries'), null);
  assert.equal(normalizeMetadataDisplayCategory(''), null);
  assert.equal(normalizeMetadataDisplayCategory(null), null);
  assert.equal(normalizeMetadataDisplayCategory(undefined), null);
});

// --- ParseCatalogDisplayCategoryFilter ---

test('parseCatalogDisplayCategoryFilter returns null when the filter is absent', () => {
  assert.equal(parseCatalogDisplayCategoryFilter(undefined), null);
  assert.equal(parseCatalogDisplayCategoryFilter(null), null);
  assert.equal(parseCatalogDisplayCategoryFilter(''), null);
  assert.equal(parseCatalogDisplayCategoryFilter('   '), null);
});

test('parseCatalogDisplayCategoryFilter only ever yields a canonical slug', () => {
  for (const slug of CATALOG_DISPLAY_CATEGORIES) {
    assert.equal(parseCatalogDisplayCategoryFilter(slug), slug);
    assert.equal(parseCatalogDisplayCategoryFilter(slug.toUpperCase()), slug);
  }
  // Hostile / unsupported input never reaches SQL as a bound value: it throws 400.
  for (const bad of ["food'; DROP TABLE", 'food OR 1=1', 'meat', 'snacks', '../etc']) {
    assert.throws(
      () => parseCatalogDisplayCategoryFilter(bad),
      (err) => err instanceof AppError && err.statusCode === 400,
    );
  }
});

// --- ParseCatalogFlag ---

test('parseCatalogFlag is true only for explicit true/1', () => {
  assert.equal(parseCatalogFlag('true'), true);
  assert.equal(parseCatalogFlag('TRUE'), true);
  assert.equal(parseCatalogFlag('1'), true);
  assert.equal(parseCatalogFlag(true), true);
  assert.equal(parseCatalogFlag('false'), false);
  assert.equal(parseCatalogFlag('0'), false);
  assert.equal(parseCatalogFlag(''), false);
  assert.equal(parseCatalogFlag(undefined), false);
  assert.equal(parseCatalogFlag('yes'), false);
});

// --- BuildProductImageAssetUrl ---

test('buildProductImageAssetUrl accepts safe relative filenames', () => {
  assert.equal(buildProductImageAssetUrl('granola.jpg'), '/product-images/granola.jpg');
  assert.equal(
    buildProductImageAssetUrl('  snacks/granola-500g.png  '),
    '/product-images/snacks/granola-500g.png',
  );
  assert.equal(buildProductImageAssetUrl('./a.webp'), '/product-images/a.webp');
});

test('buildProductImageAssetUrl rejects traversal, absolute and protocol paths', () => {
  for (const bad of [
    '',
    '   ',
    '../secret.jpg',
    'a/../../b.jpg',
    '/etc/passwd',
    '/product-images/x.jpg',
    'C:\\images\\x.jpg',
    'images\\x.jpg',
    'http://evil.example/x.jpg',
    'https://evil.example/x.jpg',
    'file:///etc/passwd',
    'data:image/png;base64,AAAA',
    'no-extension',
    'bad name.jpg',
    'trailing.dot.',
  ]) {
    assert.equal(buildProductImageAssetUrl(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
  assert.equal(buildProductImageAssetUrl('with\u0000null.jpg'), null);
});

// --- ComputeEffectiveMetadata ---

test('missing metadata yields safe, visible defaults', () => {
  const meta = computeEffectiveMetadata(importedRow());
  assert.equal(meta.isCurated, false);
  assert.equal(meta.effectiveName, 'Imported Name');
  assert.equal(meta.sourceName, 'Imported Name');
  assert.equal(meta.displayCategory, null);
  assert.equal(meta.displaySubcategory, null);
  assert.equal(meta.isFeatured, false);
  assert.equal(meta.intelligenceType, 'none');
  assert.equal(meta.isRecipeEligible, false);
  assert.equal(meta.isReplenishmentEligible, false);
  assert.equal(meta.expectedRepurchaseDays, null);
  assert.equal(meta.sortOrder, 0);
  assert.equal(meta.metadataImageUrl, null);
});

test('a non-empty DisplayName overrides the imported name', () => {
  assert.equal(
    computeEffectiveMetadata(curatedRow({ MetaDisplayName: 'Nice Granola' })).effectiveName,
    'Nice Granola',
  );
  // Whitespace-only DisplayName does not override.
  assert.equal(
    computeEffectiveMetadata(curatedRow({ MetaDisplayName: '   ' })).effectiveName,
    'Imported Name',
  );
});

test('effective metadata reflects category, featured, intelligence and image', () => {
  const meta = computeEffectiveMetadata(
    curatedRow({
      MetaDisplayCategory: 'Personal Care',
      MetaDisplaySubcategory: '  Skincare ',
      MetaIsFeatured: 1,
      MetaIntelligenceType: 'recipe',
      MetaIsRecipeEligible: 1,
      MetaExpectedRepurchaseDays: 30,
      MetaSortOrder: 5,
      MetaImagePath: 'care/cream.jpg',
    }),
  );
  assert.equal(meta.isCurated, true);
  assert.equal(meta.displayCategory, 'personal-care');
  assert.equal(meta.displaySubcategory, 'Skincare');
  assert.equal(meta.isFeatured, true);
  assert.equal(meta.intelligenceType, 'recipe');
  assert.equal(meta.isRecipeEligible, true);
  assert.equal(meta.isReplenishmentEligible, false);
  assert.equal(meta.expectedRepurchaseDays, 30);
  assert.equal(meta.sortOrder, 5);
  assert.equal(meta.metadataImageUrl, '/product-images/care/cream.jpg');
});

test('eligibility flags are gated by IntelligenceType', () => {
  // Replenishment flag set but IntelligenceType still "none" -> not eligible.
  const meta = computeEffectiveMetadata(
    curatedRow({ MetaIsReplenishmentEligible: 1, MetaIntelligenceType: 'none' }),
  );
  assert.equal(meta.isReplenishmentEligible, false);
  assert.equal(meta.intelligenceType, 'none');
});

test('an unrecognised metadata category falls back to null (uncategorised)', () => {
  const meta = computeEffectiveMetadata(curatedRow({ MetaDisplayCategory: 'frozen' }));
  assert.equal(meta.displayCategory, null);
  assert.equal(meta.isCurated, true);
});

// --- MapProductRow (response compatibility) ---

test('mapProductRow keeps the existing Product fields and adds typed metadata', () => {
  const product = mapProductRow(importedRow());
  // Existing consumers (cart / scan / shopping list / recipe) rely on these.
  for (const key of ['id', 'code', 'name', 'familyCode', 'familyName', 'brand', 'sitePrice']) {
    assert.ok(key in product, `missing ${key}`);
  }
  assert.equal(product.name, 'Imported Name');
  assert.equal(product.isCurated, false);
  assert.equal(product.displayCategory, null);
  assert.equal(product.isFeatured, false);
  assert.equal(product.intelligenceType, 'none');
  assert.equal(product.metadataImageUrl, null);

  const curated = mapProductRow(curatedRow({ MetaDisplayName: 'Override' }));
  assert.equal(curated.name, 'Override');
  assert.equal(curated.sourceName, 'Imported Name');
  assert.equal(curated.isCurated, true);
});

// --- BuildCatalogSectionCounts ---

test('buildCatalogSectionCounts returns all six sections in order, zero kept', () => {
  const sections = buildCatalogSectionCounts([]);
  assert.deepEqual(
    sections.map((s) => s.key),
    ['featured', 'food', 'drinks', 'household', 'personal-care', 'other'],
  );
  assert.deepEqual(
    sections.map((s) => s.titleKey),
    CATALOG_SECTION_DEFS.map((d) => d.titleKey),
  );
  assert.ok(sections.every((s) => s.count === 0));
});

test('buildCatalogSectionCounts counts featured independently of category', () => {
  const rows = [
    { DisplayCategory: 'food', IsFeatured: 1 },
    { DisplayCategory: 'Food', IsFeatured: 0 },
    { DisplayCategory: 'drinks', IsFeatured: true },
    { DisplayCategory: 'frozen', IsFeatured: 1 }, // unrecognised category, still featured
    { DisplayCategory: null, IsFeatured: 0 },
  ];
  const byKey = Object.fromEntries(buildCatalogSectionCounts(rows).map((s) => [s.key, s.count]));
  assert.equal(byKey.featured, 3);
  assert.equal(byKey.food, 2);
  assert.equal(byKey.drinks, 1);
  assert.equal(byKey.household, 0);
  assert.equal(byKey['personal-care'], 0);
  assert.equal(byKey.other, 0);
});

test('shopping classification uses stored CanonicalType independently of recipe eligibility', () => {
  const typed = computeShoppingClassification(
    curatedRow({ MetaCanonicalType: 'milk', MetaIsRecipeEligible: 0, MetaIntelligenceType: 'none' }),
  );
  assert.equal(typed.canonicalType, 'milk');
  assert.equal(typed.classificationStatus, 'typed');
  const none = computeShoppingClassification(importedRow());
  assert.equal(none.canonicalType, null);
  assert.equal(none.classificationStatus, 'unknown');
  const nonFood = computeShoppingClassification(curatedRow({ MetaCanonicalType: 'non_food' }));
  assert.equal(nonFood.canonicalType, null);
  assert.equal(nonFood.classificationStatus, 'non_food');
});

test('shopping classification ignores leftover override-shaped fields and uses metadata CanonicalType', () => {
  const leftover = computeShoppingClassification(
    curatedRow({
      MetaCanonicalType: 'milk',
      OverrideDecision: 'excluded',
      OverrideProductType: 'mozzarella',
    }),
  );
  assert.equal(leftover.canonicalType, 'milk');
  assert.equal(leftover.classificationStatus, 'typed');
  const invalid = computeShoppingClassification(curatedRow({ MetaCanonicalType: '??' }));
  assert.equal(invalid.canonicalType, null);
  assert.equal(invalid.classificationStatus, 'unknown');
});

test('mapProductRow exposes shopping classification and package fields', () => {
  const product = mapProductRow(
    curatedRow({
      MetaCanonicalType: 'egg',
      MetaPackageAmount: 6,
      MetaPackageUnit: 'piece',
    }),
  );
  assert.equal(product.canonicalType, 'egg');
  assert.equal(product.classificationStatus, 'typed');
  assert.equal(product.packageAmount, 6);
  assert.equal(product.packageUnit, 'piece');
  assert.equal(product.isRecipeEligible, false);
});
