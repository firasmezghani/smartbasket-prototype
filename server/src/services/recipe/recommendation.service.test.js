import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AVAILABILITY_SEMANTICS,
  EVIDENCE_SOURCES,
  DEFAULT_RECOMMENDATION_LIMIT,
  LINKABLE_CONFIDENCE,
  clampRecommendationLimit,
  collectMappedEvidence,
  createRecommendationService,
  dedupeProductsById,
  isLinkableConfidence,
  linkMissingIngredients,
  normaliseEvidenceProduct,
  recommendRecipeById,
  recommendRecipes,
  selectEvidenceSource,
} from './recommendation.service.js';
import { loadRecipeDataset } from './recipeDataset.js';
import {
  createIngredientMapper,
  loadIngredientMappingConfig,
} from './ingredientMapping.service.js';

function recipe(overrides = {}) {
  return {
    id: 'r-pasta',
    name: 'Simple Pasta',
    description: 'A synthetic pasta dish for tests.',
    cuisine: 'italian',
    category: 'main',
    prepTimeMinutes: 20,
    difficulty: 'easy',
    fallbackRank: 2,
    ingredients: [
      { key: 'pasta', label: 'Pasta', essential: true, quantityText: '300 g' },
      { key: 'tomato', label: 'Tomato', essential: true, quantityText: '1 tin' },
      { key: 'basil', label: 'Basil', essential: false },
    ],
    ...overrides,
  };
}

const RECIPES = [
  recipe({ id: 'r-omelette', name: 'Omelette', fallbackRank: 1, ingredients: [
    { key: 'egg', label: 'Eggs', essential: true },
    { key: 'butter', label: 'Butter', essential: true },
    { key: 'cheese', label: 'Cheese', essential: false },
  ]}),
  recipe(),
  recipe({ id: 'r-rice', name: 'Rice Bowl', fallbackRank: 3, ingredients: [
    { key: 'rice', label: 'Rice', essential: true },
    { key: 'egg', label: 'Egg', essential: true },
    { key: 'soy_sauce', label: 'Soy sauce', essential: false },
  ]}),
];

const KEY_BY_NAME = {
  pasta: 'pasta',
  tomato: 'tomato',
  egg: 'egg',
  butter: 'butter',
  rice: 'rice',
  basil: 'basil',
  cheese: 'cheese',
};

