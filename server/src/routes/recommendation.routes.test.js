import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

import { AppError } from '../utils/AppError.js';
import { createRecommendationController } from '../controllers/recommendation.controller.js';
import { createRecommendationRoutes } from './recommendation.routes.js';
import { createRecommendationReadRateLimiter } from '../middleware/recommendationReadRateLimit.js';
import {
  parseRecommendationListLimit,
  parseRecipeIdParam,
  createRecommendationApiService,
} from '../services/recipe/recommendation.api.service.js';
import { createRecommendationEvidenceAdapter } from '../services/recipe/recommendationEvidence.adapter.js';
import { assertReadOnlySelect } from '../services/readOnlySql.js';
import { createIngredientMapper } from '../services/recipe/ingredientMapping.service.js';
import { loadRecipeDataset } from '../services/recipe/recipeDataset.js';

const PERSONALISATION_CLAIM =
  /you will like|your favourite|your favorite|personalised for you|personalized for you|we know what you like/i;

const RECIPES = [
  {
    id: 'r-omelette',
    name: 'Omelette',
    description: 'Synthetic omelette.',
    cuisine: 'french',
    category: 'breakfast',
    prepTimeMinutes: 10,
    difficulty: 'easy',
    fallbackRank: 1,
    ingredients: [
      { key: 'egg', label: 'Eggs', essential: true },
      { key: 'butter', label: 'Butter', essential: true },
    ],
  },
  {
    id: 'r-pasta',
    name: 'Simple Pasta',
    description: 'Synthetic pasta.',
    cuisine: 'italian',
    category: 'main',
    prepTimeMinutes: 20,
    difficulty: 'easy',
    fallbackRank: 2,
    ingredients: [
      { key: 'pasta', label: 'Pasta', essential: true },
      { key: 'tomato', label: 'Tomato', essential: true },
      { key: 'basil', label: 'Basil', essential: false },
    ],
  },
  {
    id: 'r-rice',
    name: 'Rice Bowl',
    description: 'Synthetic rice.',
    cuisine: 'asian',
    category: 'main',
    prepTimeMinutes: 15,
    difficulty: 'easy',
    fallbackRank: 3,
    ingredients: [
      { key: 'rice', label: 'Rice', essential: true },
      { key: 'egg', label: 'Egg', essential: true },
    ],
  },
];

const KEY_BY_NAME = { pasta: 'pasta', tomato: 'tomato', egg: 'egg', butter: 'butter', rice: 'rice', basil: 'basil' };

function stubMap(product) {
  const name = String(product?.name ?? '').trim().toLowerCase();
  const key = KEY_BY_NAME[name];
  if (key) {
    return {
      status: 'mapped',
      ingredientKey: key,
      confidence: 'exact',
      matchedRule: 'exact_phrase',
      matchedText: name,
      candidates: [],
      reason: `mapped ${key}`,
    };
  }
  return {
    status: 'unresolved',
    ingredientKey: null,
    confidence: 'none',
    matchedRule: 'none',
    matchedText: null,
    candidates: [],
    reason: 'no match',
  };
}

function createMockAdapter({
  basketProducts = [],
  historyProducts = [],
  catalogueProducts = [],
  loadImpl,
} = {}) {
  const calls = [];
  return {
    calls,
    adapter: {
      async loadEvidence(customerId) {
        calls.push({ customerId });
        if (loadImpl) return loadImpl(customerId);
        return { basketProducts, historyProducts, catalogueProducts };
      },
    },
  };
}

function createTestApp({ api, rateLimiter } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const controller = createRecommendationController(api);
  app.use(
    '/api/recommendations',
    createRecommendationRoutes({
      controller,
      rateLimiter: rateLimiter ?? ((req, res, next) => next()),
    }),
  );
  app.use((req, res) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
  });
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const statusCode = err.statusCode ?? 500;
    res.status(statusCode).json({
      error: err.message || 'Internal server error',
      ...(err instanceof AppError && err.code ? { code: err.code } : {}),
    });
  });
  return app;
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function customerHeaders(id = 7) {
  return { 'x-customer-id': String(id) };
}

