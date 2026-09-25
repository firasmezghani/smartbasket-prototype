import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeDisplayCategory, normalizeProduct, normalizeProductList } from './catalogParse';

test('a product with no metadata gets safe defaults', () => {
  const p = normalizeProduct({ id: 'abc', name: 'Rice 1kg', sitePrice: 3.2 });
  assert.equal(p.id, 'abc');
  assert.equal(p.name, 'Rice 1kg');
  assert.equal(p.isCurated, false);
  assert.equal(p.displayCategory, null);
  assert.equal(p.displaySubcategory, null);
  assert.equal(p.isFeatured, false);
  assert.equal(p.intelligenceType, 'none');
  assert.equal(p.isRecipeEligible, false);
  assert.equal(p.isReplenishmentEligible, false);
  assert.equal(p.expectedRepurchaseDays, null);
  assert.equal(p.sortOrder, 0);
  assert.equal(p.metadataImageUrl, null);
  // Untouched passthrough field.
  assert.equal(p.sitePrice, 3.2);
});

test('metadata fields are parsed and typed', () => {
  const p = normalizeProduct({
    id: 'x1',
    name: 'Shampoo',
    sourceName: 'SHMP 250',
    isCurated: true,
    displayCategory: 'personal-care',
    displaySubcategory: ' Hair ',
    isFeatured: true,
    intelligenceType: 'replenishment',
    isReplenishmentEligible: true,
    expectedRepurchaseDays: '45',
    sortOrder: '7',
    metadataImageUrl: '/product-images/shampoo.jpg',
  });
  assert.equal(p.isCurated, true);
  assert.equal(p.sourceName, 'SHMP 250');
  assert.equal(p.displayCategory, 'personal-care');
  assert.equal(p.displaySubcategory, 'Hair');
  assert.equal(p.isFeatured, true);
  assert.equal(p.intelligenceType, 'replenishment');
  assert.equal(p.isReplenishmentEligible, true);
  assert.equal(p.expectedRepurchaseDays, 45);
  assert.equal(p.sortOrder, 7);
  assert.equal(p.metadataImageUrl, '/product-images/shampoo.jpg');
});

test('shopping classification fields are parsed without inventing a type', () => {
  const typed = normalizeProduct({
    id: 'milk-1',
    canonicalType: 'milk',
    classificationStatus: 'typed',
    packageAmount: '1000',
    packageUnit: 'ml',
  });
  assert.equal(typed.canonicalType, 'milk');
  assert.equal(typed.classificationStatus, 'typed');
  assert.equal(typed.packageAmount, 1000);
  assert.equal(typed.packageUnit, 'ml');
  const missing = normalizeProduct({ id: 'x' });
  assert.equal(missing.canonicalType, null);
  assert.equal(missing.classificationStatus, 'unknown');
  const excluded = normalizeProduct({
    id: 'y',
    canonicalType: 'milk',
    classificationStatus: 'excluded',
  });
  assert.equal(excluded.classificationStatus, 'excluded');
});


test('unknown / hostile metadata values are coerced, not trusted', () => {
  const p = normalizeProduct({
    id: 'x2',
    displayCategory: 'frozen',
    intelligenceType: 'wizardry',
    isFeatured: 'true', // not boolean true
    sortOrder: 'NaN',
    expectedRepurchaseDays: 'soon',
  });
  assert.equal(p.displayCategory, null);
  assert.equal(p.intelligenceType, 'none');
  assert.equal(p.isFeatured, false);
  assert.equal(p.sortOrder, 0);
  assert.equal(p.expectedRepurchaseDays, null);
});

test('normalizeDisplayCategory only accepts the five slugs', () => {
  assert.equal(normalizeDisplayCategory('FOOD'), 'food');
  assert.equal(normalizeDisplayCategory('drinks'), 'drinks');
  assert.equal(normalizeDisplayCategory('groceries'), null);
  assert.equal(normalizeDisplayCategory(123), null);
});

test('normalizeProductList drops entries with no id and non-arrays', () => {
  assert.deepEqual(normalizeProductList('nope'), []);
  const list = normalizeProductList([{ id: 'a' }, { name: 'no id' }, { id: '' }, { id: 'b' }]);
  assert.deepEqual(list.map((p) => p.id), ['a', 'b']);
});
