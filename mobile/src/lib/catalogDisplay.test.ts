import test from 'node:test';
import assert from 'node:assert/strict';

import { translate, type TranslationKey } from '../i18n/translations';
import type { Product } from '../types/catalog';
import { categoryLabel, hasCatalogueDescription, productCategoryText } from './catalogDisplay';

const en = (k: TranslationKey) => translate(k, 'en');
const fr = (k: TranslationKey) => translate(k, 'fr');

function product(p: Partial<Product>): Product {
  return { id: 'p1', ...p } as Product;
}

// --- Compact (card) category selection ---

test('compact: curated product shows the localised SUBCATEGORY alone', () => {
  const p = product({ displayCategory: 'food', displaySubcategory: 'Pasta' });
  assert.equal(productCategoryText(p, en, { compact: true }), 'Pasta');
  assert.equal(productCategoryText(p, fr, { compact: true }), 'Pâtes');

  const q = product({ displayCategory: 'food', displaySubcategory: 'Cooking sauces' });
  assert.equal(productCategoryText(q, en, { compact: true }), 'Cooking sauces');
  assert.equal(productCategoryText(q, fr, { compact: true }), 'Sauces de cuisine');
});

test('compact: curated product with no subcategory falls back to the main category', () => {
  const p = product({ displayCategory: 'household', displaySubcategory: null });
  assert.equal(productCategoryText(p, en, { compact: true }), 'Household');
  assert.equal(productCategoryText(p, fr, { compact: true }), 'Maison');
});

test('compact: unknown subcategory falls back to its stored text (never dropped)', () => {
  const p = product({ displayCategory: 'food', displaySubcategory: 'Frozen stuff' });
  assert.equal(productCategoryText(p, en, { compact: true }), 'Frozen stuff');
  assert.equal(productCategoryText(p, fr, { compact: true }), 'Frozen stuff');
});

// --- Full (detail) category text ---

test('full: curated product shows "Main category · Subcategory", both localised', () => {
  const p = product({ displayCategory: 'food', displaySubcategory: 'Cooking sauces' });
  assert.equal(productCategoryText(p, en), 'Food · Cooking sauces');
  assert.equal(productCategoryText(p, fr), 'Alimentation · Sauces de cuisine');
});

test('full: curated product with no subcategory shows just the main category', () => {
  const p = product({ displayCategory: 'drinks', displaySubcategory: '' });
  assert.equal(productCategoryText(p, en), 'Drinks');
  assert.equal(productCategoryText(p, fr), 'Boissons');
});

// --- Non-curated fallback (unchanged behaviour) ---

test('non-curated product keeps the imported family label, compact or not', () => {
  const p = product({ familyName: 'PÄTES', subFamilyName: 'Pâtes Spéciales' });
  assert.equal(productCategoryText(p, en), 'PÄTES · Pâtes Spéciales');
  assert.equal(productCategoryText(p, en, { compact: true }), 'PÄTES · Pâtes Spéciales');
  assert.equal(productCategoryText(p, fr, { compact: true }), 'PÄTES · Pâtes Spéciales');
});

test('categoryLabel: family + subfamily, or whichever is present', () => {
  assert.equal(
    categoryLabel(product({ familyName: 'HYGIENE', subFamilyName: 'Savon' })),
    'HYGIENE · Savon',
  );
  assert.equal(categoryLabel(product({ familyName: 'HYGIENE' })), 'HYGIENE');
  assert.equal(categoryLabel(product({})), '');
});

test('hasCatalogueDescription hides empty or whitespace-only placeholders', () => {
  assert.equal(hasCatalogueDescription('Fresh farm eggs'), true);
  assert.equal(hasCatalogueDescription('  '), false);
  assert.equal(hasCatalogueDescription(''), false);
  assert.equal(hasCatalogueDescription(null), false);
  assert.equal(hasCatalogueDescription(undefined), false);
});