async function requestJson(base, path, { headers = {}, method = 'GET' } = {}) {
  const res = await fetch(`${base}${path}`, { method, headers });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

function createApi(adapterOverrides = {}) {
  const mock = createMockAdapter(adapterOverrides);
  const api = createRecommendationApiService({
    evidenceAdapter: mock.adapter,
    recipes: RECIPES,
    mapProduct: stubMap,
  });
  return { api, mock };
}

function assertNoSensitiveLeak(body) {
  const blob = JSON.stringify(body);
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'stack'), false);
  assert.doesNotMatch(blob, /SELECT\s/i);
  assert.doesNotMatch(blob, /SB_CartItems/i);
  assert.doesNotMatch(blob, /TabStocksaico/i);
  assert.doesNotMatch(blob, /password/i);
  assert.doesNotMatch(blob, /probability/i);
}

test('recommendation API does not require a review-override loader', () => {
  const mock = createMockAdapter();
  assert.doesNotThrow(() =>
    createRecommendationApiService({
      evidenceAdapter: mock.adapter,
      recipes: RECIPES,
      mapProduct: stubMap,
    }),
  );
});

test('parseRecommendationListLimit defaults, caps and rejects invalid values', () => {
  assert.equal(parseRecommendationListLimit(undefined), 10);
  assert.equal(parseRecommendationListLimit(''), 10);
  assert.equal(parseRecommendationListLimit('4'), 4);
  assert.equal(parseRecommendationListLimit('20'), 20);
  assert.equal(parseRecommendationListLimit('99'), 20);
  for (const bad of ['0', '-1', '1.5', 'abc', '01', [], {}, ' ']) {
    assert.throws(() => parseRecommendationListLimit(bad), (err) => err instanceof AppError && err.statusCode === 400);
  }
});

test('parseRecipeIdParam accepts dataset ids and rejects malformed or overlong values', () => {
  assert.equal(parseRecipeIdParam('tomato-pantry-pasta'), 'tomato-pantry-pasta');
  assert.throws(() => parseRecipeIdParam('Bad_ID'), (err) => err.statusCode === 400);
  assert.throws(() => parseRecipeIdParam('a'.repeat(65)), (err) => err.statusCode === 400);
  assert.throws(() => parseRecipeIdParam('../secret'), (err) => err.statusCode === 400);
  assert.throws(() => parseRecipeIdParam(''), (err) => err.statusCode === 400);
});

test('GET /recipes returns basket-personalised recommendations', async () => {
  const { api, mock } = createApi({
    basketProducts: [{ id: 'p1', name: 'pasta' }, { id: 'p2', name: 'tomato' }],
    catalogueProducts: [{ id: 'c-basil', name: 'basil' }],
  });
  const app = createTestApp({ api });
  await withServer(app, async (base) => {
    const { status, body } = await requestJson(base, '/api/recommendations/recipes', {
      headers: customerHeaders(5),
    });
    assert.equal(status, 200);
    assert.equal(mock.calls[0].customerId, 5);
    assert.equal(body.data.evidenceSource, 'basket');
    assert.equal(body.data.personalised, true);
    assert.equal(body.data.availabilitySemantics, 'current_availability');
    assert.equal(body.meta.limit, 10);
    assert.equal(body.data.recommendations[0].recipeId, 'r-pasta');
    assert.equal(body.data.recommendations[0].availabilitySemantics, 'current_availability');
    assert.match(body.data.recommendations[0].explanationText, /basket/i);
    assert.doesNotMatch(JSON.stringify(body), PERSONALISATION_CLAIM);
    assertNoSensitiveLeak(body);
    for (const rec of body.data.recommendations) {
      assert.ok(['exact', 'high', 'medium', 'low', 'none', undefined].includes(rec.missingLinkedProducts[0]?.confidence ?? 'none') || rec.missingLinkedProducts.length === 0);
      assert.equal(rec.probability, undefined);
    }
  });
});

