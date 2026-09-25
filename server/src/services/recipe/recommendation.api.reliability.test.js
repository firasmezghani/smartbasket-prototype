import test from 'node:test';
import assert from 'node:assert/strict';

import { createRecommendationApiService } from './recommendation.api.service.js';
import { loadRecipeDataset } from './recipeDataset.js';
import { createIngredientMapper } from './ingredientMapping.service.js';
import { interpretProductName } from '../productInterpretation.service.js';

// End-to-end tests with the real recipes and mapper (only the database part
// is mocked).

const mapProduct = createIngredientMapper();
const recipes = loadRecipeDataset();

function product(id, name, extra = {}) {
  return {
    id,
    name,
    family: extra.family ?? null,
    description: extra.description ?? '',
    brand: extra.brand ?? '',
    ...(extra.basketQuantity !== undefined ? { basketQuantity: extra.basketQuantity } : {}),
  };
}

function mockAdapter({ basketProducts = [], historyProducts = [], catalogueProducts = [] } = {}) {
  return { async loadEvidence() { return { basketProducts, historyProducts, catalogueProducts }; } };
}

function makeApi({ basketProducts, historyProducts = [], catalogueProducts = [] } = {}) {
  return createRecommendationApiService({
    evidenceAdapter: mockAdapter({ basketProducts, historyProducts, catalogueProducts }),
    recipes,
    mapProduct,
    interpretProduct: (p) => interpretProductName(p, { mapProduct }),
  });
}

async function omeletteRequirements(api) {
  const result = await api.listRecipes({ customerId: 1, limit: 20 });
  const card = result.recommendations.find((r) => r.recipeId === 'classic-omelette');
  return { result, card, egg: card.requirements.find((r) => r.key === 'egg'), fat: card.requirements.find((r) => r.key === 'butter') };
}

test('1. a real six-egg box satisfies the three-egg omelette requirement', async () => {
  const api = makeApi({
    basketProducts: [
      product('p-eggs', 'BOITE DE 06 OEUFS', { family: 'CREMERIE', basketQuantity: 1 }),
      product('p-oil', 'HUILE D OLIVE 500 ML', { family: 'EPICERIE', basketQuantity: 1 }),
    ],
  });
  const { egg, fat } = await omeletteRequirements(api);
  assert.equal(egg.status, 'sufficient');
  assert.equal(egg.availableAmount, 6);
  assert.equal(fat.status, 'matched');
});

test('2. a fifteen-egg box produces 15 available eggs', async () => {
  const api = makeApi({
    basketProducts: [product('p-eggs15', 'BOITE DE 15 OEUFS', { family: 'CREMERIE', basketQuantity: 1 })],
  });
  const { egg } = await omeletteRequirements(api);
  assert.equal(egg.availableAmount, 15);
  assert.equal(egg.status, 'sufficient');
});

test('3. EGG SLICER does not contribute egg evidence', async () => {
  const api = makeApi({ basketProducts: [product('p-slicer', 'EGG SLICER', { family: 'USTENSILES' })] });
  const { result, egg } = await omeletteRequirements(api);
  assert.equal(result.evidenceSource, 'popularity'); // nothing mapped -> cold start
  assert.equal(egg.status, 'not_evaluated');
});

test('4. chocolate/confectionery eggs do not contribute', async () => {
  const api = makeApi({
    basketProducts: [product('p-choc', 'OEUFS CHOCOLAT 100G', { family: 'CONFISERIE', basketQuantity: 1 })],
  });
  const { result, egg } = await omeletteRequirements(api);
  assert.equal(result.evidenceSource, 'popularity');
  assert.equal(egg.status, 'not_evaluated');
});

test('5. pet food containing egg wording does not contribute', async () => {
  const api = makeApi({
    basketProducts: [product('p-pet', 'CROQUETTES CHAT POULET OEUF', { family: 'ANIMALERIE', basketQuantity: 1 })],
  });
  const { result, egg } = await omeletteRequirements(api);
  assert.equal(result.evidenceSource, 'popularity');
  assert.equal(egg.status, 'not_evaluated');
});

test('6. a low-confidence automatic egg match (family evidence only, no name mention) does not contribute', async () => {
  const api = makeApi({
    basketProducts: [product('p-lowconf', 'PRODUIT DIVERS 250G', { family: 'hen eggs department', basketQuantity: 1 })],
  });
  const { egg } = await omeletteRequirements(api);
  // Whether or not the mapper resolves a type from family text alone, it must
  // never reach 'sufficient'/'matched' from a low-confidence automatic read.
  assert.notEqual(egg.status, 'sufficient');
  assert.notEqual(egg.status, 'matched');
});

test('7. a leftover override-shaped object cannot make a low-confidence product contribute', async () => {
  const api = makeApi({
    basketProducts: [product('p-lowconf', 'PRODUIT DIVERS 250G', { family: 'hen eggs department', basketQuantity: 1 })],
  });
  const { egg } = await omeletteRequirements(api);
  assert.notEqual(egg.status, 'sufficient');
  assert.notEqual(egg.status, 'matched');
});

test('8. an unrecognised product name does not contribute egg evidence', async () => {
  const api = makeApi({
    basketProducts: [product('p-mystery', 'PROMO SPECIALE REF4080', { basketQuantity: 1 })],
  });
  const { result, egg } = await omeletteRequirements(api);
  assert.equal(result.evidenceSource, 'popularity');
  assert.equal(egg.status, 'not_evaluated');
});

test('9. a real egg-box still contributes after the review feature is removed', async () => {
  const api = makeApi({
    basketProducts: [product('p-eggs', 'BOITE DE 06 OEUFS', { family: 'CREMERIE', basketQuantity: 1 })],
  });
  const { result, egg } = await omeletteRequirements(api);
  assert.equal(result.evidenceSource, 'basket');
  assert.equal(egg.status, 'sufficient');
  assert.equal(egg.availableAmount, 6);
});

test('11. butter/olive-oil alternatives remain correct', async () => {
  const api = makeApi({
    basketProducts: [
      product('p-eggs', 'BOITE DE 06 OEUFS', { family: 'CREMERIE', basketQuantity: 1 }),
      product('p-oil', 'HUILE D OLIVE EXTRA VIERGE 500 ML', { family: 'EPICERIE', basketQuantity: 1 }),
    ],
  });
  const { fat } = await omeletteRequirements(api);
  assert.equal(fat.status, 'matched');
  assert.equal(fat.matchedKey, 'olive_oil');
});

test('12. popularity not_evaluated behaviour remains unchanged (no evidence at all)', async () => {
  const api = makeApi({ basketProducts: [], historyProducts: [] });
  const result = await api.listRecipes({ customerId: 1, limit: 20 });
  assert.equal(result.evidenceSource, 'popularity');
  const card = result.recommendations.find((r) => r.recipeId === 'classic-omelette');
  assert.ok(card.requirements.length > 0);
  assert.ok(card.requirements.every((r) => r.status === 'not_evaluated'));
  assert.equal(card.matchedEssentialCount, 0);
  assert.deepEqual(card.missingEssential, []);
});