function stubMap(product) {
  const name = String(product?.name ?? '').trim().toLowerCase();
  if (name === 'ambiguous pie' || name === 'chicken and mushroom') {
    return { status: 'ambiguous', ingredientKey: null, confidence: 'high', matchedRule: 'synonym_phrase', matchedText: null, candidates: [], reason: 'conflicting' };
  }
  if (name === '' || name === 'unknown item' || name === 'sparkling water') {
    return { status: 'unresolved', ingredientKey: null, confidence: 'none', matchedRule: 'none', matchedText: null, candidates: [], reason: 'no match' };
  }
  const key = KEY_BY_NAME[name];
  if (key) {
    return { status: 'mapped', ingredientKey: key, confidence: 'exact', matchedRule: 'exact_phrase', matchedText: name, candidates: [], reason: `mapped ${key}` };
  }
  return { status: 'unresolved', ingredientKey: null, confidence: 'none', matchedRule: 'none', matchedText: null, candidates: [], reason: 'no match' };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function recommend(overrides = {}) {
  return recommendRecipes({
    recipes: RECIPES,
    mapProduct: stubMap,
    ...overrides,
  });
}

const PERSONALISATION_CLAIM = /you will like|your favourite|your favorite|personalised for you|personalized for you|we know what you like/i;

test('clampRecommendationLimit falls back and caps', () => {
  assert.equal(clampRecommendationLimit(undefined), DEFAULT_RECOMMENDATION_LIMIT);
  assert.equal(clampRecommendationLimit(0), DEFAULT_RECOMMENDATION_LIMIT);
  assert.equal(clampRecommendationLimit(-3), DEFAULT_RECOMMENDATION_LIMIT);
  assert.equal(clampRecommendationLimit(1.5), DEFAULT_RECOMMENDATION_LIMIT);
  assert.equal(clampRecommendationLimit(2), 2);
  assert.equal(clampRecommendationLimit(99), 20);
});

test('normaliseEvidenceProduct accepts basket, history snapshot and catalogue field names', () => {
  assert.deepEqual(normaliseEvidenceProduct({ productName: 'Pasta', productId: 'p1' }), {
    id: 'p1',
    name: 'Pasta',
    family: '',
    description: '',
    brand: '',
    basketQuantity: null, // missing -> null, not 1
  });
  assert.equal(normaliseEvidenceProduct({ name: 'x', id: 'x', basketQuantity: 4 }).basketQuantity, 4);
  assert.equal(normaliseEvidenceProduct({ name: 'x', id: 'x', basketQuantity: -2 }).basketQuantity, null);
  assert.equal(normaliseEvidenceProduct({ name: 'x', id: 'x', basketQuantity: 1.5 }).basketQuantity, null);
  assert.equal(normaliseEvidenceProduct({ productNameSnapshot: 'Tomato', id: 't1' }).name, 'Tomato');
  assert.equal(normaliseEvidenceProduct(null), null);
  assert.equal(normaliseEvidenceProduct('pasta'), null);
});

test('duplicate product ids are collapsed, keeping the first occurrence', () => {
  const deduped = dedupeProductsById([
    { id: 'p1', name: 'pasta' },
    { id: 'P1', name: 'pasta again' },
    { id: null, name: 'egg' },
    { id: null, name: 'egg' },
  ]);
  assert.equal(deduped.length, 3);
  assert.equal(deduped[0].name, 'pasta');
});

test('basket evidence is used when at least one product maps', () => {
  const result = recommend({
    basketProducts: [{ id: 'b1', name: 'pasta' }, { id: 'b2', name: 'tomato' }],
    historyProducts: [{ id: 'h1', name: 'egg' }],
    limit: 3,
  });
  assert.equal(result.evidenceSource, EVIDENCE_SOURCES.basket);
  assert.equal(result.personalised, true);
  assert.deepEqual(result.evidence.mappedIngredientKeys, ['pasta', 'tomato']);
  assert.equal(result.recommendations[0].recipeId, 'r-pasta');
  assert.equal(result.recommendations[0].evidenceSource, 'basket');
  assert.equal(result.recommendations[0].personalised, true);
  assert.equal(result.recommendations[0].coveragePercent, 100);
  assert.match(result.recommendations[0].explanationText, /basket/i);
  assert.doesNotMatch(result.recommendations[0].explanationText, PERSONALISATION_CLAIM);
});

test('history is used only when the basket yields no mapped keys', () => {
  const result = recommend({
    basketProducts: [{ id: 'b1', name: 'unknown item' }],
    historyProducts: [{ id: 'h1', name: 'egg' }, { id: 'h2', name: 'butter' }],
    limit: 3,
  });
  assert.equal(result.evidenceSource, EVIDENCE_SOURCES.history);
  assert.equal(result.personalised, true);
  assert.equal(result.availabilitySemantics, AVAILABILITY_SEMANTICS.previousPurchaseAssociation);
  assert.deepEqual(result.evidence.mappedIngredientKeys, ['butter', 'egg']);
  assert.equal(result.recommendations[0].recipeId, 'r-omelette');
  assert.equal(result.recommendations[0].evidenceSource, 'history');
  assert.equal(result.recommendations[0].availabilitySemantics, AVAILABILITY_SEMANTICS.previousPurchaseAssociation);
  assert.match(result.recommendations[0].explanationText, /Inspired by your validated purchases/i);
  assert.match(result.recommendations[0].explanationText, /does not mean you can make it right now/i);
  assert.match(result.recommendations[0].dataLimitationText, /Quantities are not verified from purchase history/i);
  assert.doesNotMatch(result.recommendations[0].explanationText, /you can make this right now|currently covered|quantity sufficient/i);
});

test('popularity fallback is used when neither basket nor history maps', () => {
  const result = recommend({
    basketProducts: [],
    historyProducts: [{ id: 'h1', name: 'sparkling water' }],
    limit: 3,
  });
  assert.equal(result.evidenceSource, EVIDENCE_SOURCES.popularity);
  assert.equal(result.personalised, false);
  assert.equal(result.availabilitySemantics, AVAILABILITY_SEMANTICS.popularityFallback);
  assert.deepEqual(
    result.recommendations.map((r) => r.recipeId),
    ['r-omelette', 'r-pasta', 'r-rice'],
  );
  for (const rec of result.recommendations) {
    assert.equal(rec.personalised, false);
    assert.equal(rec.evidenceSource, 'popularity');
    assert.equal(rec.availabilitySemantics, AVAILABILITY_SEMANTICS.popularityFallback);
    assert.equal(rec.score, 0);
    assert.equal(rec.coveragePercent, 0);
    assert.match(rec.explanationText, /not personalised/i);
    assert.match(rec.dataLimitationText, /not a personalised recommendation/i);
    assert.match(rec.dataLimitationText, /No basket or purchase-history availability assessment/i);
    assert.doesNotMatch(rec.explanationText, PERSONALISATION_CLAIM);
    assert.doesNotMatch(rec.dataLimitationText, PERSONALISATION_CLAIM);
  }
});

test('ambiguous and unresolved mappings are excluded from evidence keys', () => {
  const stats = collectMappedEvidence(
    [
      { id: '1', name: 'pasta' },
      { id: '2', name: 'ambiguous pie' },
      { id: '3', name: 'unknown item' },
      { id: '4', name: 'tomato' },
    ],
    stubMap,
  );
  assert.deepEqual(stats.mappedIngredientKeys, ['pasta', 'tomato']);
  assert.equal(stats.mappedProductCount, 2);
  assert.equal(stats.ignoredAmbiguousCount, 1);
  assert.equal(stats.ignoredUnresolvedCount, 1);
  assert.equal(stats.uniqueIngredientCount, 2);
});

test('selectEvidenceSource falls through to history when the basket is only ambiguous/unresolved', () => {
  const selected = selectEvidenceSource({
    basketProducts: [{ name: 'ambiguous pie' }, { name: 'unknown item' }],
    historyProducts: [{ name: 'rice' }],
    mapProduct: stubMap,
  });
  assert.equal(selected.evidenceSource, 'history');
  assert.deepEqual(selected.evidence.mappedIngredientKeys, ['rice']);
});

test('structured explanations include matched, missing, coverage and score', () => {
  const rec = recommend({
    basketProducts: [{ name: 'pasta' }],
    limit: 1,
  }).recommendations[0];
  assert.equal(rec.recipeId, 'r-pasta');
  assert.equal(rec.matchedEssentialCount, 1);
  assert.equal(rec.missingEssentialCount, 1);
  assert.deepEqual(rec.matchedIngredients.map((i) => i.key), ['pasta']);
  assert.deepEqual(rec.missingEssential.map((i) => i.key), ['tomato']);
  assert.equal(typeof rec.score, 'number');
  assert.equal(rec.coveragePercent, 50);
  assert.equal(typeof rec.explanationText, 'string');
  assert.equal(typeof rec.dataLimitationText, 'string');
  assert.equal(rec.rank, 1);
});

test('missing ingredients are linked to supplied catalogue products via the mapper', () => {
  const rec = recommend({
    basketProducts: [{ id: 'b1', name: 'pasta' }],
    catalogueProducts: [
      { id: 'c-tomato', name: 'tomato' },
      { id: 'c-basil', name: 'basil' },
      { id: 'c-water', name: 'sparkling water' },
    ],
    limit: 1,
  }).recommendations[0];
  const keys = rec.missingLinkedProducts.map((p) => p.ingredientKey).sort();
  assert.deepEqual(keys, ['basil', 'tomato']);
  const tomato = rec.missingLinkedProducts.find((p) => p.ingredientKey === 'tomato');
  assert.equal(tomato.productId, 'c-tomato');
  assert.equal(tomato.productName, 'tomato');
  assert.equal(tomato.essential, true);
  assert.equal(tomato.confidence, 'exact');
  assert.ok(!rec.missingLinkedProducts.some((p) => p.ingredientKey === 'pasta'));
});

test('linkMissingIngredients picks the higher-confidence product, then lexicographic id', () => {
  const mapper = (product) => {
    if (product.name === 'cheap tomato') {
      return { status: 'mapped', ingredientKey: 'tomato', confidence: 'low', matchedRule: 'family_evidence' };
    }
    if (product.name === 'ripe tomato') {
      return { status: 'mapped', ingredientKey: 'tomato', confidence: 'exact', matchedRule: 'exact_phrase' };
    }
    return { status: 'unresolved', ingredientKey: null };
  };
  const linked = linkMissingIngredients(
    [{ key: 'tomato', label: 'Tomato', essential: true }],
    [
      { id: 'z', name: 'cheap tomato' },
      { id: 'a', name: 'ripe tomato' },
    ],
    mapper,
  );
  assert.equal(linked.length, 1);
  assert.equal(linked[0].productId, 'a');
  assert.equal(linked[0].confidence, 'exact');
});

test('LINKABLE_CONFIDENCE excludes low and none from purchase suggestions', () => {
  assert.deepEqual([...LINKABLE_CONFIDENCE], ['exact', 'high', 'medium']);
  assert.equal(isLinkableConfidence('exact'), true);
  assert.equal(isLinkableConfidence('high'), true);
  assert.equal(isLinkableConfidence('medium'), true);
  assert.equal(isLinkableConfidence('low'), false);
  assert.equal(isLinkableConfidence('none'), false);
  assert.equal(isLinkableConfidence(undefined), false);
});

test('low-confidence mappings contribute ingredient evidence but are not purchase-linked', () => {
  const mapper = () => ({
    status: 'mapped',
    ingredientKey: 'tomato',
    confidence: 'low',
    matchedRule: 'family_evidence',
  });
  const stats = collectMappedEvidence(
    [{ id: 'p-family', name: 'produce', family: 'tomato family' }],
    mapper,
  );
  assert.deepEqual(stats.mappedIngredientKeys, ['tomato']);
  assert.equal(stats.mappedProductCount, 1);
  assert.equal(stats.mappedEvidence[0].confidence, 'low');

  const linked = linkMissingIngredients(
    [{ key: 'tomato', label: 'Tomato', essential: true }],
    [{ id: 'c-low', name: 'produce', family: 'tomato family' }],
    mapper,
  );
  assert.deepEqual(linked, []);

  const rec = recommendRecipes({
    recipes: RECIPES,
    mapProduct: mapper,
    basketProducts: [{ id: 'p-family', name: 'produce', family: 'tomato family' }],
    catalogueProducts: [{ id: 'c-low', name: 'produce', family: 'tomato family' }],
    limit: 1,
  }).recommendations[0];
  assert.equal(rec.evidenceSource, 'basket');
  assert.ok(rec.missingLinkedProducts.every((p) => p.ingredientKey !== 'tomato'));
  assert.equal(rec.missingLinkedProducts.length, 0);
});

test('exact, high and medium mappings remain eligible for purchase suggestions', () => {
  const mapper = (product) => {
    if (product.name === 'exact tomato') {
      return { status: 'mapped', ingredientKey: 'tomato', confidence: 'exact', matchedRule: 'exact_phrase' };
    }
    if (product.name === 'high basil') {
      return { status: 'mapped', ingredientKey: 'basil', confidence: 'high', matchedRule: 'synonym_phrase' };
    }
    if (product.name === 'medium pasta') {
      return { status: 'mapped', ingredientKey: 'pasta', confidence: 'medium', matchedRule: 'name_token' };
    }
    if (product.name === 'none water') {
      return { status: 'mapped', ingredientKey: 'water', confidence: 'none', matchedRule: 'none' };
    }
    return { status: 'unresolved', ingredientKey: null, confidence: 'none' };
  };
  const linked = linkMissingIngredients(
    [
      { key: 'tomato', label: 'Tomato', essential: true },
      { key: 'basil', label: 'Basil', essential: false },
      { key: 'pasta', label: 'Pasta', essential: true },
      { key: 'water', label: 'Water', essential: false },
    ],
    [
      { id: 'c-t', name: 'exact tomato' },
      { id: 'c-b', name: 'high basil' },
      { id: 'c-p', name: 'medium pasta' },
      { id: 'c-w', name: 'none water' },
    ],
    mapper,
  );
  assert.deepEqual(
    linked.map((p) => p.ingredientKey),
    ['tomato', 'basil', 'pasta'],
  );
  assert.ok(!linked.some((p) => p.ingredientKey === 'water'));
  assert.equal(linked.find((p) => p.ingredientKey === 'tomato').confidence, 'exact');
  assert.equal(linked.find((p) => p.ingredientKey === 'basil').confidence, 'high');
  assert.equal(linked.find((p) => p.ingredientKey === 'pasta').confidence, 'medium');
});

test('a low-confidence catalogue product is ignored when a medium match exists', () => {
  const mapper = (product) => {
    if (product.name === 'cheap tomato') {
      return { status: 'mapped', ingredientKey: 'tomato', confidence: 'low', matchedRule: 'family_evidence' };
    }
    if (product.name === 'ok tomato') {
      return { status: 'mapped', ingredientKey: 'tomato', confidence: 'medium', matchedRule: 'name_token' };
    }
    return { status: 'unresolved', ingredientKey: null };
  };
  const linked = linkMissingIngredients(
    [{ key: 'tomato', label: 'Tomato', essential: true }],
    [
      { id: 'z', name: 'cheap tomato' },
      { id: 'm', name: 'ok tomato' },
    ],
    mapper,
  );
  assert.equal(linked.length, 1);
  assert.equal(linked[0].productId, 'm');
  assert.equal(linked[0].confidence, 'medium');
});

test('duplicate basket products map once and do not inflate evidence', () => {
  const stats = collectMappedEvidence(
    [
      { id: 'p1', name: 'pasta' },
      { id: 'p1', name: 'pasta' },
      { id: 'P1', name: 'pasta' },
    ],
    stubMap,
  );
  assert.equal(stats.consideredProductCount, 1);
  assert.equal(stats.mappedProductCount, 1);
  assert.deepEqual(stats.mappedIngredientKeys, ['pasta']);
});

test('ranking is deterministic and stable across repeated calls', () => {
  const input = {
    recipes: RECIPES,
    mapProduct: stubMap,
    basketProducts: [{ name: 'egg' }, { name: 'pasta' }],
    catalogueProducts: [{ id: 'c1', name: 'tomato' }],
    limit: 3,
  };
  const first = recommendRecipes(input);
  const second = recommendRecipes(input);
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.recommendations.map((r) => r.recipeId),
    second.recommendations.map((r) => r.recipeId),
  );
});

