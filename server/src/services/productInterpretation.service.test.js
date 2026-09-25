import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INTERPRETATION_LIMITS,
  UNIT_SYNONYMS,
  COUNTABLE_NOUNS,
  normaliseForInterpretation,
  interpretProductName,
  calculateBasketAvailability,
  createProductInterpreter,
} from './productInterpretation.service.js';
import {
  createIngredientMapper,
  loadIngredientMappingConfig,
} from './recipe/ingredientMapping.service.js';

// A tiny stand-in mapper, deterministic and with no file read.
function stubMapper(product) {
  const name = String(product?.name ?? '')
    .replace(/[Œœ]/g, 'oe')
    .replace(/[Ææ]/g, 'ae')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const has = (w) => new RegExp(`(?:^|[^a-z])${w}(?:[^a-z]|$)`).test(name);
  const mapped = (key, confidence = 'high') => ({ status: 'mapped', ingredientKey: key, confidence, matchedRule: 'synonym_phrase', matchedText: key, candidates: [], reason: 'stub' });
  if (has('oeuf') || has('oeufs') || has('egg') || has('eggs')) return mapped('egg');
  if (has('spaghetti') || has('penne')) return mapped('pasta');
  if (has('riz') || has('rice')) return mapped('rice');
  if (has('lait') || has('milk')) return mapped('milk');
  if (has('tomate')) return mapped('tomato');
  if (name.includes('huile olive') || name.includes('huile d olive')) return mapped('olive_oil');
  if (name.includes('chicken') && name.includes('mushroom')) {
    return { status: 'ambiguous', ingredientKey: null, confidence: 'high', matchedRule: 'synonym_phrase', matchedText: null, candidates: [{ ingredientKey: 'chicken' }, { ingredientKey: 'mushroom' }], reason: 'stub-ambiguous' };
  }
  return { status: 'unresolved', ingredientKey: null, confidence: 'none', matchedRule: 'none', matchedText: null, candidates: [], reason: 'stub-none' };
}

const interpret = (name, extra = {}) =>
  interpretProductName(typeof name === 'string' ? { name } : name, { mapProduct: stubMapper, ...extra });

function assertShape(r) {
  assert.ok(['parsed', 'partial', 'ambiguous', 'unresolved'].includes(r.status), `bad status ${r.status}`);
  assert.ok(['high', 'medium', 'low', 'none'].includes(r.confidence), `bad confidence ${r.confidence}`);
  assert.equal(typeof r.confidence, 'string');
  assert.ok(Array.isArray(r.matchedFields));
  assert.ok(Array.isArray(r.warnings));
  assert.equal(typeof r.reason, 'string');
  for (const k of ['packageCount', 'perPackageAmount', 'totalAmount']) {
    assert.ok(r[k] === null || Number.isFinite(r[k]), `${k} must be null or finite`);
  }
  assert.ok(['piece', 'g', 'ml', null].includes(r.totalUnit));
}

// --- French / English egg-count formats ---

test('egg count formats (FR + EN)', () => {
  const cases = [
    ['BOITE DE 06 OEUFS JAUNE ORANGE', 6],
    ['OEUFS X6', 6],
    ['OEUFS X 12', 12],
    ['6 OEUFS', 6],
    ['PACK 6 OEUFS', 6],
    ['12 EGGS', 12],
    ['BOX OF 10 EGGS', 10],
    ['2 BOITES DE 6 OEUFS', 12],
  ];
  for (const [name, expected] of cases) {
    const r = interpret(name);
    assertShape(r);
    assert.equal(r.productType, 'egg', name);
    assert.equal(r.totalUnit, 'piece', name);
    assert.equal(r.totalAmount, expected, name);
    assert.equal(r.status, 'parsed', name);
  }
});

test('"2 BOITES DE 6 OEUFS" only multiplies because the grammar is explicit', () => {
  const r = interpret('2 BOITES DE 6 OEUFS');
  assert.equal(r.packageCount, 2);
  assert.equal(r.perPackageAmount, 6);
  assert.equal(r.perPackageUnit, 'piece');
  assert.equal(r.totalAmount, 12);
  assert.equal(r.packageType, 'box');
});