test('GET /recipes falls back to validated history when the basket has no mapped keys', async () => {
  const { api } = createApi({
    basketProducts: [{ id: 'u1', name: 'unknown item' }],
    historyProducts: [{ id: 'h1', name: 'egg' }, { id: 'h2', name: 'butter' }],
  });
  const app = createTestApp({ api });
  await withServer(app, async (base) => {
    const { status, body } = await requestJson(base, '/api/recommendations/recipes?limit=1', {
      headers: customerHeaders(),
    });
    assert.equal(status, 200);
    assert.equal(body.data.evidenceSource, 'history');
    assert.equal(body.data.personalised, true);
    assert.equal(body.data.availabilitySemantics, 'previous_purchase_association');
    assert.equal(body.data.recommendations[0].recipeId, 'r-omelette');
    assert.equal(body.data.recommendations[0].availabilitySemantics, 'previous_purchase_association');
    assert.match(body.data.recommendations[0].explanationText, /Inspired by your validated purchases/i);
    assert.doesNotMatch(body.data.recommendations[0].explanationText, /you can make this right now|currently covered|quantity sufficient/i);
    assert.doesNotMatch(JSON.stringify(body), PERSONALISATION_CLAIM);
  });
});

test('GET /recipes uses popularity fallback without claiming personalisation', async () => {
  const { api } = createApi({ basketProducts: [], historyProducts: [] });
  const app = createTestApp({ api });
  await withServer(app, async (base) => {
    const { status, body } = await requestJson(base, '/api/recommendations/recipes', {
      headers: customerHeaders(),
    });
    assert.equal(status, 200);
    assert.equal(body.data.evidenceSource, 'popularity');
    assert.equal(body.data.personalised, false);
    assert.equal(body.data.availabilitySemantics, 'popularity_fallback');
    assert.equal(body.data.recommendations[0].personalised, false);
    assert.equal(body.data.recommendations[0].availabilitySemantics, 'popularity_fallback');
    assert.match(body.data.recommendations[0].explanationText, /not personalised/i);
    assert.match(body.data.recommendations[0].dataLimitationText, /No basket or purchase-history availability assessment/i);
    const blob = JSON.stringify(body);
    assert.doesNotMatch(blob, PERSONALISATION_CLAIM);
    assert.equal(blob.includes('"personalised":true'), false);
  });
});

test('language: contract echoes en/fr in meta and falls back safely for anything else', async () => {
  // Inject a tiny overlay loader so this route test does not depend on the
  // shipped recipes.fr.json (whose ids differ from these synthetic recipes).
  const mock = createMockAdapter({ basketProducts: [{ id: 'p1', name: 'pasta' }, { id: 'p2', name: 'tomato' }] });
  const frOverlay = new Map([
    ['r-pasta', { name: 'Pâtes simples', description: 'desc fr', cuisine: 'italienne', category: 'plat', ingredients: {} }],
  ]);
  const api = createRecommendationApiService({
    evidenceAdapter: mock.adapter,
    recipes: RECIPES,
    mapProduct: stubMap,
    loadRecipeLocaleOverlay: (language) => (language === 'fr' ? frOverlay : null),
  });
  const app = createTestApp({ api });
  await withServer(app, async (base) => {
    const en = await requestJson(base, '/api/recommendations/recipes', { headers: customerHeaders() });
    assert.equal(en.status, 200);
    assert.equal(en.body.meta.language, 'en');
    const enPasta = en.body.data.recommendations.find((c) => c.recipeId === 'r-pasta');
    assert.equal(enPasta.name, 'Simple Pasta');

    const fr = await requestJson(base, '/api/recommendations/recipes?language=fr', { headers: customerHeaders() });
    assert.equal(fr.status, 200);
    assert.equal(fr.body.meta.language, 'fr');
    // Same recipes, same order, same structure. Only the display name changes.
    assert.deepEqual(
      fr.body.data.recommendations.map((c) => c.recipeId),
      en.body.data.recommendations.map((c) => c.recipeId),
    );
    const frPasta = fr.body.data.recommendations.find((c) => c.recipeId === 'r-pasta');
    assert.equal(frPasta.name, 'Pâtes simples');
    assert.equal(frPasta.rank, enPasta.rank);
    assert.equal(frPasta.fallbackRank, enPasta.fallbackRank);

    for (const bad of ['de', 'EN-us', '', 'fr-CA']) {
      const got = await requestJson(base, `/api/recommendations/recipes?language=${encodeURIComponent(bad)}`, {
        headers: customerHeaders(),
      });
      assert.equal(got.status, 200);
      assert.equal(got.body.meta.language, 'en', `language=${bad}`);
      assert.equal(got.body.data.recommendations.find((c) => c.recipeId === 'r-pasta').name, 'Simple Pasta');
    }

    const detailFr = await requestJson(base, '/api/recommendations/recipes/r-pasta?language=fr', {
      headers: customerHeaders(),
    });
    assert.equal(detailFr.status, 200);
    assert.equal(detailFr.body.meta.language, 'fr');
    assert.equal(detailFr.body.data.recommendation.name, 'Pâtes simples');
    assert.equal(detailFr.body.data.recommendation.recipeId, 'r-pasta');
  });
});