test('malformed input is safe or rejected without throwing on product contents', () => {
  assert.throws(() => recommendRecipes({ mapProduct: stubMap }), TypeError);
  assert.throws(() => recommendRecipes({ recipes: RECIPES }), TypeError);
  assert.throws(() => recommend({ basketProducts: 'pasta' }), TypeError);
  assert.throws(() => recommend({ historyProducts: { name: 'egg' } }), TypeError);
  assert.throws(() => recommend({ catalogueProducts: 'nope' }), TypeError);

  const result = recommend({
    basketProducts: [null, 42, { name: 'pasta' }, 'x'],
    historyProducts: undefined,
    catalogueProducts: [undefined, { name: 'tomato' }],
    limit: 1,
  });
  assert.equal(result.evidenceSource, 'basket');
  assert.ok(result.evidence.ignoredUnresolvedCount >= 1);
  assert.deepEqual(result.evidence.mappedIngredientKeys, ['pasta']);
});

test('recommendRecipes does not mutate recipes or product lists', () => {
  const recipes = deepFreeze(JSON.parse(JSON.stringify(RECIPES)));
  const basketProducts = deepFreeze([{ id: 'b1', name: 'pasta' }]);
  const historyProducts = deepFreeze([{ id: 'h1', name: 'egg' }]);
  const catalogueProducts = deepFreeze([{ id: 'c1', name: 'tomato' }]);
  assert.doesNotThrow(() =>
    recommendRecipes({ recipes, basketProducts, historyProducts, catalogueProducts, mapProduct: stubMap, limit: 2 }),
  );
  assert.equal(recipes[0].id, 'r-omelette');
  assert.equal(basketProducts[0].name, 'pasta');
});

test('createRecommendationService injects recipes and mapper', () => {
  const service = createRecommendationService({ recipes: RECIPES, mapProduct: stubMap });
  const result = service.recommend({ basketProducts: [{ name: 'rice' }, { name: 'egg' }], limit: 1 });
  assert.equal(result.recommendations[0].recipeId, 'r-rice');
  assert.equal(result.personalised, true);
});

test('popularity results never claim personalisation', () => {
  const result = recommend({ basketProducts: [], historyProducts: [], limit: 2 });
  assert.equal(result.personalised, false);
  assert.equal(result.evidenceSource, 'popularity');
  const blob = JSON.stringify(result);
  assert.doesNotMatch(blob, PERSONALISATION_CLAIM);
  assert.equal(blob.includes('"personalised":true'), false);
});

test('history is ignored while the basket has mapped evidence', () => {
  const result = recommend({
    basketProducts: [{ name: 'rice' }],
    historyProducts: [{ name: 'pasta' }, { name: 'tomato' }],
    limit: 1,
  });
  assert.equal(result.evidenceSource, 'basket');
  assert.deepEqual(result.evidence.mappedIngredientKeys, ['rice']);
  assert.equal(result.recommendations[0].recipeId, 'r-rice');
});

test('recommendRecipeById returns a recipe that would fall outside the list limit', () => {
  const listed = recommend({
    basketProducts: [{ name: 'pasta' }, { name: 'tomato' }],
    limit: 1,
  });
  assert.equal(listed.recommendations.length, 1);
  assert.equal(listed.recommendations[0].recipeId, 'r-pasta');

  const detail = recommendRecipeById({
    recipes: RECIPES,
    mapProduct: stubMap,
    recipeId: 'r-omelette',
    basketProducts: [{ name: 'pasta' }, { name: 'tomato' }],
    limit: 1,
  });
  assert.ok(detail);
  assert.equal(detail.recommendation.recipeId, 'r-omelette');
  assert.ok(detail.recommendation.rank > 1);
  assert.equal(detail.evidenceSource, listed.evidenceSource);
  assert.equal(detail.personalised, true);
});