test('"OEUFS" alone: product type known, quantity unknown', () => {
  const r = interpret('OEUFS');
  assert.equal(r.productType, 'egg');
  assert.equal(r.totalAmount, null);
  assert.equal(r.status, 'partial');
});

// --- Accents and the oe ligature ---

test('accents and the oe ligature normalise', () => {
  assert.equal(normaliseForInterpretation('Boîte de 6 œufs'), 'boite de 6 oeufs');
  assert.equal(normaliseForInterpretation('Œufs Frais'), 'oeufs frais');
  assert.equal(normaliseForInterpretation('CRÈME FRAÎCHE'), 'creme fraiche');
  const r = interpret('Boîte de 6 œufs');
  assert.equal(r.productType, 'egg');
  assert.equal(r.totalAmount, 6);
  assert.equal(r.totalUnit, 'piece');
});

// --- Grams and kilograms ---

test('grams and kilograms canonicalise to g', () => {
  assert.deepEqual(pick(interpret('SPAGHETTI 500 GR')), { totalAmount: 500, totalUnit: 'g', perPackageUnit: 'g' });
  assert.deepEqual(pick(interpret('PENNE 500 G')), { totalAmount: 500, totalUnit: 'g', perPackageUnit: 'g' });
  assert.deepEqual(pick(interpret('RIZ 1KG')), { totalAmount: 1000, totalUnit: 'g', perPackageUnit: 'kg' });
  assert.deepEqual(pick(interpret('FARINE 1,5 KG')), { totalAmount: 1500, totalUnit: 'g', perPackageUnit: 'kg' });
  assert.deepEqual(pick(interpret('SUCRE 250 GRAMMES')), { totalAmount: 250, totalUnit: 'g', perPackageUnit: 'g' });
});

// --- Millilitres, centilitres, litres ---

test('ml / cl / l canonicalise to ml', () => {
  assert.deepEqual(pick(interpret('HUILE D OLIVE 500 ML')), { totalAmount: 500, totalUnit: 'ml', perPackageUnit: 'ml' });
  assert.deepEqual(pick(interpret('LAIT UHT 1 L')), { totalAmount: 1000, totalUnit: 'ml', perPackageUnit: 'l' });
  assert.deepEqual(pick(interpret('CREME 20 CL')), { totalAmount: 200, totalUnit: 'ml', perPackageUnit: 'cl' });
  assert.deepEqual(pick(interpret('EAU 1,5 LITRES')), { totalAmount: 1500, totalUnit: 'ml', perPackageUnit: 'l' });
});

// --- Decimal comma and decimal point ---

test('decimal comma and decimal point are equivalent', () => {
  assert.equal(interpret('JUS 1,5 L').totalAmount, 1500);
  assert.equal(interpret('JUS 1.5 L').totalAmount, 1500);
  assert.equal(interpret('HUILE 0,75 L').totalAmount, 750);
  assert.equal(interpret('HUILE 0.75 L').totalAmount, 750);
});

// --- Multipacks (6 x 0.5 L) ---

test('multipack 6 x 0.5 L keeps package + total', () => {
  const r = interpret('COLA 6 X 0.5 L');
  assert.equal(r.packageCount, 6);
  assert.equal(r.perPackageAmount, 0.5);
  assert.equal(r.perPackageUnit, 'l');
  assert.equal(r.totalAmount, 3000);
  assert.equal(r.totalUnit, 'ml');
});

test('multipack accepts tight spacing and a decimal comma (4X1,5L)', () => {
  const r = interpret('EAU 4X1,5L');
  assert.equal(r.packageCount, 4);
  assert.equal(r.perPackageAmount, 1.5);
  assert.equal(r.totalAmount, 6000);
  assert.equal(r.totalUnit, 'ml');
});

