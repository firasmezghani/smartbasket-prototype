import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { translations, type TranslationKey } from '../i18n/translations';
import {
  CURATED_SUBCATEGORIES,
  SUBCATEGORY_LABEL_KEY_BY_NORMALIZED,
  normalizeSubcategory,
  subcategoryLabel,
  subcategoryLabelKey,
} from './catalogSubcategory';

const enT = (k: TranslationKey) => translations.en[k];
const frT = (k: TranslationKey) => translations.fr[k];

const artifactPath = join(process.cwd(), '../server/src/data/catalogue/curated-v3-approved.json');

function loadCuratedV3(): { products: Array<{ productId: string; subcategory: string; cleanName: string }> } {
  return JSON.parse(readFileSync(artifactPath, 'utf8'));
}

test('CURATED_SUBCATEGORIES matches the distinct English labels in curated v3', () => {
  const data = loadCuratedV3();
  const distinct = [...new Set(data.products.map((p) => p.subcategory))].sort((a, b) => a.localeCompare(b));
  assert.deepEqual([...CURATED_SUBCATEGORIES].sort((a, b) => a.localeCompare(b)), distinct);
  assert.equal(CURATED_SUBCATEGORIES.length, distinct.length);
});

test('every curated v3 product has a supported localised subcategory (no raw fallback)', () => {
  const data = loadCuratedV3();
  assert.equal(data.products.length, 91);
  const unmapped: string[] = [];
  for (const p of data.products) {
    const key = subcategoryLabelKey(p.subcategory);
    if (!key) unmapped.push(`${p.productId} ${p.subcategory} ${p.cleanName}`);
    else {
      assert.match(key, /^catalog\.subcategory\./);
      assert.ok(translations.en[key].trim().length > 0, `empty en for ${key}`);
      assert.ok(translations.fr[key].trim().length > 0, `empty fr for ${key}`);
      assert.notEqual(subcategoryLabel(p.subcategory, enT), p.subcategory === 'Frozen foods' ? p.subcategory : '');
      // Known values must not use the raw-fallback path: English output equals the EN key text.
      assert.equal(subcategoryLabel(p.subcategory, enT), translations.en[key]);
      assert.equal(subcategoryLabel(p.subcategory, frT), translations.fr[key]);
    }
  }
  assert.deepEqual(unmapped, []);
});

test('every distinct current curated subcategory maps to a non-empty English and French label', () => {
  const data = loadCuratedV3();
  const distinct = [...new Set(data.products.map((p) => p.subcategory))];
  for (const value of distinct) {
    const key = subcategoryLabelKey(value);
    assert.ok(key, `no key for "${value}"`);
    const en = translations.en[key as TranslationKey];
    const fr = translations.fr[key as TranslationKey];
    assert.ok(typeof en === 'string' && en.trim().length > 0, `empty en for ${value}`);
    assert.ok(typeof fr === 'string' && fr.trim().length > 0, `empty fr for ${value}`);
  }
});

test('representative French stored values render in English (historical aliases)', () => {
  assert.equal(subcategoryLabel('Tomate', enT), 'Tomato products');
  assert.equal(subcategoryLabel('Oeufs', enT), 'Eggs');
  assert.equal(subcategoryLabel('Thon', enT), 'Canned fish');
  assert.equal(subcategoryLabel('Savon', enT), 'Bath and body');
  assert.equal(subcategoryLabel('Shampoing', enT), 'Hair care');
  assert.equal(subcategoryLabel('Café', enT), 'Coffee and tea');
  assert.equal(subcategoryLabel('Lait', enT), 'Milk');
  assert.equal(subcategoryLabel('Jus', enT), 'Juice');
  assert.equal(subcategoryLabel('Soda', enT), 'Soft drinks');
  assert.equal(subcategoryLabel('Yaourt', enT), 'Yogurt');
  assert.equal(subcategoryLabel('Dentifrice', enT), 'Oral care');
  assert.equal(subcategoryLabel('Déodorants', enT), 'Deodorant');
  assert.equal(subcategoryLabel('Soin de Linge', enT), 'Laundry');
  assert.equal(subcategoryLabel('Olive', enT), 'Cooking oil');
  assert.equal(subcategoryLabel('Pâtes Spéciales', enT), 'Pasta');
});

