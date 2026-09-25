import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NON_BREAKING_SPACE,
  formatProductName,
  isBrandInName,
  keepQuantityUnitTogether,
  plainProductName,
  shouldShowBrandEyebrow,
} from './productName';

const NBSP = String.fromCharCode(160); // U+00A0

test('NON_BREAKING_SPACE is U+00A0', () => {
  assert.equal(NON_BREAKING_SPACE, NBSP);
  assert.equal(NON_BREAKING_SPACE.charCodeAt(0), 160);
});

// --- Brand containment / normalization ---

test('isBrandInName: brand already present in the name (case-insensitive)', () => {
  assert.equal(isBrandInName('BARILLA', 'Spaghetti Barilla 500 g'), true);
  assert.equal(isBrandInName('Barilla', 'SPAGHETTI BARILLA 500 GR'), true);
});

test('isBrandInName: punctuation / whitespace tolerant (Coca-Cola vs COCA COLA)', () => {
  assert.equal(isBrandInName('COCA COLA', 'Coca-Cola 0,5 L'), true);
  assert.equal(isBrandInName('Coca-Cola', 'COCA COLA 0.5 L'), true);
  assert.equal(isBrandInName('  coca   cola  ', 'Coca-Cola 0,5 L'), true);
});

test('isBrandInName: accent-folded (DELICE vs Délice)', () => {
  assert.equal(isBrandInName('DELICE', 'Lait Délice UHT entier 1 L'), true);
  assert.equal(isBrandInName('Délice', 'Jus Delice orange 1 L'), true);
});

test('isBrandInName: only whole-token matches, not substrings', () => {
  assert.equal(isBrandInName('bar', 'Spaghetti Barilla 500 g'), false);
  assert.equal(isBrandInName('rill', 'Spaghetti Barilla 500 g'), false);
});

test('isBrandInName: empty / missing inputs are never "contained"', () => {
  assert.equal(isBrandInName('', 'anything'), false);
  assert.equal(isBrandInName('Barilla', ''), false);
  assert.equal(isBrandInName(null, 'Barilla pasta'), false);
  assert.equal(isBrandInName('Barilla', null), false);
});

// --- Brand eyebrow visibility ---

test('shouldShowBrandEyebrow: hidden when the brand is already in the name', () => {
  assert.equal(shouldShowBrandEyebrow('BARILLA', 'Spaghetti Barilla 500 g'), false);
  assert.equal(shouldShowBrandEyebrow('Coca-Cola', 'Coca-Cola 0,5 L'), false);
});

test('shouldShowBrandEyebrow: shown when the brand adds information', () => {
  assert.equal(shouldShowBrandEyebrow('Barilla', 'Spaghetti 500 g'), true);
  assert.equal(shouldShowBrandEyebrow('Fromy', 'Cheddar râpé 120 g'), true);
});

test('shouldShowBrandEyebrow: never shown without a real brand', () => {
  assert.equal(shouldShowBrandEyebrow('', 'Spaghetti 500 g'), false);
  assert.equal(shouldShowBrandEyebrow('   ', 'Spaghetti 500 g'), false);
  assert.equal(shouldShowBrandEyebrow(null, 'Spaghetti 500 g'), false);
});

// --- Non-breaking quantity + unit ---

test('keepQuantityUnitTogether: glues known quantity/unit pairs with U+00A0', () => {
  assert.equal(keepQuantityUnitTogether('Spaghetti Barilla 500 g'), `Spaghetti Barilla 500${NBSP}g`);
  assert.equal(keepQuantityUnitTogether('Eau minérale Safia 1,5 L'), `Eau minérale Safia 1,5${NBSP}L`);
  assert.equal(keepQuantityUnitTogether('Liquide vaisselle 580 ml'), `Liquide vaisselle 580${NBSP}ml`);
  assert.equal(keepQuantityUnitTogether('Coca-Cola 0.33 cl'), `Coca-Cola 0.33${NBSP}cl`);
  assert.equal(keepQuantityUnitTogether('Beurre 100 mg'), `Beurre 100${NBSP}mg`);
});

test('keepQuantityUnitTogether: count words (rouleaux) and bare metres', () => {
  assert.equal(
    keepQuantityUnitTogether('Papier hygiénique Netto — 4 rouleaux'),
    `Papier hygiénique Netto — 4${NBSP}rouleaux`,
  );
  assert.equal(keepQuantityUnitTogether('Papier aluminium Stark 8 m'), `Papier aluminium Stark 8${NBSP}m`);
});

test('keepQuantityUnitTogether: no regular space remains between number and unit', () => {
  const out = keepQuantityUnitTogether('Spaghetti Barilla 500 g');
  assert.ok(!out.includes('500 g')); // no regular space between quantity and unit
  assert.ok(out.includes(`500${NBSP}g`));
});

test('keepQuantityUnitTogether: unknown units / non-unit words are untouched', () => {
  assert.equal(keepQuantityUnitTogether('Café 3 en 1'), 'Café 3 en 1');
  assert.equal(keepQuantityUnitTogether('Lot de 6 unités'), 'Lot de 6 unités');
  assert.equal(keepQuantityUnitTogether('Sacs poubelle ICA 50 × 65'), 'Sacs poubelle ICA 50 × 65');
  assert.equal(keepQuantityUnitTogether('Œufs — boîte de 6'), 'Œufs — boîte de 6');
});

test('keepQuantityUnitTogether: plain text with no quantities is returned unchanged', () => {
  assert.equal(keepQuantityUnitTogether('Just some words'), 'Just some words');
  assert.equal(keepQuantityUnitTogether(''), '');
});

test('keepQuantityUnitTogether: does not fire on "litres" (unit must be a whole token)', () => {
  assert.equal(keepQuantityUnitTogether('Bouteille 2 litres'), 'Bouteille 2 litres');
});

// --- FormatProductName / plainProductName ---

test('formatProductName trims and glues; null/empty -> empty string', () => {
  assert.equal(formatProductName('  Spaghetti Barilla 500 g '), `Spaghetti Barilla 500${NBSP}g`);
  assert.equal(formatProductName(null), '');
  assert.equal(formatProductName(undefined), '');
  assert.equal(formatProductName('   '), '');
});

test('plainProductName restores a natural (regular-space) form for screen readers', () => {
  assert.equal(plainProductName(`Spaghetti Barilla 500${NBSP}g`), 'Spaghetti Barilla 500 g');
  assert.equal(
    plainProductName(formatProductName('Eau minérale Safia 1,5 L')),
    'Eau minérale Safia 1,5 L',
  );
  assert.ok(!plainProductName(formatProductName('Lait Délice 1 L')).includes(NBSP));
});