test('recommendRecipeById returns null for an unknown recipe id', () => {
  assert.equal(
    recommendRecipeById({
      recipes: RECIPES,
      mapProduct: stubMap,
      recipeId: 'no-such-recipe',
      basketProducts: [{ name: 'pasta' }],
    }),
    null,
  );
});

// --- Tests with the real recipe dataset and mapping ---

const REAL_RECIPES = loadRecipeDataset();
const realMapper = createIngredientMapper(loadIngredientMappingConfig({ force: true }));

function omeletteCard(result) {
  return result.recommendations.find((r) => r.recipeId === 'classic-omelette');
}

test('integration: a single French six-egg pack line gives Classic Omelette 1/2 essential coverage', () => {
  const result = recommendRecipes({
    recipes: REAL_RECIPES,
    mapProduct: realMapper,
    basketProducts: [
      { id: 'b1', name: 'BOITE DE 06 OEUFS JAUNE ORANGE', family: 'VOLAILLE' },
    ],
    limit: 20,
  });

  assert.equal(result.evidenceSource, 'basket');
  assert.deepEqual(result.evidence.mappedIngredientKeys, ['egg']);

  const omelette = omeletteCard(result);
  assert.ok(omelette, 'Classic Omelette should be present');
  assert.equal(omelette.matchedEssentialCount, 1);
  assert.equal(omelette.totalEssential, 2);
  assert.equal(omelette.essentialCoverage, 0.5);
  assert.equal(omelette.coveragePercent, 50);
  assert.deepEqual(
    omelette.matchedIngredients.filter((i) => i.essential).map((i) => i.key),
    ['egg'],
  );
  assert.deepEqual(omelette.missingEssential.map((i) => i.key), ['butter']);
  assert.match(omelette.explanationText, /1 of 2 essential/);
});

test('integration: basket line quantity is irrelevant to the presence-based scorer', () => {
  const base = {
    recipes: REAL_RECIPES,
    mapProduct: realMapper,
    limit: 20,
  };
  const oneLine = recommendRecipes({
    ...base,
    basketProducts: [{ id: 'b1', name: 'BOITE DE 06 OEUFS JAUNE ORANGE' }],
  });
  const threeLines = recommendRecipes({
    ...base,
    basketProducts: [
      { id: 'b1', name: 'OEUFS FRAIS' },
      { id: 'b2', name: 'OEUFS FRAIS' },
      { id: 'b3', name: 'OEUFS FRAIS' },
    ],
  });

  const a = omeletteCard(oneLine);
  const b = omeletteCard(threeLines);
  assert.equal(a.matchedEssentialCount, b.matchedEssentialCount);
  assert.equal(a.essentialCoverage, b.essentialCoverage);
  assert.equal(a.coveragePercent, b.coveragePercent);
  assert.equal(b.coveragePercent, 50);
});

test('integration: adding butter lifts Classic Omelette to full essential coverage', () => {
  const result = recommendRecipes({
    recipes: REAL_RECIPES,
    mapProduct: realMapper,
    basketProducts: [
      { id: 'b1', name: 'Boîte de 6 œufs' },
      { id: 'b2', name: 'BEURRE DOUX 250 G' },
    ],
    limit: 20,
  });
  const omelette = omeletteCard(result);
  assert.equal(omelette.matchedEssentialCount, 2);
  assert.equal(omelette.coveragePercent, 100);
  assert.deepEqual(omelette.missingEssential, []);
});

test('integration: the "Your basket" badge marks the ranking source even for a 0-match recipe', () => {
  // The basket is the evidence source even for a recipe with 0% coverage.
  const result = recommendRecipes({
    recipes: REAL_RECIPES,
    mapProduct: realMapper,
    basketProducts: [{ id: 'b1', name: 'BOITE DE 06 OEUFS JAUNE ORANGE' }],
    limit: 20,
  });
  const pudding = result.recommendations.find((r) => r.recipeId === 'rice-pudding');
  assert.ok(pudding);
  assert.equal(pudding.evidenceSource, 'basket');
  assert.equal(pudding.availabilitySemantics, AVAILABILITY_SEMANTICS.currentAvailability);
  assert.equal(pudding.matchedEssentialCount, 0);
  assert.match(pudding.explanationText, /0 of \d+ essential/);
});

// --- Quantity-aware requirements + explicit alternatives (integration, real deps) ---

import { interpretProductName } from '../productInterpretation.service.js';
import { buildBasketAvailability, parseTrustedBasketQuantity } from './recommendation.service.js';

const realInterpret = (product) => interpretProductName(product, { mapProduct: realMapper });

function omeletteFrom(result) {
  return result.recommendations.find((r) => r.recipeId === 'classic-omelette');
}
function essentialReqs(card) {
  return card.requirements.filter((r) => r.essential);
}
function reqByKey(card, key) {
  return card.requirements.find((r) => r.key === key);
}
function recommendReal(basketProducts, historyProducts = []) {
  return recommendRecipes({
    recipes: REAL_RECIPES,
    mapProduct: realMapper,
    interpretProduct: realInterpret,
    basketProducts,
    historyProducts,
    catalogueProducts: [],
    limit: 20,
  });
}

test('req: one six-egg pack x basket quantity 1 -> egg sufficient (6 >= 3), cooking fat missing, 1/2', () => {
  const card = omeletteFrom(recommendReal([{ id: 'b1', name: 'BOITE DE 06 OEUFS JAUNE ORANGE', family: 'VOLAILLE', basketQuantity: 1 }]));
  const egg = reqByKey(card, 'egg');
  assert.equal(egg.status, 'sufficient');
  assert.equal(egg.matchedKey, 'egg');
  assert.equal(egg.availableAmount, 6);
  assert.equal(egg.availableUnit, 'piece');
  assert.equal(egg.requiredAmount, 3);
  assert.equal(reqByKey(card, 'butter').status, 'missing');
  assert.equal(card.matchedEssentialCount, 1);
  assert.equal(card.totalEssential, 2);
});

test('req: one six-egg pack x basket quantity 2 -> 12 pieces available, still sufficient', () => {
  const card = omeletteFrom(recommendReal([{ id: 'b1', name: 'BOITE DE 06 OEUFS', basketQuantity: 2 }]));
  const egg = reqByKey(card, 'egg');
  assert.equal(egg.availableAmount, 12);
  assert.equal(egg.status, 'sufficient');
});

test('req: two-egg pack vs required three -> insufficient, not counted as matched', () => {
  const card = omeletteFrom(recommendReal([{ id: 'b1', name: 'BOITE DE 2 OEUFS', basketQuantity: 1 }]));
  const egg = reqByKey(card, 'egg');
  assert.equal(egg.status, 'insufficient');
  assert.equal(egg.availableAmount, 2);
  assert.equal(egg.requiredAmount, 3);
  assert.equal(card.matchedEssentialCount, 0);
});

test('req: unknown egg package amount -> quantity_unknown, presence preserved for ranking, never "3 available"', () => {
  const card = omeletteFrom(recommendReal([{ id: 'b1', name: 'OEUFS FERMIERS', basketQuantity: 1 }]));
  const egg = reqByKey(card, 'egg');
  assert.equal(egg.status, 'quantity_unknown');
  assert.equal(egg.availableAmount, null);
  assert.equal(egg.requiredAmount, 3);
  assert.equal(card.matchedEssentialCount, 1); // conservative presence match retained
});

