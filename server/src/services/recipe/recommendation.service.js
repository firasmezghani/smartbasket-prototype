// Ranks recipes from the basket, then purchase history, then a default order.

import { mapProductToIngredient } from './ingredientMapping.service.js';
import { isPlainObject } from './recipeDataset.js';
import { calculateBasketAvailability } from '../productInterpretation.service.js';
import {
  RECOMMENDATION_CONFIG,
  popularityFallbackOrder,
  rankRecipesByRequirements,
  notEvaluatedRequirement,
} from './score.js';

// A basket-line quantity above this is treated as untrusted (-> null).
export const MAX_TRUSTED_BASKET_LINE_QUANTITY = 100_000;

const AVAILABILITY_CONFIDENCE_RANK = Object.freeze({ high: 3, medium: 2, low: 1, none: 0 });

// Parse a basket-line quantity. Returns a positive integer, or null when the
// value cannot be trusted (it is never guessed as 1).
export function parseTrustedBasketQuantity(raw) {
  let n;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw)) {
    n = Number(raw);
  } else {
    return null;
  }
  if (!Number.isInteger(n) || n < 1 || n > MAX_TRUSTED_BASKET_LINE_QUANTITY) return null;
  return n;
}

export const AVAILABILITY_SEMANTICS = Object.freeze({
  currentAvailability: 'current_availability',
  previousPurchaseAssociation: 'previous_purchase_association',
  popularityFallback: 'popularity_fallback',
});

export const EVIDENCE_SOURCES = Object.freeze({
  basket: 'basket',
  history: 'history',
  popularity: 'popularity',
});

export const DEFAULT_RECOMMENDATION_LIMIT = 10;
export const MAX_RECOMMENDATION_LIMIT = 20;

// Confidence levels allowed for "buy this product" suggestions.
export const LINKABLE_CONFIDENCE = Object.freeze(['exact', 'high', 'medium']);

const LINKABLE_CONFIDENCE_SET = new Set(LINKABLE_CONFIDENCE);

const CONFIDENCE_RANK = Object.freeze({
  exact: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
});

const DATA_LIMITATION_PERSONALISED_BASKET =
  'Recommendations are based on implicit, incomplete shopping evidence from your current basket. They do not claim to know your preferences.';

const DATA_LIMITATION_PERSONALISED_HISTORY =
  'Inspired by your validated purchases. Historical purchases do not prove that an ingredient is still available. Check what you still have before cooking. Quantities are not verified from purchase history.';

const DATA_LIMITATION_POPULARITY =
  'This is not a personalised recommendation. No basket or purchase-history availability assessment was made.';

const EXPLANATION_POPULARITY =
  'Popular recipe shown because there is not enough mapped basket or purchase-history evidence yet. This is not personalised.';

