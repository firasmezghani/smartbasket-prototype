import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeEffectiveInterpretation,
  automaticRecipeEligibility,
  ELIGIBILITY_REASONS,
  INTERPRETATION_SOURCES,
} from './productEffectiveInterpretation.service.js';
import { createIngredientMapper } from './recipe/ingredientMapping.service.js';

const mapProduct = createIngredientMapper();

function product(overrides = {}) {
  return { id: 'p1', name: 'BOITE DE 06 OEUFS', family: 'CREMERIE', ...overrides };
}

test('documented enums', () => {
  assert.deepEqual(INTERPRETATION_SOURCES, ['automatic']);
});

test('automatic: high confidence + resolved type -> eligible', () => {
  const r = computeEffectiveInterpretation({ product: product(), mapProduct });
  assert.equal(r.interpretationSource, 'automatic');
  assert.equal(r.effectiveRecipeEligible, true);
  assert.equal(r.eligibilityReason, ELIGIBILITY_REASONS.AUTOMATIC_HIGH_CONFIDENCE);
  assert.equal(r.effectiveInterpretation.productType, 'egg');
  assert.equal(r.effectiveInterpretation.totalAmount, 6);
  assert.equal(r.automaticInterpretation, r.effectiveInterpretation);
});

test('automatic: a family/description-only egg match (low mapper confidence) is not eligible, with no contextual rule involved', () => {
  const r = computeEffectiveInterpretation({
    product: product({ name: 'PRODUIT DIVERS 250G', family: 'hen eggs department' }),
    mapProduct,
  });
  assert.equal(r.contextualExclusion, null);
  if (r.automaticInterpretation.productTypeStatus === 'mapped') {
    assert.equal(r.effectiveRecipeEligible, false);
    assert.equal(r.eligibilityReason, ELIGIBILITY_REASONS.AUTOMATIC_LOW_MEDIUM_CONFIDENCE);
  }
});

test('automaticRecipeEligibility: gates on the mapper\'s OWN type confidence, not the quantity-blended interpretation confidence', () => {
  const resolved = { status: 'parsed', productType: 'egg', productTypeStatus: 'mapped', confidence: 'low' };
  assert.deepEqual(automaticRecipeEligibility(resolved, 'exact'), {
    eligible: true,
    reason: ELIGIBILITY_REASONS.AUTOMATIC_HIGH_CONFIDENCE,
  });
  assert.deepEqual(automaticRecipeEligibility(resolved, 'high'), {
    eligible: true,
    reason: ELIGIBILITY_REASONS.AUTOMATIC_HIGH_CONFIDENCE,
  });
  for (const tier of ['medium', 'low', 'none']) {
    assert.deepEqual(automaticRecipeEligibility(resolved, tier), {
      eligible: false,
      reason: ELIGIBILITY_REASONS.AUTOMATIC_LOW_MEDIUM_CONFIDENCE,
    });
  }
});

test('EGG WHISK is excluded as a kitchen tool (contextual rule), independent of the confidence-gate fix', () => {
  const r = computeEffectiveInterpretation({ product: product({ name: 'EGG WHISK STAINLESS STEEL' }), mapProduct });
  assert.equal(r.contextualExclusion?.ruleId, 'kitchen_tool');
  assert.equal(r.effectiveRecipeEligible, false);
});

test('automatic: unresolved product type -> never eligible', () => {
  const r = computeEffectiveInterpretation({ product: product({ name: 'MYSTERY ITEM 4080X' }), mapProduct });
  assert.equal(r.automaticInterpretation.productTypeStatus, 'unresolved');
  assert.equal(r.effectiveRecipeEligible, false);
  assert.equal(r.eligibilityReason, ELIGIBILITY_REASONS.AUTOMATIC_TYPE_UNRESOLVED);
});

test('automaticRecipeEligibility: ambiguous status is never eligible', () => {
  const ambiguous = { status: 'ambiguous', productType: null, productTypeStatus: 'ambiguous', confidence: 'none' };
  assert.deepEqual(automaticRecipeEligibility(ambiguous), { eligible: false, reason: ELIGIBILITY_REASONS.AUTOMATIC_AMBIGUOUS });
});

test('contextual exclusion wins even when the automatic confidence would be high (chocolate egg with a printed mass)', () => {
  const r = computeEffectiveInterpretation({ product: product({ name: 'OEUFS CHOCOLAT 100G' }), mapProduct });
  assert.equal(r.automaticInterpretation.confidence, 'high');
  assert.equal(r.effectiveRecipeEligible, false);
  assert.match(r.eligibilityReason, /^contextual_exclusion:confectionery$/);
  assert.equal(r.contextualExclusion.ruleId, 'confectionery');
  assert.equal(r.interpretationSource, 'automatic');
});

test('real egg-box products are unaffected by contextual exclusions', () => {
  for (const name of ['BOITE DE 06 OEUFS', 'BOITE DE 15 OEUFS', 'BOITE DE 30 OEUFS']) {
    const r = computeEffectiveInterpretation({ product: product({ name }), mapProduct });
    assert.equal(r.contextualExclusion, null, name);
    assert.equal(r.effectiveRecipeEligible, true, name);
  }
});

test('pet food containing egg wording is not recipe-eligible', () => {
  const r = computeEffectiveInterpretation({
    product: product({ name: 'CROQUETTES CHAT POULET OEUF', family: 'ANIMALERIE' }),
    mapProduct,
  });
  assert.equal(r.effectiveRecipeEligible, false);
  assert.ok(r.contextualExclusion?.ruleId === 'pet_food' || r.eligibilityReason === ELIGIBILITY_REASONS.AUTOMATIC_TYPE_UNRESOLVED || r.eligibilityReason === ELIGIBILITY_REASONS.AUTOMATIC_LOW_MEDIUM_CONFIDENCE);
});

test('an unused override argument cannot change the automatic decision', () => {
  const without = computeEffectiveInterpretation({ product: product(), mapProduct });
  const withIgnored = computeEffectiveInterpretation({
    product: product(),
    mapProduct,
    override: { decision: 'excluded', productTypeOverride: 'tomato' },
  });
  assert.deepEqual(withIgnored, without);
  assert.equal(without.effectiveRecipeEligible, true);
  assert.equal(without.effectiveInterpretation.productType, 'egg');
});

test('determinism: identical input -> deep-equal output', () => {
  const a = computeEffectiveInterpretation({ product: product(), mapProduct });
  const b = computeEffectiveInterpretation({ product: product(), mapProduct });
  assert.deepEqual(a, b);
});