test('req: eggs + butter -> both omelette essential requirements matched (2/2)', () => {
  const card = omeletteFrom(recommendReal([
    { id: 'b1', name: 'BOITE DE 06 OEUFS', basketQuantity: 1 },
    { id: 'b2', name: 'BEURRE DOUX 250 G', basketQuantity: 1 },
  ]));
  assert.equal(card.matchedEssentialCount, 2);
  assert.equal(reqByKey(card, 'butter').matchedKey, 'butter');
});

test('req: eggs + olive oil, no butter -> both matched, fat via olive_oil, butter never claimed present', () => {
  const result = recommendReal([
    { id: 'b1', name: 'BOITE DE 06 OEUFS', basketQuantity: 1 },
    { id: 'b2', name: 'HUILE D OLIVE EXTRA VIERGE 500 ML', basketQuantity: 1 },
  ]);
  const card = omeletteFrom(result);
  const fat = reqByKey(card, 'butter');
  assert.equal(fat.status, 'matched');
  assert.equal(fat.matchedKey, 'olive_oil'); // satisfied by the alternative, not butter
  assert.equal(card.matchedEssentialCount, 2);
  // Butter is not in the basket. The declared alternative meets the requirement.
  assert.equal(result.evidence.mappedIngredientKeys.includes('butter'), false);
  assert.equal(result.evidence.mappedIngredientKeys.includes('olive_oil'), true);
});

test('req: eggs + both fats -> cooking-fat group counts once (still 2/2, matchedKey deterministic = butter)', () => {
  const card = omeletteFrom(recommendReal([
    { id: 'b1', name: 'BOITE DE 06 OEUFS', basketQuantity: 1 },
    { id: 'b2', name: 'BEURRE DOUX 250 G', basketQuantity: 1 },
    { id: 'b3', name: 'HUILE D OLIVE 500 ML', basketQuantity: 1 },
  ]));
  assert.equal(card.matchedEssentialCount, 2);
  assert.equal(card.totalEssential, 2);
  assert.equal(reqByKey(card, 'butter').matchedKey, 'butter'); // first in anyOfKeys order
  assert.equal(essentialReqs(card).length, 2); // not three
});

test('req: eggs only -> cooking fat missing (1/2)', () => {
  const card = omeletteFrom(recommendReal([{ id: 'b1', name: 'BOITE DE 06 OEUFS', basketQuantity: 1 }]));
  assert.equal(reqByKey(card, 'butter').status, 'missing');
  assert.equal(card.matchedEssentialCount, 1);
});

test('req: olive oil only -> egg requirement missing', () => {
  const card = omeletteFrom(recommendReal([{ id: 'b1', name: 'HUILE D OLIVE 500 ML', basketQuantity: 1 }]));
  assert.equal(reqByKey(card, 'egg').status, 'missing');
  assert.equal(reqByKey(card, 'butter').status, 'matched');
  assert.equal(card.matchedEssentialCount, 1);
});

test('req: historical eggs never claim current quantity sufficiency', () => {
  const result = recommendReal([], [{ id: 'h1', name: 'BOITE DE 06 OEUFS', basketQuantity: 1 }]);
  assert.equal(result.evidenceSource, 'history');
  const egg = reqByKey(omeletteFrom(result), 'egg');
  assert.equal(egg.status, 'quantity_unknown');
  assert.equal(egg.availableAmount, null);
});

test('req: compatible quantities aggregate (500 g + 1 kg rice -> 1500 g)', () => {
  const avail = buildBasketAvailability(
    [
      { id: 'b1', name: 'RIZ 500 G', basketQuantity: 1 },
      { id: 'b2', name: 'RIZ 1 KG', basketQuantity: 1 },
    ],
    realInterpret,
  );
  assert.deepEqual(
    { amount: avail.get('rice').amount, unit: avail.get('rice').unit, status: avail.get('rice').status },
    { amount: 1500, unit: 'g', status: 'known' },
  );
});

test('req: incompatible / unknown quantities are not guessed', () => {
  // one known g line + one unknown line for the same key -> unknown
  const avail = buildBasketAvailability(
    [
      { id: 'b1', name: 'RIZ 500 G', basketQuantity: 1 },
      { id: 'b2', name: 'RIZ', basketQuantity: 1 },
    ],
    realInterpret,
  );
  assert.equal(avail.get('rice').status, 'unknown');
  assert.equal(avail.get('rice').amount, null);
});

test('req: recipes without structured amounts keep presence-based behaviour', () => {
  const card = recommendReal([
    { id: 'b1', name: 'SPAGHETTI 500 GR', basketQuantity: 1 },
    { id: 'b2', name: 'CONCENTRE DE TOMATE 400 G', basketQuantity: 1 },
  ]).recommendations.find((r) => r.recipeId === 'tomato-pantry-pasta');
  assert.equal(card.totalEssential, 3);
  assert.equal(card.matchedEssentialCount, 2); // pasta + tomato; oil still missing
  assert.ok(['sufficient', 'matched'].includes(reqByKey(card, 'pasta').status));
  assert.equal(reqByKey(card, 'olive_oil').status, 'missing');
});

test('req: repeated ranking is deterministic with the new pipeline', () => {
  const basket = [{ id: 'b1', name: 'BOITE DE 06 OEUFS', basketQuantity: 1 }, { id: 'b2', name: 'HUILE D OLIVE 500 ML', basketQuantity: 1 }];
  const a = recommendReal(basket);
  const b = recommendReal(basket);
  assert.deepEqual(a.recommendations.map((r) => r.recipeId), b.recommendations.map((r) => r.recipeId));
  assert.deepEqual(omeletteFrom(a).requirements, omeletteFrom(b).requirements);
});

test('req: missing-alternative linking does not suggest butter when olive oil already satisfies the group', () => {
  // Olive oil in basket -> cooking-fat requirement is "matched", so it is not a
  // missing requirement and gets no linked product at all.
  const result = recommendRecipes({
    recipes: REAL_RECIPES,
    mapProduct: realMapper,
    interpretProduct: realInterpret,
    basketProducts: [{ id: 'b1', name: 'BOITE DE 06 OEUFS', basketQuantity: 1 }, { id: 'b2', name: 'HUILE D OLIVE 500 ML', basketQuantity: 1 }],
    catalogueProducts: [
      { id: 'c-butter', name: 'BEURRE DOUX 250 G' },
      { id: 'c-oil', name: 'HUILE D OLIVE EXTRA VIERGE 500 ML' },
    ],
    limit: 20,
  });
  const card = omeletteFrom(result);
  assert.equal(card.missingLinkedProducts.some((p) => p.requirementKey === 'butter'), false);
});

test('req: a missing cooking-fat group links one preferred product for the whole group', () => {
  const result = recommendRecipes({
    recipes: REAL_RECIPES,
    mapProduct: realMapper,
    interpretProduct: realInterpret,
    basketProducts: [{ id: 'b1', name: 'BOITE DE 06 OEUFS', basketQuantity: 1 }],
    catalogueProducts: [
      { id: 'c-butter', name: 'BEURRE DOUX 250 G' },
      { id: 'c-oil', name: 'HUILE D OLIVE EXTRA VIERGE 500 ML' },
    ],
    limit: 20,
  });
  const card = omeletteFrom(result);
  const links = card.missingLinkedProducts.filter((p) => p.requirementKey === 'butter');
  assert.equal(links.length, 1);
  assert.equal(links[0].ingredientKey, 'butter'); // first in anyOfKeys order that has a product
  assert.equal(links[0].satisfiesRequirement, true);
  assert.equal(LINKABLE_CONFIDENCE.includes(links[0].confidence), true);
});