test('representative controlled English values render in French', () => {
  assert.equal(subcategoryLabel('Tomato products', frT), 'Produits à la tomate');
  assert.equal(subcategoryLabel('Eggs', frT), 'Œufs');
  assert.equal(subcategoryLabel('Canned fish', frT), 'Poisson en conserve');
  assert.equal(subcategoryLabel('Bath and body', frT), 'Hygiène corporelle');
  assert.equal(subcategoryLabel('Hair care', frT), 'Soins capillaires');
  assert.equal(subcategoryLabel('Spreads', frT), 'Pâtes à tartiner');
  assert.equal(subcategoryLabel('Canned vegetables', frT), 'Légumes en conserve');
  assert.equal(subcategoryLabel('Pasta', frT), 'Pâtes');
  assert.equal(subcategoryLabel('Yogurt', frT), 'Yaourt');
  assert.equal(subcategoryLabel('Fragrance', frT), 'Parfum');
  assert.equal(subcategoryLabel('Household sundries', frT), 'Accessoires ménagers');
});

test('EN/FR key parity for every catalog.subcategory.* key used by the map', () => {
  const keys = new Set(Object.values(SUBCATEGORY_LABEL_KEY_BY_NORMALIZED));
  for (const key of keys) {
    assert.ok(key in translations.en, `en missing ${key}`);
    assert.ok(key in translations.fr, `fr missing ${key}`);
    assert.ok(translations.en[key].trim().length > 0, `en empty ${key}`);
    assert.ok(translations.fr[key].trim().length > 0, `fr empty ${key}`);
  }
  for (const value of CURATED_SUBCATEGORIES) {
    const key = subcategoryLabelKey(value) as TranslationKey;
    assert.ok(key, value);
    assert.equal(subcategoryLabel(value, enT), translations.en[key]);
    assert.equal(subcategoryLabel(value, frT), translations.fr[key]);
  }
});

test('English display matches the stored English label for every current curated subcategory', () => {
  for (const value of CURATED_SUBCATEGORIES) {
    assert.equal(subcategoryLabel(value, enT), value);
  }
});

test('lookup normalises case, surrounding and repeated whitespace', () => {
  assert.equal(subcategoryLabel(' Pasta ', enT), 'Pasta');
  assert.equal(subcategoryLabel('PASTA', frT), 'Pâtes');
  assert.equal(subcategoryLabel('pAsTa', enT), 'Pasta');
  assert.equal(subcategoryLabel('\tPasta\n', frT), 'Pâtes');
  assert.equal(subcategoryLabel('rice  and   grains', enT), 'Rice and grains');
  assert.equal(subcategoryLabel('  Cooking Oil', frT), 'Huile de cuisine');
  assert.equal(subcategoryLabel('  TOMATE  ', enT), 'Tomato products');

  assert.equal(normalizeSubcategory('  Bath   and  Body '), 'bath and body');
  assert.equal(normalizeSubcategory('Cheese'), 'cheese');
});

test('ambiguous historical French buckets are not given a single false label', () => {
  // These source groups mixed unrelated products; they must not map to one key.
  for (const value of ['Beurre', 'Légumes', 'Pâtes Alimentaires', 'Passion Pâtisserie', 'Pain Spécial', 'Electroménager', 'Netoyant Classique']) {
    assert.equal(subcategoryLabelKey(value), null, value);
    assert.equal(subcategoryLabel(value, enT), value);
  }
});

test('unknown values fall back to their stored text, trimmed (never dropped)', () => {
  assert.equal(subcategoryLabel('Frozen foods', enT), 'Frozen foods');
  assert.equal(subcategoryLabel('  Pet supplies  ', frT), 'Pet supplies');
  assert.equal(subcategoryLabelKey('Frozen foods'), null);
});

test('null / undefined / empty / whitespace yield an empty string', () => {
  for (const v of [null, undefined, '', '   ', '\t\n'] as (string | null | undefined)[]) {
    assert.equal(subcategoryLabel(v, enT), '');
    assert.equal(subcategoryLabel(v, frT), '');
    assert.equal(subcategoryLabelKey(v), null);
    assert.equal(normalizeSubcategory(v), '');
  }
});

test('a translator is not called for empty or unknown values', () => {
  const boom = (): string => {
    throw new Error('translator must not be called');
  };
  assert.equal(subcategoryLabel(null, boom as (k: TranslationKey) => string), '');
  assert.equal(subcategoryLabel('Frozen foods', boom as (k: TranslationKey) => string), 'Frozen foods');
});