test('list limit: default, valid value, invalid value and hard cap', async () => {
  const { api, mock } = createApi({
    basketProducts: [{ id: 'p1', name: 'rice' }],
  });
  const app = createTestApp({ api });
  await withServer(app, async (base) => {
    const def = await requestJson(base, '/api/recommendations/recipes', { headers: customerHeaders() });
    assert.equal(def.status, 200);
    assert.equal(def.body.meta.limit, 10);
    assert.ok(def.body.data.recommendations.length <= 10);

    const valid = await requestJson(base, '/api/recommendations/recipes?limit=2', { headers: customerHeaders() });
    assert.equal(valid.status, 200);
    assert.equal(valid.body.meta.limit, 2);
    assert.equal(valid.body.data.recommendations.length, 2);

    const capped = await requestJson(base, '/api/recommendations/recipes?limit=99', { headers: customerHeaders() });
    assert.equal(capped.status, 200);
    assert.equal(capped.body.meta.limit, 20);

    const invalid = await requestJson(base, '/api/recommendations/recipes?limit=nope', { headers: customerHeaders() });
    assert.equal(invalid.status, 400);
    assert.match(invalid.body.error, /positive integer/i);
    assert.equal(Object.prototype.hasOwnProperty.call(invalid.body, 'stack'), false);
  });
  assert.ok(mock.calls.length >= 3);
});

test('invalid limit does not load evidence', async () => {
  const { api, mock } = createApi();
  const app = createTestApp({ api });
  await withServer(app, async (base) => {
    const { status } = await requestJson(base, '/api/recommendations/recipes?limit=0', {
      headers: customerHeaders(),
    });
    assert.equal(status, 400);
  });
  assert.equal(mock.calls.length, 0);
});

test('detail returns a valid recipe and 404s a missing one', async () => {
  const { api } = createApi({
    basketProducts: [{ id: 'p1', name: 'pasta' }],
    catalogueProducts: [{ id: 'c-tomato', name: 'tomato' }],
  });
  const app = createTestApp({ api });
  await withServer(app, async (base) => {
    const ok = await requestJson(base, '/api/recommendations/recipes/r-pasta', { headers: customerHeaders() });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.recommendation.recipeId, 'r-pasta');
    assert.equal(ok.body.data.personalised, true);
    assert.ok(ok.body.data.recommendation.explanationText);
    assert.ok(ok.body.data.recommendation.dataLimitationText);
    assert.ok(Array.isArray(ok.body.data.recommendation.missingIngredients));
    assertNoSensitiveLeak(ok.body);

    const missing = await requestJson(base, '/api/recommendations/recipes/no-such-recipe', {
      headers: customerHeaders(),
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, 'Recipe not found.');
    assert.equal(Object.prototype.hasOwnProperty.call(missing.body, 'stack'), false);
  });
});

test('malformed and overlong recipe ids are rejected before scoring', async () => {
  const { api, mock } = createApi();
  const app = createTestApp({ api });
  await withServer(app, async (base) => {
    const malformed = await requestJson(base, '/api/recommendations/recipes/Not_A_Valid_Id', {
      headers: customerHeaders(),
    });
    assert.equal(malformed.status, 400);

    const overlong = await requestJson(base, `/api/recommendations/recipes/${'a'.repeat(65)}`, {
      headers: customerHeaders(),
    });
    assert.equal(overlong.status, 400);
  });
  assert.equal(mock.calls.length, 0);
});