test('req: insufficient requirement is not offered a "buy this" link', () => {
  const result = recommendRecipes({
    recipes: REAL_RECIPES,
    mapProduct: realMapper,
    interpretProduct: realInterpret,
    basketProducts: [{ id: 'b1', name: 'BOITE DE 2 OEUFS', basketQuantity: 1 }],
    catalogueProducts: [{ id: 'c-eggs', name: 'BOITE DE 6 OEUFS' }],
    limit: 20,
  });
  const card = omeletteFrom(result);
  assert.equal(card.missingLinkedProducts.some((p) => p.requirementKey === 'egg'), false);
});

test('req: inputs are not mutated by the requirement pipeline', () => {
  const basket = deepFreeze([{ id: 'b1', name: 'BOITE DE 06 OEUFS', basketQuantity: 1 }]);
  const recipes = deepFreeze(REAL_RECIPES.map((r) => deepFreeze({ ...r, ingredients: r.ingredients.map((i) => deepFreeze({ ...i })) })));
  assert.doesNotThrow(() =>
    recommendRecipes({ recipes, mapProduct: realMapper, interpretProduct: realInterpret, basketProducts: basket, catalogueProducts: [], limit: 5 }),
  );
  assert.equal(basket[0].name, 'BOITE DE 06 OEUFS');
});

test('parseTrustedBasketQuantity: trusted positive integer OR null, never coerced to 1', () => {
  assert.equal(parseTrustedBasketQuantity(3), 3);
  assert.equal(parseTrustedBasketQuantity(1), 1);
  assert.equal(parseTrustedBasketQuantity(100_000), 100_000);
  assert.equal(parseTrustedBasketQuantity('3'), 3);
  assert.equal(parseTrustedBasketQuantity('06'), 6); // leading zero from a driver
  assert.equal(parseTrustedBasketQuantity('  6  '), 6);
  // untrusted -> null (not 1)
  for (const bad of [
    null, undefined, '', '   ', 0, -1, -20, 1.5, 2.0001, NaN, Infinity, -Infinity,
    'x', '3.5', '1e3', '-3', '0x10', true, false, {}, [], 100_001, 1e12,
  ]) {
    assert.equal(parseTrustedBasketQuantity(bad), null, `parseTrustedBasketQuantity(${String(bad)})`);
  }
});

test('normaliseEvidenceProduct: basketQuantity is number|null and is never coerced to 1', () => {
  assert.equal(normaliseEvidenceProduct({ id: 'x', name: 'x' }).basketQuantity, null); // missing
  assert.equal(normaliseEvidenceProduct({ id: 'x', name: 'x', basketQuantity: 4 }).basketQuantity, 4);
  assert.equal(normaliseEvidenceProduct({ id: 'x', name: 'x', Quantity: '3' }).basketQuantity, 3);
  for (const bad of [0, -2, 1.5, NaN, Infinity, '', 'x', true]) {
    assert.equal(normaliseEvidenceProduct({ id: 'x', name: 'x', basketQuantity: bad }).basketQuantity, null);
  }
});

test('req: an untrusted basket-line quantity -> egg present but quantity_unknown, never sufficient', () => {
  for (const bad of [null, undefined, 0, -1, 1.5, NaN, 'abc', '3.5', 100_001]) {
    const result = recommendReal([{ id: 'b1', name: 'BOITE DE 06 OEUFS', basketQuantity: bad }]);
    const card = omeletteFrom(result);
    const egg = reqByKey(card, 'egg');
    assert.equal(egg.status, 'quantity_unknown', `basketQuantity=${String(bad)}`);
    assert.equal(egg.availableAmount, null);
    assert.equal(egg.requiredAmount, 3); // recipe requirement still shown, never asserted as available
    // presence-based ranking is preserved
    assert.equal(result.evidence.mappedIngredientKeys.includes('egg'), true);
    assert.equal(card.matchedEssentialCount, 1); // egg presence retained
  }
});

test('req: a trusted basket-line quantity still yields a verified amount (6 -> sufficient)', () => {
  const card = omeletteFrom(recommendReal([{ id: 'b1', name: 'BOITE DE 06 OEUFS', basketQuantity: 1 }]));
  const egg = reqByKey(card, 'egg');
  assert.equal(egg.status, 'sufficient');
  assert.equal(egg.availableAmount, 6);
  const card2 = omeletteFrom(recommendReal([{ id: 'b1', name: 'BOITE DE 06 OEUFS', basketQuantity: '2' }]));
  assert.equal(reqByKey(card2, 'egg').availableAmount, 12); // valid numeric string accepted
});

// --- Correction 2: popularity cards preserve structured recipe requirements ---

test('popularity: recipe detail keeps structured requirements as not_evaluated', () => {
  const result = recommendRecipes({
    recipes: REAL_RECIPES,
    mapProduct: realMapper,
    interpretProduct: realInterpret,
    basketProducts: [],
    historyProducts: [],
    catalogueProducts: [],
    limit: 20,
  });
  assert.equal(result.evidenceSource, 'popularity');
  const card = omeletteFrom(result);
  assert.equal(card.requirements.length, 3); // egg, butter and cheese, never an empty list
  for (const r of card.requirements) {
    assert.equal(r.status, 'not_evaluated');
    assert.equal(r.reasonCode, 'no_evidence');
    assert.equal(r.matchedKey, null);
    assert.equal(r.availableAmount, null);
    assert.equal(r.availableUnit, null);
    assert.ok(Array.isArray(r.anyOfKeys) && r.anyOfKeys.length >= 1);
    assert.ok('label' in r && 'labelKey' in r && 'essential' in r && 'quantityText' in r);
  }
  const egg = card.requirements.find((r) => r.key === 'egg');
  assert.equal(egg.requiredAmount, 3);
  assert.equal(egg.requiredUnit, 'piece');
  assert.equal(egg.essential, true);
  const fat = card.requirements.find((r) => r.key === 'butter');
  assert.deepEqual(fat.anyOfKeys, ['butter', 'olive_oil']);
  assert.equal(fat.labelKey, 'recipe.reqLabel.cookingFat');
  assert.equal(fat.quantityText, '1 knob butter or a little olive oil');
});

test('popularity: not_evaluated requirements are neither matched nor missing in the counts', () => {
  const result = recommendRecipes({
    recipes: REAL_RECIPES, mapProduct: realMapper, interpretProduct: realInterpret,
    basketProducts: [], historyProducts: [], catalogueProducts: [], limit: 20,
  });
  const card = omeletteFrom(result);
  assert.equal(card.matchedEssentialCount, 0);
  assert.equal(card.score, 0);
  assert.equal(card.coveragePercent, 0);
});

