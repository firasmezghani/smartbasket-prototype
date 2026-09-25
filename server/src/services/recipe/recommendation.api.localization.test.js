import test from 'node:test';
import assert from 'node:assert/strict';

import { createRecommendationApiService } from './recommendation.api.service.js';
import { loadRecipeDataset } from './recipeDataset.js';
import { createIngredientMapper } from './ingredientMapping.service.js';
import { interpretProductName } from '../productInterpretation.service.js';

// The recipe API returns the same structure in English and French; only display
// text changes. Other languages fall back to English.

const mapProduct = createIngredientMapper();
const recipes = loadRecipeDataset();

function product(id, name, extra = {}) {
  return { id, name, family: extra.family ?? null, description: '', brand: '', ...extra };
}

function makeApi(basketProducts = []) {
  return createRecommendationApiService({
    evidenceAdapter: { async loadEvidence() { return { basketProducts, historyProducts: [], catalogueProducts: [] }; } },
    recipes,
    mapProduct,
    interpretProduct: (p) => interpretProductName(p, { mapProduct }),
  });
}

// Fields that must be byte-identical between locales, per card.
const STRUCTURAL_KEYS = [
  'recipeId', 'prepTimeMinutes', 'difficulty', 'fallbackRank', 'rank', 'score',
  'coveragePercent', 'essentialCoverage', 'optionalCoverage', 'matchedEssentialCount',
  'missingEssentialCount', 'matchedOptionalCount', 'missingOptionalCount', 'totalEssential',
  'totalOptional', 'personalised', 'evidenceSource', 'availabilitySemantics',
];

function requirementSignature(card) {
  return (card.requirements ?? []).map((r) => ({
    key: r.key, labelKey: r.labelKey, essential: r.essential, anyOfKeys: r.anyOfKeys,
    matchedKey: r.matchedKey, requiredAmount: r.requiredAmount, requiredUnit: r.requiredUnit,
    availableAmount: r.availableAmount, availableUnit: r.availableUnit, status: r.status,
    reasonCode: r.reasonCode,
  }));
}

test('list: en and fr return the same recipes in the same order with identical structure', async () => {
  const api = makeApi([product('p-eggs', 'BOITE DE 06 OEUFS', { family: 'CREMERIE', basketQuantity: 1 })]);
  const en = await api.listRecipes({ customerId: 1, limit: 20, language: 'en' });
  const fr = await api.listRecipes({ customerId: 1, limit: 20, language: 'fr' });

  assert.deepEqual(
    fr.recommendations.map((c) => c.recipeId),
    en.recommendations.map((c) => c.recipeId),
  );
  assert.equal(fr.evidenceSource, en.evidenceSource);
  assert.equal(fr.personalised, en.personalised);

  for (let i = 0; i < en.recommendations.length; i += 1) {
    const a = en.recommendations[i];
    const b = fr.recommendations[i];
    for (const key of STRUCTURAL_KEYS) assert.deepEqual(b[key], a[key], `${a.recipeId}.${key}`);
    assert.deepEqual(requirementSignature(b), requirementSignature(a), `${a.recipeId} requirements`);
    // The display name is French (different from English) for every recipe.
    assert.notEqual(b.name, a.name, `${a.recipeId} name should be localized`);
    assert.equal(typeof b.description, 'string');
  }
});

test('detail: en and fr are structurally identical; fr localizes the display fields', async () => {
  const api = makeApi([
    product('p-eggs', 'BOITE DE 06 OEUFS', { family: 'CREMERIE', basketQuantity: 1 }),
    product('p-oil', 'HUILE D OLIVE 500 ML', { family: 'EPICERIE', basketQuantity: 1 }),
  ]);
  const en = await api.getRecipe({ customerId: 1, recipeId: 'classic-omelette', language: 'en' });
  const fr = await api.getRecipe({ customerId: 1, recipeId: 'classic-omelette', language: 'fr' });

  assert.equal(fr.recommendation.recipeId, 'classic-omelette');
  assert.equal(fr.recommendation.name, 'Omelette nature');
  assert.equal(fr.recommendation.cuisine, 'française');
  assert.equal(fr.recommendation.category, 'petit-déjeuner');

  for (const key of STRUCTURAL_KEYS) {
    assert.deepEqual(fr.recommendation[key], en.recommendation[key], key);
  }
  assert.deepEqual(requirementSignature(fr.recommendation), requirementSignature(en.recommendation));

  const enEgg = en.recommendation.requirements.find((r) => r.key === 'egg');
  const frEgg = fr.recommendation.requirements.find((r) => r.key === 'egg');
  assert.equal(enEgg.status, frEgg.status);
  assert.equal(enEgg.availableAmount, frEgg.availableAmount);
  assert.equal(frEgg.label, 'Œufs');

  const frFat = fr.recommendation.requirements.find((r) => r.key === 'butter');
  assert.equal(frFat.labelKey, 'recipe.reqLabel.cookingFat'); // structural key untouched
  assert.equal(frFat.label, 'Beurre ou huile d’olive'); // fallback label localized
});

test('an unknown / missing language falls back to en (English display strings)', async () => {
  const api = makeApi([product('p-eggs', 'BOITE DE 06 OEUFS', { family: 'CREMERIE', basketQuantity: 1 })]);
  const en = await api.listRecipes({ customerId: 1, limit: 5, language: 'en' });
  for (const language of [undefined, '', 'de', 'EN-us', ['fr'], 'french']) {
    const got = await api.listRecipes({ customerId: 1, limit: 5, language });
    assert.deepEqual(
      got.recommendations.map((c) => c.name),
      en.recommendations.map((c) => c.name),
      `language ${JSON.stringify(language)} should behave as en`,
    );
  }
});

test('ingredient alternatives and structured quantities are byte-identical across locales', async () => {
  const api = makeApi([product('p-eggs', 'BOITE DE 06 OEUFS', { family: 'CREMERIE', basketQuantity: 1 })]);
  const en = await api.getRecipe({ customerId: 1, recipeId: 'classic-omelette', language: 'en' });
  const fr = await api.getRecipe({ customerId: 1, recipeId: 'classic-omelette', language: 'fr' });
  const enFat = en.recommendation.requirements.find((r) => r.key === 'butter');
  const frFat = fr.recommendation.requirements.find((r) => r.key === 'butter');
  assert.deepEqual(frFat.anyOfKeys, enFat.anyOfKeys);
  assert.deepEqual(frFat.anyOfKeys, ['butter', 'olive_oil']);
  const enEgg = en.recommendation.requirements.find((r) => r.key === 'egg');
  const frEgg = fr.recommendation.requirements.find((r) => r.key === 'egg');
  assert.equal(frEgg.requiredAmount, enEgg.requiredAmount);
  assert.equal(frEgg.requiredUnit, enEgg.requiredUnit);
});