test('reversed multipack order (500 G x 4)', () => {
  const r = interpret('BISCUIT 500 G X 4');
  assert.equal(r.packageCount, 4);
  assert.equal(r.perPackageUnit, 'g');
  assert.equal(r.totalAmount, 2000);
  assert.equal(r.totalUnit, 'g');
});

// --- Basket multiplication ---

test('calculateBasketAvailability scales a known total by an integer basket qty', () => {
  const egg = interpret('BOITE DE 06 OEUFS');
  assert.deepEqual(pluck(calculateBasketAvailability(egg, 1)), { status: 'available', totalAmount: 6, totalUnit: 'piece' });
  assert.deepEqual(pluck(calculateBasketAvailability(egg, 2)), { status: 'available', totalAmount: 12, totalUnit: 'piece' });
  assert.deepEqual(pluck(calculateBasketAvailability(egg, 5)), { status: 'available', totalAmount: 30, totalUnit: 'piece' });

  const oil = interpret('HUILE D OLIVE 500 ML');
  assert.deepEqual(pluck(calculateBasketAvailability(oil, 3)), { status: 'available', totalAmount: 1500, totalUnit: 'ml' });
});

test('calculateBasketAvailability does not mutate the interpretation', () => {
  const egg = Object.freeze(interpret('BOITE DE 06 OEUFS'));
  assert.doesNotThrow(() => calculateBasketAvailability(egg, 4));
  assert.equal(egg.totalAmount, 6);
});

// --- Unknown quantities ---

test('unknown quantity -> unknown availability, never a guess', () => {
  const r = interpret('OEUFS');
  assert.equal(r.totalAmount, null);
  assert.equal(calculateBasketAvailability(r, 2).status, 'unknown');

  const r2 = interpret('SPAGHETTI');
  assert.equal(r2.status, 'partial'); // type only
  assert.equal(r2.totalAmount, null);
});

// --- Ambiguous 1/6 ---

test('"TOMATE 1/6" does not become six tomatoes', () => {
  const r = interpret('TOMATE 1/6');
  assert.equal(r.productType, 'tomato');
  assert.equal(r.totalAmount, null);
  assert.equal(r.perPackageAmount, null);
  assert.ok(r.warnings.some((w) => /fraction|ratio/i.test(w)));
  assert.equal(calculateBasketAvailability(r, 3).status, 'unknown');
});

// --- Multiple unrelated numbers ---

test('several unrelated bare numbers -> ambiguous, no quantity', () => {
  const r = interpret('MELANGE 3 5 7 12');
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.totalAmount, null);
});

test('recognised danger tokens (year, N-in-1) are warned but do not downgrade a clean amount', () => {
  const r = interpret('SIROP 2024 3 EN 1 250 ML');
  assert.equal(r.totalAmount, 250);
  assert.equal(r.totalUnit, 'ml');
  assert.equal(r.confidence, 'high'); // Every noisy token is recognised, not left unexplained.
  assert.ok(r.warnings.some((w) => /year/i.test(w)));
  assert.ok(r.warnings.some((w) => /in-1|marketing/i.test(w)));
});

test('unexplained bare numbers downgrade a unit-attached amount', () => {
  const r = interpret('SIROP 3 250 ML 7');
  assert.equal(r.totalAmount, 250);
  assert.equal(r.confidence, 'medium');
  assert.ok(r.warnings.some((w) => /unexplained/i.test(w)));
});

test('reference / model numbers are never a quantity', () => {
  const r = interpret('PILE BOUTON CR2032 BP1');
  assert.equal(r.totalAmount, null);
  assert.equal(r.status, 'unresolved');
  assert.ok(r.warnings.some((w) => /reference\/model/i.test(w)));
});

test('a percentage and a price are never a quantity', () => {
  const pct = interpret('JUS 12% FRUITS 1 L');
  assert.equal(pct.totalAmount, 1000); // the 1 L is still fine
  assert.ok(pct.warnings.some((w) => /percentage/i.test(w)));

  const price = interpret('PROMO 2.500 DT SUCRE 500 G');
  assert.equal(price.totalAmount, 500);
  assert.ok(price.warnings.some((w) => /price/i.test(w)));
});

