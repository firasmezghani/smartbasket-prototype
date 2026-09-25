// Decides whether a product can count as a recipe ingredient.

import { interpretProductName } from './productInterpretation.service.js';
import { evaluateContextualExclusion } from './recipe/productInterpretationExclusions.js';

// `interpretationSource` values.
export const INTERPRETATION_SOURCES = Object.freeze(['automatic']);

// Stable, documented eligibility reasons.
export const ELIGIBILITY_REASONS = Object.freeze({
  CONTEXTUAL_EXCLUSION: 'contextual_exclusion',
  AUTOMATIC_HIGH_CONFIDENCE: 'automatic_high_confidence',
  AUTOMATIC_TYPE_UNRESOLVED: 'automatic_type_unresolved',
  AUTOMATIC_AMBIGUOUS: 'automatic_ambiguous',
  AUTOMATIC_LOW_MEDIUM_CONFIDENCE: 'automatic_confidence_below_threshold',
});

// Only `exact` or `high` mapper confidence counts as recipe evidence.
export function automaticRecipeEligibility(automatic, typeConfidence) {
  if (automatic.status === 'ambiguous' || automatic.productTypeStatus === 'ambiguous') {
    return { eligible: false, reason: ELIGIBILITY_REASONS.AUTOMATIC_AMBIGUOUS };
  }
  if (automatic.productTypeStatus !== 'mapped' || !automatic.productType) {
    return { eligible: false, reason: ELIGIBILITY_REASONS.AUTOMATIC_TYPE_UNRESOLVED };
  }
  if (typeConfidence === 'exact' || typeConfidence === 'high') {
    return { eligible: true, reason: ELIGIBILITY_REASONS.AUTOMATIC_HIGH_CONFIDENCE };
  }
  return { eligible: false, reason: ELIGIBILITY_REASONS.AUTOMATIC_LOW_MEDIUM_CONFIDENCE };
}

// The ingredient mapper's own type confidence for a product.
function resolveTypeConfidence(product, mapProduct) {
  if (typeof mapProduct !== 'function') return 'none';
  let mapping;
  try {
    mapping = mapProduct({
      name: product?.name,
      family: product?.family,
      category: product?.family,
      familyName: product?.family,
      description: product?.description,
      brand: product?.brand || undefined,
    });
  } catch {
    return 'none';
  }
  if (!mapping || typeof mapping !== 'object' || mapping.status !== 'mapped') return 'none';
  return typeof mapping.confidence === 'string' ? mapping.confidence : 'none';
}

// product: { id?: unknown, name?: unknown, family?: unknown, subFamily?: unknown, description?: unknown, brand?: unknown }, mapProduct:
// (product: object) => object, }} input
export function computeEffectiveInterpretation({ product, mapProduct }) {
  const automaticInterpretation = interpretProductName(product, { mapProduct });

  const contextual = automaticInterpretation.productType
    ? evaluateContextualExclusion(product, automaticInterpretation.productType)
    : { excluded: false, ruleId: null, reason: null };

  const effectiveInterpretation = automaticInterpretation;
  const interpretationSource = 'automatic';
  let effectiveRecipeEligible = false;
  let eligibilityReason = ELIGIBILITY_REASONS.AUTOMATIC_TYPE_UNRESOLVED;

  if (contextual.excluded) {
    // An exclusion rule always wins, even when the confidence is high.
    effectiveRecipeEligible = false;
    eligibilityReason = `${ELIGIBILITY_REASONS.CONTEXTUAL_EXCLUSION}:${contextual.ruleId}`;
  } else {
    const gate = automaticRecipeEligibility(automaticInterpretation, resolveTypeConfidence(product, mapProduct));
    effectiveRecipeEligible = gate.eligible;
    eligibilityReason = gate.reason;
  }

  return {
    productId: product?.id != null ? String(product.id) : null,
    automaticInterpretation,
    effectiveInterpretation,
    effectiveRecipeEligible,
    eligibilityReason,
    interpretationSource,
    contextualExclusion: contextual.excluded ? contextual : null,
  };
}