test('missing and malformed customer identity return 401 and do not load evidence', async () => {
  const { api, mock } = createApi();
  const app = createTestApp({ api });
  await withServer(app, async (base) => {
    const missing = await requestJson(base, '/api/recommendations/recipes');
    assert.equal(missing.status, 401);

    const malformed = await requestJson(base, '/api/recommendations/recipes', {
      headers: { 'x-customer-id': 'abc' },
    });
    assert.equal(malformed.status, 401);
    assert.match(malformed.body.error, /sign in/i);
  });
  assert.equal(mock.calls.length, 0);
});

test('query-string customerId cannot override the signed-in customer', async () => {
  const { api, mock } = createApi({ basketProducts: [{ id: 'p1', name: 'egg' }] });
  const app = createTestApp({ api });
  await withServer(app, async (base) => {
    const { status } = await requestJson(
      base,
      '/api/recommendations/recipes?customerId=99&limit=1',
      { headers: customerHeaders(7) },
    );
    assert.equal(status, 200);
  });
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].customerId, 7);
});

test('adapter/database failures return a safe 503', async () => {
  const { api } = createApi({
    loadImpl: async () => {
      throw new Error('SELECT * FROM dbo.SB_CartItems leaked-row');
    },
  });
  const app = createTestApp({ api });
  await withServer(app, async (base) => {
    const { status, body } = await requestJson(base, '/api/recommendations/recipes', {
      headers: customerHeaders(),
    });
    assert.equal(status, 503);
    assert.equal(body.error, 'Recommendation evidence is temporarily unavailable.');
    assert.doesNotMatch(body.error, /SELECT/);
    assert.doesNotMatch(body.error, /leaked-row/);
    assert.equal(Object.prototype.hasOwnProperty.call(body, 'stack'), false);
  });
});

test('a leftover override loader is ignored and recommendations still succeed', async () => {
  const mock = createMockAdapter({
    basketProducts: [{ id: 'reviewed-egg', name: 'egg' }],
  });
  const api = createRecommendationApiService({
    evidenceAdapter: mock.adapter,
    recipes: RECIPES,
    mapProduct: stubMap,
    loadOverridesForProductIds: async () => {
      throw new Error('SELECT ReviewNote FROM secret-review-row');
    },
  });
  const app = createTestApp({ api });

  await withServer(app, async (base) => {
    const { status, body } = await requestJson(base, '/api/recommendations/recipes', {
      headers: customerHeaders(),
    });
    assert.equal(status, 200);
    assert.equal(Object.prototype.hasOwnProperty.call(body, 'data'), true);
    assert.doesNotMatch(JSON.stringify(body), /SELECT|secret-review-row/i);
  });
});

test('unknown recipe ids 404 without loading evidence', async () => {
  const { api, mock } = createApi();
  const app = createTestApp({ api });
  await withServer(app, async (base) => {
    const { status } = await requestJson(base, '/api/recommendations/recipes/still-missing', {
      headers: customerHeaders(),
    });
    assert.equal(status, 404);
  });
  assert.equal(mock.calls.length, 0);
});

test('detail lookup works when the recipe is outside the normal list limit', async () => {
  const { api } = createApi({
    basketProducts: [{ id: 'p1', name: 'pasta' }, { id: 'p2', name: 'tomato' }],
  });
  const app = createTestApp({ api });
  await withServer(app, async (base) => {
    const list = await requestJson(base, '/api/recommendations/recipes?limit=1', {
      headers: customerHeaders(),
    });
    assert.equal(list.body.data.recommendations.length, 1);
    const listedId = list.body.data.recommendations[0].recipeId;
    assert.equal(listedId, 'r-pasta');

    const detail = await requestJson(base, '/api/recommendations/recipes/r-omelette', {
      headers: customerHeaders(),
    });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.recommendation.recipeId, 'r-omelette');
    assert.ok(detail.body.data.recommendation.rank > 1);
    assert.equal(detail.body.data.evidenceSource, list.body.data.evidenceSource);
  });
});