function coerceString(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

// Limit the number of results (default when invalid).
export function clampRecommendationLimit(limit) {
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_RECOMMENDATION_LIMIT;
  return Math.min(n, MAX_RECOMMENDATION_LIMIT);
}

// Normalise basket, history or catalogue fields into the mapper's product shape.
export function normaliseEvidenceProduct(raw) {
  if (!isPlainObject(raw)) return null;
  const idRaw = raw.id ?? raw.productId ?? raw.Id;
  const id =
    idRaw === undefined || idRaw === null || String(idRaw).trim() === ''
      ? null
      : String(idRaw).trim();
  return {
    id,
    name: coerceString(raw.name ?? raw.productName ?? raw.productNameSnapshot).trim(),
    family: coerceString(raw.family ?? raw.familyName ?? raw.category).trim(),
    description: coerceString(raw.description).trim(),
    brand: coerceString(raw.brand).trim(),
    // Quantity of a basket line, or null if not trusted.
    basketQuantity: parseTrustedBasketQuantity(
      raw.basketQuantity ?? raw.quantity ?? raw.Quantity,
    ),
  };
}

function asProductList(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array of product-like objects.`);
  }
  return value;
}

// Remove duplicate products (same id), keeping the first.
export function dedupeProductsById(products) {
  const seen = new Set();
  const out = [];
  for (const product of products) {
    if (product.id) {
      const key = product.id.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(product);
  }
  return out;
}

function emptyEvidenceStats() {
  return {
    mappedIngredientKeys: [],
    mappedProductCount: 0,
    uniqueIngredientCount: 0,
    ignoredAmbiguousCount: 0,
    ignoredUnresolvedCount: 0,
    consideredProductCount: 0,
    mappedEvidence: [],
  };
}

// Map products to ingredient keys. Only `mapped` results count; ambiguous and
// unresolved products are ignored.
export function collectMappedEvidence(products, mapProduct, label = 'products') {
  const rawList = asProductList(products, label);
  const normalised = rawList.map(normaliseEvidenceProduct);
  const malformedCount = normalised.filter((item) => item === null).length;
  const list = dedupeProductsById(normalised.filter((item) => item !== null));

  const stats = emptyEvidenceStats();
  stats.consideredProductCount = list.length;
  stats.ignoredUnresolvedCount += malformedCount;

  const mappedEvidence = [];
  const keys = new Set();

  for (const product of list) {
    let mapping;
    try {
      mapping = mapProduct({
        id: product.id,
        name: product.name,
        family: product.family,
        category: product.family,
        familyName: product.family,
        description: product.description,
        brand: product.brand || undefined,
      });
    } catch {
      stats.ignoredUnresolvedCount += 1;
      continue;
    }
    if (!mapping || typeof mapping !== 'object') {
      stats.ignoredUnresolvedCount += 1;
      continue;
    }
    if (mapping.status === 'mapped' && typeof mapping.ingredientKey === 'string' && mapping.ingredientKey) {
      keys.add(mapping.ingredientKey);
      mappedEvidence.push({
        ingredientKey: mapping.ingredientKey,
        productId: product.id,
        confidence: mapping.confidence ?? 'none',
        matchedRule: mapping.matchedRule ?? 'none',
      });
    } else if (mapping.status === 'ambiguous') {
      stats.ignoredAmbiguousCount += 1;
    } else {
      stats.ignoredUnresolvedCount += 1;
    }
  }

  const mappedIngredientKeys = [...keys].sort();
  stats.mappedIngredientKeys = mappedIngredientKeys;
  stats.uniqueIngredientCount = mappedIngredientKeys.length;
  stats.mappedProductCount = mappedEvidence.length;
  stats.mappedEvidence = mappedEvidence
    .slice()
    .sort((a, b) => {
      if (a.ingredientKey !== b.ingredientKey) return a.ingredientKey < b.ingredientKey ? -1 : 1;
      const aid = a.productId ?? '';
      const bid = b.productId ?? '';
      if (aid !== bid) return aid < bid ? -1 : 1;
      return 0;
    });
  return stats;
}

// Tells the app where the evidence came from (basket, history or popularity).
export function availabilitySemanticsFor(evidenceSource) {
  if (evidenceSource === EVIDENCE_SOURCES.basket) return AVAILABILITY_SEMANTICS.currentAvailability;
  if (evidenceSource === EVIDENCE_SOURCES.history) return AVAILABILITY_SEMANTICS.previousPurchaseAssociation;
  return AVAILABILITY_SEMANTICS.popularityFallback;
}

// Choose the evidence: basket first, then history, then popularity.
export function selectEvidenceSource({ basketProducts, historyProducts, mapProduct }) {
  if (typeof mapProduct !== 'function') {
    throw new TypeError('mapProduct must be a function.');
  }
  const basket = collectMappedEvidence(basketProducts, mapProduct, 'basketProducts');
  if (basket.uniqueIngredientCount > 0) {
    return {
      evidenceSource: EVIDENCE_SOURCES.basket,
      personalised: true,
      availabilitySemantics: AVAILABILITY_SEMANTICS.currentAvailability,
      evidence: basket,
    };
  }
  const history = collectMappedEvidence(historyProducts, mapProduct, 'historyProducts');
  if (history.uniqueIngredientCount > 0) {
    return {
      evidenceSource: EVIDENCE_SOURCES.history,
      personalised: true,
      availabilitySemantics: AVAILABILITY_SEMANTICS.previousPurchaseAssociation,
      evidence: history,
    };
  }
  // No evidence: keep the ignored-product counts for reporting.
  const empty = basket.consideredProductCount > 0 ? basket : history;
  return {
    evidenceSource: EVIDENCE_SOURCES.popularity,
    personalised: false,
    availabilitySemantics: AVAILABILITY_SEMANTICS.popularityFallback,
    evidence: empty,
  };
}

function lowestAvailabilityConfidence(list) {
  let lowest = 'high';
  for (const c of list) {
    const rank = AVAILABILITY_CONFIDENCE_RANK[c] ?? 0;
    if (rank < (AVAILABILITY_CONFIDENCE_RANK[lowest] ?? 3)) lowest = c ?? 'none';
  }
  return lowest;
}

// Known quantity per ingredient from the current basket. Lines are summed only
// when all are known and share a unit; otherwise the amount is `unknown`.
export function buildBasketAvailability(basketProducts, interpretProduct) {
  const out = new Map();
  if (typeof interpretProduct !== 'function') return out;

  const list = dedupeProductsById(
    asProductList(basketProducts, 'basketProducts')
      .map(normaliseEvidenceProduct)
      .filter((p) => p !== null),
  );

  // key -> array of { amount:number|null, unit:string|null, confidence:string }
  const linesByKey = new Map();
  for (const product of list) {
    let interp;
    try {
      interp = interpretProduct({
        id: product.id,
        name: product.name,
        family: product.family,
        category: product.family,
        familyName: product.family,
        description: product.description,
        brand: product.brand || undefined,
      });
    } catch {
      continue;
    }
    if (!interp || typeof interp !== 'object') continue;
    const key = typeof interp.productType === 'string' ? interp.productType.trim().toLowerCase() : '';
    if (key === '') continue;

    // Unknown line quantity: the product counts as present but its amount is unknown.
    const scaled =
      product.basketQuantity == null
        ? null
        : calculateBasketAvailability(interp, product.basketQuantity);
    const line =
      scaled && scaled.status === 'available' && Number.isFinite(scaled.totalAmount) && typeof scaled.totalUnit === 'string'
        ? { amount: scaled.totalAmount, unit: scaled.totalUnit, confidence: interp.confidence ?? 'none' }
        : { amount: null, unit: null, confidence: interp.confidence ?? 'none' };
    const arr = linesByKey.get(key) ?? [];
    arr.push(line);
    linesByKey.set(key, arr);
  }

  for (const [key, lines] of linesByKey) {
    const known = lines.filter((l) => l.amount != null && l.unit != null);
    const units = new Set(known.map((l) => l.unit));
    if (known.length === lines.length && known.length > 0 && units.size === 1) {
      out.set(key, {
        amount: known.reduce((sum, l) => sum + l.amount, 0),
        unit: known[0].unit,
        confidence: lowestAvailabilityConfidence(known.map((l) => l.confidence)),
        status: 'known',
      });
    } else {
      out.set(key, { amount: null, unit: null, confidence: 'none', status: 'unknown' });
    }
  }
  return out;
}

// Whether a confidence level is high enough for a purchase suggestion.
export function isLinkableConfidence(confidence) {
  return LINKABLE_CONFIDENCE_SET.has(confidence);
}

function compareLinkedProducts(a, b) {
  const rankA = CONFIDENCE_RANK[a.confidence] ?? 0;
  const rankB = CONFIDENCE_RANK[b.confidence] ?? 0;
  if (rankA !== rankB) return rankB - rankA;
  const idA = a.productId ?? '';
  const idB = b.productId ?? '';
  if (idA !== idB) return idA < idB ? -1 : 1;
  if (a.productName !== b.productName) return a.productName < b.productName ? -1 : 1;
  return 0;
}

// For each missing ingredient, pick at most one catalogue product that maps to
// it with at least `medium` confidence.
function bestLinkableByKey(wantedKeys, catalogueProducts, mapProduct) {
  const bestByKey = new Map();
  const products = dedupeProductsById(
    asProductList(catalogueProducts, 'catalogueProducts')
      .map(normaliseEvidenceProduct)
      .filter((p) => p !== null),
  );
  for (const product of products) {
    let mapping;
    try {
      mapping = mapProduct({
        id: product.id,
        name: product.name,
        family: product.family,
        category: product.family,
        familyName: product.family,
        description: product.description,
        brand: product.brand || undefined,
      });
    } catch {
      continue;
    }
    if (!mapping || mapping.status !== 'mapped' || !wantedKeys.has(mapping.ingredientKey)) continue;
    const confidence = mapping.confidence ?? 'none';
    if (!isLinkableConfidence(confidence)) continue;
    const candidate = {
      ingredientKey: mapping.ingredientKey,
      productId: product.id,
      productName: product.name,
      confidence,
      matchedRule: mapping.matchedRule ?? 'none',
    };
    const prev = bestByKey.get(mapping.ingredientKey);
    if (!prev || compareLinkedProducts(candidate, prev) < 0) {
      bestByKey.set(mapping.ingredientKey, candidate);
    }
  }
  return bestByKey;
}

// At most one catalogue product per missing ingredient.
export function linkMissingIngredients(missingIngredients, catalogueProducts, mapProduct) {
  if (!Array.isArray(missingIngredients)) return [];
  const bestByKey = bestLinkableByKey(
    new Set(missingIngredients.map((i) => i.key)),
    catalogueProducts,
    mapProduct,
  );
  return missingIngredients
    .filter((item) => bestByKey.has(item.key))
    .map((item) => {
      const linked = bestByKey.get(item.key);
      return {
        ingredientKey: item.key,
        label: item.label,
        essential: item.essential,
        productId: linked.productId,
        productName: linked.productName,
        confidence: linked.confidence,
        matchedRule: linked.matchedRule,
      };
    });
}

// Suggest one catalogue product per missing requirement, trying the
// alternatives in `anyOfKeys` in order.
export function linkMissingRequirements(missingRequirements, catalogueProducts, mapProduct) {
  if (!Array.isArray(missingRequirements)) return [];
  // Suggest a product for missing and not-evaluated requirements.
  const groups = missingRequirements.filter(
    (r) => r && (r.status === 'missing' || r.status === 'not_evaluated'),
  );
  const wanted = new Set();
  for (const g of groups) for (const k of g.anyOfKeys ?? [g.key]) wanted.add(k);
  const bestByKey = bestLinkableByKey(wanted, catalogueProducts, mapProduct);

  const out = [];
  for (const g of groups) {
    const alts = Array.isArray(g.anyOfKeys) && g.anyOfKeys.length > 0 ? g.anyOfKeys : [g.key];
    const pickKey = alts.find((k) => bestByKey.has(k));
    if (!pickKey) continue;
    const linked = bestByKey.get(pickKey);
    out.push({
      // The requirement this suggestion satisfies (primary key + label).
      requirementKey: g.key,
      ingredientKey: pickKey, // the alternative that the product actually maps to
      label: g.label,
      labelKey: g.labelKey ?? null,
      essential: g.essential === true,
      satisfiesRequirement: true,
      productId: linked.productId,
      productName: linked.productName,
      confidence: linked.confidence,
      matchedRule: linked.matchedRule,
    });
  }
  return out;
}

function lookupIngredient(recipe, key) {
  const found = (recipe.ingredients ?? []).find(
    (ing) => String(ing.key).trim().toLowerCase() === key,
  );
  return {
    key,
    label: found?.label ? String(found.label) : key,
    essential: found?.essential === true,
    quantityText: typeof found?.quantityText === 'string' ? found.quantityText : null,
  };
}

function describeKeys(keys, recipe, essential) {
  return keys.map((key) => {
    const info = lookupIngredient(recipe, key);
    return { ...info, essential };
  });
}

function coveragePercent(essentialCoverage) {
  if (!Number.isFinite(essentialCoverage)) return 0;
  return Math.round(essentialCoverage * 100);
}

// English explanation text (kept for the API; the app builds its own).
function explanationForCoverage(evidenceSource, score) {
  if (evidenceSource === EVIDENCE_SOURCES.history) {
    return (
      `Inspired by your validated purchases: ${score.matchedEssentialCount} of ${score.totalEssential} essential ingredients were previously purchased in association with this recipe. ` +
      'This does not mean you can make it right now. Check what you still have before cooking. Quantities are not verified from purchase history.'
    );
  }
  const reqs = Array.isArray(score.requirements) ? score.requirements : [];
  const insufficient = reqs.filter((r) => r.essential && r.status === 'insufficient').length;
  const unknown = reqs.filter((r) => r.essential && r.status === 'quantity_unknown').length;
  let text = `${score.matchedEssentialCount} of ${score.totalEssential} essential requirements matched from products currently in your basket.`;
  if (insufficient > 0) text += ` ${insufficient} essential requirement(s) have a match but not enough quantity.`;
  if (unknown > 0) text += ` ${unknown} matched requirement(s) could not be quantity-verified.`;
  return text;
}

function attachLinks(recipeCard, catalogueProducts, mapProduct) {
  return {
    ...recipeCard,
    missingLinkedProducts: linkMissingRequirements(
      recipeCard.requirements ?? [],
      catalogueProducts,
      mapProduct,
    ),
  };
}

function buildCoverageCard(recipe, score, evidenceSource, personalised) {
  const matchedEssential = describeKeys(score.matchedEssential, recipe, true);
  const missingEssential = describeKeys(score.missingEssential, recipe, true);
  const matchedOptional = describeKeys(score.matchedOptional, recipe, false);
  const missingOptional = describeKeys(score.missingOptional, recipe, false);
  return {
    recipeId: recipe.id,
    name: recipe.name,
    description: recipe.description,
    cuisine: recipe.cuisine ?? null,
    category: recipe.category ?? null,
    prepTimeMinutes: recipe.prepTimeMinutes ?? null,
    difficulty: recipe.difficulty ?? null,
    fallbackRank: recipe.fallbackRank,
    score: score.score,
    coveragePercent: coveragePercent(score.essentialCoverage),
    essentialCoverage: score.essentialCoverage,
    optionalCoverage: score.optionalCoverage,
    matchedEssentialCount: score.matchedEssentialCount,
    missingEssentialCount: score.missingEssentialCount,
    matchedOptionalCount: score.matchedOptionalCount,
    missingOptionalCount: score.missingOptionalCount,
    totalEssential: score.totalEssential,
    totalOptional: score.totalOptional,
    matchedIngredients: [...matchedEssential, ...matchedOptional],
    missingIngredients: [...missingEssential, ...missingOptional],
    missingEssential,
    missingOptional,
    // Structured, machine-readable per-requirement evaluation (one entry per
    // recipe ingredient; an alternative group is one requirement).
    requirements: (Array.isArray(score.requirements) ? score.requirements : []).map((r) => ({ ...r })),
    personalised,
    evidenceSource,
    availabilitySemantics: availabilitySemanticsFor(evidenceSource),
    explanationText: explanationForCoverage(evidenceSource, score),
    dataLimitationText:
      evidenceSource === EVIDENCE_SOURCES.history
        ? DATA_LIMITATION_PERSONALISED_HISTORY
        : DATA_LIMITATION_PERSONALISED_BASKET,
  };
}

function buildPopularityCard(recipe) {
  const ingredients = recipe.ingredients ?? [];
  const totalEssential = ingredients.filter((ing) => ing.essential === true).length;
  const totalOptional = ingredients.filter((ing) => ing.essential !== true).length;
  return {
    recipeId: recipe.id,
    name: recipe.name,
    description: recipe.description,
    cuisine: recipe.cuisine ?? null,
    category: recipe.category ?? null,
    prepTimeMinutes: recipe.prepTimeMinutes ?? null,
    difficulty: recipe.difficulty ?? null,
    fallbackRank: recipe.fallbackRank,
    score: 0,
    coveragePercent: 0,
    essentialCoverage: 0,
    optionalCoverage: 0,
    // No evidence to check, so nothing is matched or missing.
    matchedEssentialCount: 0,
    missingEssentialCount: 0,
    matchedOptionalCount: 0,
    missingOptionalCount: 0,
    totalEssential,
    totalOptional,
    matchedIngredients: [],
    missingIngredients: [],
    missingEssential: [],
    missingOptional: [],
    // All requirements are `not_evaluated`; products can still be suggested.
    requirements: ingredients.map((ing) => notEvaluatedRequirement(ing)),
    personalised: false,
    evidenceSource: EVIDENCE_SOURCES.popularity,
    availabilitySemantics: AVAILABILITY_SEMANTICS.popularityFallback,
    explanationText: EXPLANATION_POPULARITY,
    dataLimitationText: DATA_LIMITATION_POPULARITY,
  };
}

function resolveMapper({ mapProduct, compiledMapping }) {
  if (typeof mapProduct === 'function') return mapProduct;
  if (compiledMapping) {
    return (product) => mapProductToIngredient(product, compiledMapping);
  }
  throw new TypeError('mapProduct or compiledMapping is required.');
}

// Rank recipes for the given evidence and return the recommendation payload.
// `catalogueProducts` is only for linking missing ingredients.
export function recommendRecipes(input = {}) {
  const {
    recipes,
    basketProducts = [],
    historyProducts = [],
    catalogueProducts = [],
    limit,
    unrestrictedLimit = false,
    mapProduct,
    compiledMapping,
    interpretProduct,
    scoringConfig = RECOMMENDATION_CONFIG,
  } = input;

  if (!Array.isArray(recipes)) {
    throw new TypeError('recommendRecipes: recipes must be an array.');
  }

  const mapper = resolveMapper({ mapProduct, compiledMapping });
  const selected = selectEvidenceSource({ basketProducts, historyProducts, mapProduct: mapper });
  const cappedLimit =
    unrestrictedLimit === true ? recipes.length : clampRecommendationLimit(limit);
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  // Quantities are only known for the current basket, not for history.
  const availabilityByKey =
    selected.evidenceSource === EVIDENCE_SOURCES.basket && typeof interpretProduct === 'function'
      ? buildBasketAvailability(basketProducts, interpretProduct)
      : new Map();

  let cards;
  if (selected.evidenceSource === EVIDENCE_SOURCES.popularity) {
    cards = popularityFallbackOrder(recipes)
      .map((entry) => recipeById.get(entry.recipeId))
      .filter(Boolean)
      .map(buildPopularityCard);
  } else {
    const ranked = rankRecipesByRequirements(
      recipes,
      selected.evidence.mappedIngredientKeys,
      availabilityByKey,
      scoringConfig,
    );
    cards = ranked.map((score) => {
      const recipe = recipeById.get(score.recipeId);
      if (!recipe) return null;
      return buildCoverageCard(recipe, score, selected.evidenceSource, selected.personalised);
    }).filter(Boolean);
  }

  const recommendations = cards
    .slice(0, cappedLimit)
    .map((card, index) =>
      attachLinks(
        { ...card, rank: index + 1 },
        catalogueProducts,
        mapper,
      ),
    );

  return {
    evidenceSource: selected.evidenceSource,
    personalised: selected.personalised,
    availabilitySemantics: selected.availabilitySemantics ?? availabilitySemanticsFor(selected.evidenceSource),
    evidence: selected.evidence,
    recommendations,
  };
}

// Rank all recipes and return the requested one, or null if it does not exist.
export function recommendRecipeById(input = {}) {
  const recipeId =
    typeof input.recipeId === 'string' ? input.recipeId.trim() : String(input.recipeId ?? '').trim();
  if (!recipeId) return null;
  if (!Array.isArray(input.recipes)) {
    throw new TypeError('recommendRecipeById: recipes must be an array.');
  }
  if (!input.recipes.some((recipe) => recipe && recipe.id === recipeId)) {
    return null;
  }
  const full = recommendRecipes({ ...input, unrestrictedLimit: true });
  const recommendation = full.recommendations.find((item) => item.recipeId === recipeId);
  if (!recommendation) return null;
  return {
    evidenceSource: full.evidenceSource,
    personalised: full.personalised,
    availabilitySemantics: full.availabilitySemantics,
    evidence: full.evidence,
    recommendation,
  };
}

// Create a recommendation service with the recipes and mapper already set.
export function createRecommendationService(deps) {
  if (!deps || !Array.isArray(deps.recipes)) {
    throw new TypeError('createRecommendationService: deps.recipes must be an array.');
  }
  const mapper = resolveMapper(deps);
  const interpretProduct =
    typeof deps.interpretProduct === 'function' ? deps.interpretProduct : undefined;
  const scoringConfig = deps.scoringConfig ?? RECOMMENDATION_CONFIG;
  return {
    recommend(request = {}) {
      return recommendRecipes({
        recipes: deps.recipes,
        mapProduct: mapper,
        interpretProduct,
        scoringConfig,
        basketProducts: request.basketProducts,
        historyProducts: request.historyProducts,
        catalogueProducts: request.catalogueProducts,
        limit: request.limit,
      });
    },
  };
}