// --- Invalid values, zero, negatives, NaN, extreme quantities ---

test('calculateBasketAvailability rejects invalid basket quantities (no coercion)', () => {
  const egg = interpret('BOITE DE 06 OEUFS');
  for (const bad of [0, -1, -20, 1.5, 2.0001, NaN, Infinity, -Infinity, '2', null, undefined, {}, []]) {
    const r = calculateBasketAvailability(egg, bad);
    assert.equal(r.status, 'invalid', `basketQuantity=${String(bad)}`);
    assert.equal(r.totalAmount, null);
  }
  assert.equal(calculateBasketAvailability(egg, 2.0).status, 'available'); // 2.0 === 2 integer
});

test('extreme basket quantity is rejected by the documented safe bound', () => {
  const egg = interpret('BOITE DE 06 OEUFS');
  assert.equal(calculateBasketAvailability(egg, INTERPRETATION_LIMITS.MAX_BASKET_QUANTITY + 1).status, 'invalid');
});

test('non-object interpretation is rejected structurally', () => {
  for (const bad of [null, undefined, 42, 'x', []]) {
    assert.equal(calculateBasketAvailability(bad, 1).status, 'invalid');
  }
});

// --- Household / personal-care names do not become recipe ingredients ---

test('household / personal-care names never gain a productType', () => {
  for (const name of [
    'LESSIVE MACHINE 500 GR',
    'LIQUIDE VAISSELLE 580 ML',
    'JAVEL 1.5 L',
    'SHAMPOOING ARGAN 300 ML',
    'DENTIFRICE MENTHOL 50 ML',
    'DEODORANT BILLE 50 ML',
    'SAC POUBELLE 50X65',
  ]) {
    const r = interpret(name);
    assert.equal(r.productType, null, name);
    assert.notEqual(r.status, 'parsed', name); // never "type + quantity"
  }
});

// --- Drink volume extraction without recipe classification ---

test('drinks: volume is extracted even with no ingredient key', () => {
  const r = interpret('LIMONADE 1,5 L');
  assert.equal(r.productType, null);
  assert.equal(r.totalAmount, 1500);
  assert.equal(r.totalUnit, 'ml');
  assert.equal(r.status, 'partial'); // quantity known, type unknown
});

// --- Existing ingredient mapping behaviour is unchanged ---

test('composition does not change what the real ingredient mapper returns', () => {
  const realMapper = createIngredientMapper(loadIngredientMappingConfig({ force: true }));
  const cases = [
    ['BOITE DE 06 OEUFS JAUNE ORANGE', 'egg'],
    ['SPAGHETTI 500 GR', 'pasta'],
    ['RIZ 1KG', 'rice'],
    ['LAIT UHT ENTIER 1 L', 'milk'],
    ['HUILE D OLIVE EXTRA VIERGE 500 ML', 'olive_oil'],
  ];
  for (const [name, key] of cases) {
    const direct = realMapper({ name });
    const viaInterpreter = interpretProductName({ name }, { mapProduct: realMapper });
    assert.equal(direct.ingredientKey, key, name);
    assert.equal(viaInterpreter.productType, direct.ingredientKey, name);
  }
  // Multi-ingredient product stays ambiguous, contributes no type.
  const amb = interpretProductName({ name: 'CHICKEN AND MUSHROOM PIE 400 G' }, { mapProduct: stubMapper });
  assert.equal(amb.productType, null);
  assert.equal(amb.status, 'ambiguous');
});

test('quantity extraction works with no mapper (pure core)', () => {
  const r = interpretProductName({ name: 'BOITE DE 06 OEUFS' }); // no options
  assert.equal(r.productType, null);
  assert.equal(r.productTypeStatus, 'unknown');
  assert.equal(r.totalAmount, 6);
  assert.equal(r.totalUnit, 'piece');
  assert.equal(r.status, 'partial'); // quantity only
});