test('list and detail for the same recipe are consistent', async () => {
  const { api } = createApi({
    basketProducts: [{ id: 'p1', name: 'rice' }, { id: 'p2', name: 'egg' }],
    catalogueProducts: [{ id: 'c-butter', name: 'butter' }],
  });
  const app = createTestApp({ api });
  await withServer(app, async (base) => {
    const list = await requestJson(base, '/api/recommendations/recipes?limit=3', {
      headers: customerHeaders(),
    });
    const listed = list.body.data.recommendations.find((item) => item.recipeId === 'r-rice');
    const detail = await requestJson(base, '/api/recommendations/recipes/r-rice', {
      headers: customerHeaders(),
    });
    const one = detail.body.data.recommendation;
    assert.equal(one.recipeId, listed.recipeId);
    assert.equal(one.score, listed.score);
    assert.equal(one.coveragePercent, listed.coveragePercent);
    assert.equal(one.explanationText, listed.explanationText);
    assert.equal(one.evidenceSource, listed.evidenceSource);
    assert.equal(one.personalised, listed.personalised);
    assert.equal(detail.body.data.personalised, list.body.data.personalised);
  });
});

test('rate limiter rejects excess recommendation reads', async () => {
  const { api } = createApi();
  const app = createTestApp({
    api,
    rateLimiter: createRecommendationReadRateLimiter({ max: 2, windowMs: 60_000 }),
  });
  await withServer(app, async (base) => {
    const first = await requestJson(base, '/api/recommendations/recipes', { headers: customerHeaders() });
    const second = await requestJson(base, '/api/recommendations/recipes', { headers: customerHeaders() });
    const third = await requestJson(base, '/api/recommendations/recipes', { headers: customerHeaders() });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    assert.match(third.body.error, /too many recommendation requests/i);
    assert.equal(Object.prototype.hasOwnProperty.call(third.body, 'stack'), false);
  });
});

test('adapter SQL path issues no writes and binds the request customer', async () => {
  const sqlCalls = [];
  const adapter = createRecommendationEvidenceAdapter({
    executeReadOnlyQuery: async (text, inputs) => {
      sqlCalls.push({ text, inputs });
      return [];
    },
    getProducts: async () => ({ products: [] }),
  });
  const api = createRecommendationApiService({
    evidenceAdapter: adapter,
    recipes: RECIPES,
    mapProduct: stubMap,
  });
  const app = createTestApp({ api });
  await withServer(app, async (base) => {
    const { status } = await requestJson(base, '/api/recommendations/recipes?limit=1', {
      headers: customerHeaders(11),
    });
    assert.equal(status, 200);
  });
  assert.ok(sqlCalls.length >= 1);
  for (const call of sqlCalls) {
    assert.doesNotThrow(() => assertReadOnlySelect(call.text));
    for (const hint of ['INSERT', 'UPDATE', 'DELETE', 'MERGE']) {
      assert.doesNotMatch(call.text, new RegExp(`\\b${hint}\\b`, 'i'));
    }
    assert.doesNotMatch(call.text, /APP_/);
    const customer = (call.inputs ?? []).find((item) => item.name === 'customerId');
    if (customer) assert.equal(customer.value, 11);
  }
});

test('production-style shipped mapper still personalises from a synthetic tomato product', async () => {
  const mock = createMockAdapter({
    basketProducts: [{ id: 'syn-1', name: 'tomato' }],
    catalogueProducts: [],
  });
  const api = createRecommendationApiService({
    evidenceAdapter: mock.adapter,
    recipes: loadRecipeDataset(),
    mapProduct: createIngredientMapper(),
  });
  const result = await api.listRecipes({ customerId: 3, limit: 5 });
  assert.equal(result.evidenceSource, 'basket');
  assert.equal(result.personalised, true);
  assert.ok(result.evidence.mappedIngredientKeys.includes('tomato'));
  assert.doesNotMatch(JSON.stringify(result), PERSONALISATION_CLAIM);
});