test('popularity: bounded catalogue links are still offered (one preferred product per group)', () => {
  const result = recommendRecipes({
    recipes: REAL_RECIPES, mapProduct: realMapper, interpretProduct: realInterpret,
    basketProducts: [], historyProducts: [],
    catalogueProducts: [
      { id: 'c-eggs', name: 'BOITE DE 6 OEUFS' },
      { id: 'c-butter', name: 'BEURRE DOUX 250 G' },
      { id: 'c-oil', name: 'HUILE D OLIVE EXTRA VIERGE 500 ML' },
    ],
    limit: 20,
  });
  const card = omeletteFrom(result);
  const eggLink = card.missingLinkedProducts.filter((p) => p.requirementKey === 'egg');
  const fatLink = card.missingLinkedProducts.filter((p) => p.requirementKey === 'butter');
  assert.equal(eggLink.length, 1);
  assert.equal(fatLink.length, 1);
  assert.equal(fatLink[0].ingredientKey, 'butter'); // first anyOfKeys entry with a product
  assert.equal(fatLink[0].satisfiesRequirement, true);
  assert.equal(LINKABLE_CONFIDENCE.includes(fatLink[0].confidence), true);
  // still bounded: at most one per requirement group
  const byGroup = new Map();
  for (const p of card.missingLinkedProducts) byGroup.set(p.requirementKey, (byGroup.get(p.requirementKey) ?? 0) + 1);
  for (const [, n] of byGroup) assert.ok(n <= 1);
});

test('popularity: repeated ranking + requirements are deterministic', () => {
  const run = () => recommendRecipes({
    recipes: REAL_RECIPES, mapProduct: realMapper, interpretProduct: realInterpret,
    basketProducts: [], historyProducts: [], catalogueProducts: [], limit: 20,
  });
  const a = run(); const b = run();
  assert.deepEqual(a.recommendations.map((r) => r.recipeId), b.recommendations.map((r) => r.recipeId));
  assert.deepEqual(omeletteFrom(a).requirements, omeletteFrom(b).requirements);
});

// --- popularity cards make no matched/missing claims ---

test('popularity: every legacy matched/missing count is zero and every list is empty', () => {
  const result = recommend({
    basketProducts: [],
    historyProducts: [{ id: 'h1', name: 'sparkling water' }],
    limit: 3,
  });
  assert.equal(result.evidenceSource, 'popularity');
  for (const card of result.recommendations) {
    assert.equal(card.matchedEssentialCount, 0);
    assert.equal(card.missingEssentialCount, 0);
    assert.equal(card.matchedOptionalCount, 0);
    assert.equal(card.missingOptionalCount, 0);
    assert.deepEqual(card.matchedIngredients, []);
    assert.deepEqual(card.missingIngredients, []);
    assert.deepEqual(card.missingEssential, []);
    assert.deepEqual(card.missingOptional, []);
  }
});

test('popularity: totalEssential / totalOptional still hold the real recipe totals', () => {
  const result = recommend({ basketProducts: [], historyProducts: [], limit: 3 });
  const omelette = result.recommendations.find((r) => r.recipeId === 'r-omelette');
  const pasta = result.recommendations.find((r) => r.recipeId === 'r-pasta');
  assert.equal(omelette.totalEssential, 2); // egg + butter
  assert.equal(omelette.totalOptional, 1); // cheese
  assert.equal(pasta.totalEssential, 2); // pasta + tomato
  assert.equal(pasta.totalOptional, 1); // basil
});

test('popularity: structured requirements stay complete and all not_evaluated', () => {
  const result = recommend({ basketProducts: [], historyProducts: [], limit: 3 });
  const omelette = result.recommendations.find((r) => r.recipeId === 'r-omelette');
  assert.equal(omelette.requirements.length, 3); // egg, butter and cheese, never an empty list
  for (const r of omelette.requirements) {
    assert.equal(r.status, 'not_evaluated');
    assert.equal(r.reasonCode, 'no_evidence');
    assert.equal(r.availableAmount, null);
    assert.equal(r.matchedKey, null);
  }
  assert.deepEqual(
    omelette.requirements.filter((r) => r.essential).map((r) => r.key),
    ['egg', 'butter'],
  );
});

test('popularity: a serialised card contains no missing-ingredient entries', () => {
  const result = recommend({ basketProducts: [], historyProducts: [], limit: 3 });
  for (const card of result.recommendations) {
    const blob = JSON.stringify({
      missingIngredients: card.missingIngredients,
      missingEssential: card.missingEssential,
      missingOptional: card.missingOptional,
    });
    assert.equal(blob, '{"missingIngredients":[],"missingEssential":[],"missingOptional":[]}');
  }
});

test('req: six eggs satisfy the three-egg omelette requirement', () => {
  const card = omeletteFrom(recommendReal([
    { id: 'b1', name: 'BOITE DE 06 OEUFS', basketQuantity: 1 },
    { id: 'b2', name: 'HUILE D OLIVE 500 ML', basketQuantity: 1 },
  ]));
  assert.equal(reqByKey(card, 'egg').status, 'sufficient');
  assert.equal(reqByKey(card, 'egg').availableAmount, 6);
  assert.equal(reqByKey(card, 'butter').status, 'matched');
  assert.equal(reqByKey(card, 'butter').matchedKey, 'olive_oil');
  assert.equal(card.missingEssentialCount, 0);
});

test('req: butter and olive oil independently satisfy the cooking-fat group', () => {
  const withButter = omeletteFrom(recommendReal([
    { id: 'b1', name: 'BOITE DE 06 OEUFS', basketQuantity: 1 },
    { id: 'b2', name: 'BEURRE DOUX 250 G', basketQuantity: 1 },
  ]));
  const withOil = omeletteFrom(recommendReal([
    { id: 'b1', name: 'BOITE DE 06 OEUFS', basketQuantity: 1 },
    { id: 'b2', name: 'HUILE D OLIVE 500 ML', basketQuantity: 1 },
  ]));
  assert.equal(reqByKey(withButter, 'butter').status, 'matched');
  assert.equal(reqByKey(withButter, 'butter').matchedKey, 'butter');
  assert.equal(reqByKey(withOil, 'butter').status, 'matched');
  assert.equal(reqByKey(withOil, 'butter').matchedKey, 'olive_oil');
});

test('req: one 130 g tuna can is insufficient for tuna pasta salad; two cans are sufficient', () => {
  const pastaMayo = [
    { id: 'pasta', name: 'SPAGHETTI 500 GR', basketQuantity: 1 },
    { id: 'mayo', name: 'MAYONNAISE 480 ML JADIDA', basketQuantity: 1 },
  ];
  const oneCan = recommendReal([
    ...pastaMayo,
    { id: 'tuna', name: 'THON MARISSA 130GR', basketQuantity: 1 },
  ]).recommendations.find((r) => r.recipeId === 'tuna-pasta-salad');
  const twoCans = recommendReal([
    ...pastaMayo,
    { id: 'tuna', name: 'THON MARISSA 130GR', basketQuantity: 2 },
  ]).recommendations.find((r) => r.recipeId === 'tuna-pasta-salad');
  const oneTuna = reqByKey(oneCan, 'canned_tuna');
  const twoTuna = reqByKey(twoCans, 'canned_tuna');
  assert.equal(oneTuna.status, 'insufficient');
  assert.equal(oneTuna.availableAmount, 130);
  assert.equal(oneTuna.requiredAmount, 250);
  assert.equal(twoTuna.status, 'sufficient');
  assert.equal(twoTuna.availableAmount, 260);
  assert.equal(twoCans.missingEssentialCount, 0);
});