// --- Deterministic repeated results ---

test('repeated calls return a deeply-equal result', () => {
  for (const name of ['BOITE DE 06 OEUFS', 'COLA 6 X 0.5 L', 'TOMATE 1/6', 'MELANGE 3 5 7 12', 'RIZ 1KG', 'NOTHING HERE']) {
    const a = interpret(name);
    const b = interpret(name);
    assert.deepEqual(a, b, name);
  }
});

// --- No mutation of input ---

test('interpretProductName never mutates its input', () => {
  const input = Object.freeze({ name: 'BOITE DE 06 OEUFS JAUNE ORANGE', family: 'VOLAILLE', brand: 'X', description: 'd' });
  assert.doesNotThrow(() => interpretProductName(input, { mapProduct: stubMapper }));
  assert.equal(input.name, 'BOITE DE 06 OEUFS JAUNE ORANGE');
  assert.equal(input.family, 'VOLAILLE');
});

// --- Safety caps against absurd numeric interpretations ---

test('absurd piece counts are discarded, not used', () => {
  const r = interpret('OEUFS X 99999');
  assert.equal(r.totalAmount, null);
  assert.ok(r.warnings.some((w) => /bound/i.test(w)));
  assert.equal(calculateBasketAvailability(r, 3).status, 'unknown');
});

test('absurd mass / volume is discarded, not used', () => {
  assert.equal(interpret('RIZ 5000 KG').totalAmount, null);
  assert.equal(interpret('EAU 9999 L').totalAmount, null);
  assert.ok(interpret('RIZ 5000 KG').warnings.some((w) => /bound/i.test(w)));
});

test('a within-bounds catering size still parses', () => {
  const r = interpret('RIZ 25 KG');
  assert.equal(r.totalAmount, 25000);
  assert.equal(r.totalUnit, 'g');
});

test('basket scaling is capped against absurd totals', () => {
  const big = interpret('RIZ 25 KG'); // 25000 g
  const r = calculateBasketAvailability(big, 5000); // 125,000,000 g > MAX_SCALED_TOTAL.g
  assert.equal(r.status, 'invalid');
});

// --- Result shape ---

test('every result has the documented shape', () => {
  for (const name of ['BOITE DE 06 OEUFS', 'COLA 6 X 0.5 L', 'TOMATE 1/6', 'MELANGE 3 5 7', 'x', '', 'RIZ 1KG', 'OEUFS']) {
    assertShape(interpret(name));
  }
  assertShape(interpretProductName(null));
  assertShape(interpretProductName({ name: 123 }));
});

test('amount / unit aliases mirror the canonical total', () => {
  const r = interpret('BOITE DE 06 OEUFS');
  assert.equal(r.amount, r.totalAmount);
  assert.equal(r.unit, r.totalUnit);
});

test('createProductInterpreter binds a mapper and exposes both helpers', () => {
  const pi = createProductInterpreter({ mapProduct: stubMapper });
  const r = pi.interpret('BOITE DE 06 OEUFS');
  assert.equal(r.productType, 'egg');
  assert.equal(r.totalAmount, 6);
  assert.equal(pi.calculateBasketAvailability(r, 2).totalAmount, 12);
});

test('lexicons are frozen and self-consistent', () => {
  assert.ok(Object.isFrozen(UNIT_SYNONYMS));
  assert.ok(Object.isFrozen(COUNTABLE_NOUNS));
  assert.ok(Object.isFrozen(INTERPRETATION_LIMITS));
  assert.deepEqual(COUNTABLE_NOUNS.egg, ['oeuf', 'oeufs', 'egg', 'eggs']);
});

// --- Helpers ---

function pick(r) {
  return { totalAmount: r.totalAmount, totalUnit: r.totalUnit, perPackageUnit: r.perPackageUnit };
}
function pluck(a) {
  return { status: a.status, totalAmount: a.totalAmount, totalUnit: a.totalUnit };
}
