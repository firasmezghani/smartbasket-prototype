// Loads the customer's evidence and ranks recipes. No SQL here.

import { AppError } from '../../utils/AppError.js';
import {
  DEFAULT_RECOMMENDATION_LIMIT,
  MAX_RECOMMENDATION_LIMIT,
  recommendRecipeById,
  recommendRecipes,
} from './recommendation.service.js';
import { RECIPE_ID_PATTERN, RECIPE_LIMITS } from './recipeDataset.js';
import { computeEffectiveInterpretation } from '../productEffectiveInterpretation.service.js';
import {
  DEFAULT_RECIPE_LANGUAGE,
  loadRecipeLocaleOverlay,
  localizeRecommendationResult,
  parseRecipeLanguage,
} from './recipeLocalization.js';

// Re-exported so the controller imports language parsing from one place, next
// to `parseRecommendationListLimit` / `parseRecipeIdParam`.
export { parseRecipeLanguage, DEFAULT_RECIPE_LANGUAGE };

// Wrap the mapper so products that are not recipe-eligible are ignored.
export function buildEffectiveMapProduct({ mapProduct }) {
  return (product) => {
    const effective = computeEffectiveInterpretation({ product, mapProduct });

    if (!effective.effectiveRecipeEligible) {
      return {
        status: 'unresolved',
        ingredientKey: null,
        confidence: 'none',
        matchedRule: 'reliability_gate',
        candidates: [],
        reason: effective.eligibilityReason,
      };
    }
    const key = effective.effectiveInterpretation.productType;
    if (typeof key !== 'string' || key === '') {
      return {
        status: 'unresolved',
        ingredientKey: null,
        confidence: 'none',
        matchedRule: 'reliability_gate',
        candidates: [],
        reason: 'no_product_type',
      };
    }
    return {
      status: 'mapped',
      ingredientKey: key,
      confidence: effective.effectiveInterpretation.confidence ?? 'high',
      matchedRule: `effective:${effective.interpretationSource}`,
      candidates: [],
    };
  };
}

export function buildEffectiveInterpretProduct({ mapProduct }) {
  return (product) => {
    const effective = computeEffectiveInterpretation({ product, mapProduct });
    if (!effective.effectiveRecipeEligible) {
      // Not eligible, so it adds no quantity either.
      return { ...effective.effectiveInterpretation, productType: null, productTypeStatus: 'unknown' };
    }
    return effective.effectiveInterpretation;
  };
}

const INVALID_LIMIT = 'limit must be a positive integer.';
const INVALID_RECIPE_ID = 'Invalid recipe identifier.';
const RECIPE_NOT_FOUND = 'Recipe not found.';
const EVIDENCE_UNAVAILABLE = 'Recommendation evidence is temporarily unavailable.';

// Parse the list limit: default 10, capped at 20, invalid values rejected (400).
export function parseRecommendationListLimit(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_RECOMMENDATION_LIMIT;
  }
  if (Array.isArray(raw)) {
    throw new AppError(INVALID_LIMIT, 400);
  }
  const text = String(raw).trim();
  if (!/^[1-9]\d*$/.test(text)) {
    throw new AppError(INVALID_LIMIT, 400);
  }
  const n = Number.parseInt(text, 10);
  if (!Number.isInteger(n) || n < 1) {
    throw new AppError(INVALID_LIMIT, 400);
  }
  return Math.min(n, MAX_RECOMMENDATION_LIMIT);
}

export function parseRecipeIdParam(raw) {
  if (raw === undefined || raw === null) {
    throw new AppError(INVALID_RECIPE_ID, 400);
  }
  if (Array.isArray(raw)) {
    throw new AppError(INVALID_RECIPE_ID, 400);
  }
  const id = String(raw).trim();
  if (!id || id.length > RECIPE_LIMITS.idMaxLength || !RECIPE_ID_PATTERN.test(id)) {
    throw new AppError(INVALID_RECIPE_ID, 400);
  }
  return id;
}

function wrapEvidenceFailure(err) {
  if (err instanceof AppError) return err;
  return new AppError(EVIDENCE_UNAVAILABLE, 503);
}

// Create the recommendation API service from its evidence adapter, recipes and mappers.
export function createRecommendationApiService(deps) {
  if (!deps || typeof deps.evidenceAdapter?.loadEvidence !== 'function') {
    throw new TypeError('createRecommendationApiService: evidenceAdapter.loadEvidence is required.');
  }
  if (!Array.isArray(deps.recipes)) {
    throw new TypeError('createRecommendationApiService: recipes must be an array.');
  }
  if (typeof deps.mapProduct !== 'function') {
    throw new TypeError('createRecommendationApiService: mapProduct is required.');
  }

  const { evidenceAdapter, recipes, mapProduct } = deps;
  // Optional product-name interpreter that reads known quantities from the
  // current basket.
  const interpretProduct =
    typeof deps.interpretProduct === 'function' ? deps.interpretProduct : undefined;
  // French translations (English needs none). Tests can pass their own loader.
  const localeOverlayFor =
    typeof deps.loadRecipeLocaleOverlay === 'function'
      ? deps.loadRecipeLocaleOverlay
      : (language) => loadRecipeLocaleOverlay(language, { recipes });

  async function loadScopedEvidence(customerId) {
    try {
      return await evidenceAdapter.loadEvidence(customerId);
    } catch (err) {
      throw wrapEvidenceFailure(err);
    }
  }

  function buildEffectiveMappers() {
    return {
      mapProduct: buildEffectiveMapProduct({ mapProduct }),
      interpretProduct: interpretProduct
        ? buildEffectiveInterpretProduct({ mapProduct })
        : undefined,
    };
  }

  // Translate the display text after ranking, so both languages give the same order.
  function localize(result, language) {
    const lang = parseRecipeLanguage(language);
    if (lang === DEFAULT_RECIPE_LANGUAGE) return result;
    return localizeRecommendationResult(result, { language: lang, overlay: localeOverlayFor(lang) });
  }

  async function listRecipes({ customerId, limit, language }) {
    const evidence = await loadScopedEvidence(customerId);
    const effective = buildEffectiveMappers();
    const result = recommendRecipes({
      recipes,
      mapProduct: effective.mapProduct,
      interpretProduct: effective.interpretProduct,
      basketProducts: evidence.basketProducts,
      historyProducts: evidence.historyProducts,
      catalogueProducts: evidence.catalogueProducts,
      limit,
    });
    return localize(result, language);
  }

  async function getRecipe({ customerId, recipeId, language }) {
    if (!recipes.some((recipe) => recipe && recipe.id === recipeId)) {
      throw new AppError(RECIPE_NOT_FOUND, 404);
    }
    const evidence = await loadScopedEvidence(customerId);
    const effective = buildEffectiveMappers();
    const scored = recommendRecipeById({
      recipes,
      mapProduct: effective.mapProduct,
      interpretProduct: effective.interpretProduct,
      recipeId,
      basketProducts: evidence.basketProducts,
      historyProducts: evidence.historyProducts,
      catalogueProducts: evidence.catalogueProducts,
    });
    if (!scored) {
      throw new AppError(RECIPE_NOT_FOUND, 404);
    }
    return localize(scored, language);
  }

  return { listRecipes, getRecipe };
}