test('specificity: complete peanut-butter pancakes outrank fluffy pancakes; incomplete do not', () => {
  const batter = [
    { id: 'flour', name: 'FARINE 1 KG', basketQuantity: 1 },
    { id: 'egg', name: 'BOITE DE 06 OEUFS', basketQuantity: 1 },
    { id: 'milk', name: 'LAIT 1 L', basketQuantity: 1 },
  ];
  const withoutPb = recommendReal(batter);
  const withPb = recommendReal([...batter, { id: 'pb', name: 'BEURRE DE CACAHUETE 330 G', basketQuantity: 1 }]);
  const withoutIds = withoutPb.recommendations.map((r) => r.recipeId);
  const withIds = withPb.recommendations.map((r) => r.recipeId);
  assert.ok(withoutIds.indexOf('fluffy-pancakes') < withoutIds.indexOf('peanut-butter-pancakes'));
  assert.ok(withIds.indexOf('peanut-butter-pancakes') < withIds.indexOf('fluffy-pancakes'));
  const pb = withPb.recommendations.find((r) => r.recipeId === 'peanut-butter-pancakes');
  const fluffy = withPb.recommendations.find((r) => r.recipeId === 'fluffy-pancakes');
  assert.equal(pb.missingEssentialCount, 0);
  assert.equal(fluffy.missingEssentialCount, 0);
  assert.ok(pb.matchedEssentialCount > fluffy.matchedEssentialCount);
});

test('specificity: cheesy tomato pasta outranks pantry pasta only when cheese is also present', () => {
  const base = [
    { id: 'pasta', name: 'SPAGHETTI 500 GR', basketQuantity: 1 },
    { id: 'tomato', name: 'CONCENTRE DE TOMATE 400 G', basketQuantity: 1 },
    { id: 'oil', name: 'HUILE D OLIVE 500 ML', basketQuantity: 1 },
  ];
  const withoutCheese = recommendReal(base);
  const withCheese = recommendReal([...base, { id: 'cheese', name: 'CHEDDAR RAPE 120 G', basketQuantity: 1 }]);
  const withoutIds = withoutCheese.recommendations.map((r) => r.recipeId);
  const withIds = withCheese.recommendations.map((r) => r.recipeId);
  assert.ok(withoutIds.indexOf('tomato-pantry-pasta') < withoutIds.indexOf('cheesy-tomato-pasta'));
  assert.ok(withIds.indexOf('cheesy-tomato-pasta') < withIds.indexOf('tomato-pantry-pasta'));

  const cheesyWithout = withoutCheese.recommendations.find((r) => r.recipeId === 'cheesy-tomato-pasta');
  const pantryWithout = withoutCheese.recommendations.find((r) => r.recipeId === 'tomato-pantry-pasta');
  assert.equal(pantryWithout.missingEssentialCount, 0);
  assert.equal(cheesyWithout.missingEssentialCount, 1);
  assert.ok(pantryWithout.score > cheesyWithout.score);

  const cheesyWith = withCheese.recommendations.find((r) => r.recipeId === 'cheesy-tomato-pasta');
  const pantryWith = withCheese.recommendations.find((r) => r.recipeId === 'tomato-pantry-pasta');
  assert.equal(cheesyWith.score, 1);
  assert.equal(pantryWith.score, 1);
  assert.equal(cheesyWith.matchedOptionalCount, 0);
  assert.equal(cheesyWith.missingEssentialCount, 0);
  assert.equal(pantryWith.missingEssentialCount, 0);
  assert.ok(cheesyWith.matchedEssentialCount > pantryWith.matchedEssentialCount);
});

test('cheddar, mozzarella and parmesan satisfy one equivalent cheese requirement without optional double-counting', () => {
  const base = [
    { id: 'pasta', name: 'SPAGHETTI 500 GR', basketQuantity: 1 },
    { id: 'tomato', name: 'CONCENTRE DE TOMATE 400 G', basketQuantity: 1 },
    { id: 'oil', name: 'HUILE D OLIVE 500 ML', basketQuantity: 1 },
  ];
  const cheeseProducts = [
    { id: 'cheddar', name: 'CHEDDAR RAPE 120 G', basketQuantity: 1, expectedMatchedKey: 'cheese' },
    { id: 'mozzarella', name: 'MOZZARELLA RAPEE 110 GR', basketQuantity: 1, expectedMatchedKey: 'mozzarella' },
    { id: 'parmesan', name: 'PARMIGIANO REGGIANO 100G', basketQuantity: 1, expectedMatchedKey: 'parmesan' },
  ];

  for (const product of cheeseProducts) {
    const listed = recommendReal([...base, product]);
    const result = listed.recommendations.find((r) => r.recipeId === 'cheesy-tomato-pasta');
    const pantry = listed.recommendations.find((r) => r.recipeId === 'tomato-pantry-pasta');
    assert.ok(result, product.id);
    assert.equal(result.score, 1, product.id);
    assert.equal(result.matchedEssentialCount, 4, product.id);
    assert.equal(result.missingEssentialCount, 0, product.id);
    assert.equal(result.matchedOptionalCount, 0, product.id);
    assert.equal(result.missingOptionalCount, 0, product.id);
    assert.deepEqual(result.missingOptional, []);
    assert.equal(result.requirements.length, 4, product.id);
    assert.equal(result.requirements.filter((r) => r.key === 'cheese').length, 1);
    const cheese = reqByKey(result, 'cheese');
    // A name with no structured quantity counts as matched.
    assert.equal(cheese.status, 'matched', product.id);
    assert.equal(cheese.essential, true);
    assert.equal(cheese.matchedKey, product.expectedMatchedKey, product.id);
    assert.deepEqual(cheese.anyOfKeys, ['cheese', 'mozzarella', 'parmesan']);
    assert.equal(listed.recommendations.indexOf(result) < listed.recommendations.indexOf(pantry), true);
    assert.equal(pantry.score, 1);
    assert.ok(result.matchedEssentialCount > pantry.matchedEssentialCount);
  }
});

test('recommendRecipeById echoes availabilitySemantics with the list payload', () => {
  const listed = recommendRecipes({
    recipes: RECIPES,
    mapProduct: stubMap,
    basketProducts: [{ id: 'b1', name: 'egg' }, { id: 'b2', name: 'butter' }],
    limit: 3,
  });
  const detail = recommendRecipeById({
    recipes: RECIPES,
    mapProduct: stubMap,
    recipeId: 'r-omelette',
    basketProducts: [{ id: 'b1', name: 'egg' }, { id: 'b2', name: 'butter' }],
  });
  assert.equal(listed.availabilitySemantics, AVAILABILITY_SEMANTICS.currentAvailability);
  assert.equal(detail.availabilitySemantics, listed.availabilitySemantics);
  assert.equal(detail.recommendation.availabilitySemantics, AVAILABILITY_SEMANTICS.currentAvailability);
});

test('history quantity_unknown is presence evidence for ranking, never quantity-sufficient', () => {
  const result = recommendReal([], [
    { id: 'h1', name: 'BOITE DE 06 OEUFS' },
    { id: 'h2', name: 'BEURRE DOUX 250 G' },
  ]);
  assert.equal(result.evidenceSource, 'history');
  assert.equal(result.availabilitySemantics, AVAILABILITY_SEMANTICS.previousPurchaseAssociation);
  const omelette = omeletteFrom(result);
  assert.equal(reqByKey(omelette, 'egg').status, 'quantity_unknown');
  assert.equal(reqByKey(omelette, 'egg').availableAmount, null);
  assert.equal(omelette.missingEssentialCount, 0);
  assert.match(omelette.explanationText, /Inspired by your validated purchases/i);
  assert.doesNotMatch(omelette.explanationText, /Quantity sufficient|currently in your basket|you can make this right now/i);
  assert.doesNotMatch(omelette.dataLimitationText, /currently covered|no ingredients missing/i);
});
