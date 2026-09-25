import test from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../../utils/AppError.js';
import { assertReadOnlySelect } from '../readOnlySql.js';
import {
  CURRENT_BASKET_SQL,
  EXCLUDED_HISTORY_STATUSES,
  RECOMMENDATION_CATALOGUE_DEFAULT_LIMIT,
  RECOMMENDATION_CATALOGUE_MAX_LIMIT,
  RECOMMENDATION_HISTORY_SESSION_LIMIT,
  VALIDATED_HISTORY_SQL,
  VALIDATED_HISTORY_STATUS,
  assertOwnedCustomerId,
  createRecommendationEvidenceAdapter,
  isValidatedHistoryStatus,
  mapEvidenceProduct,
} from './recommendationEvidence.adapter.js';

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function compactSql(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function inputValue(inputs, name) {
  return (inputs ?? []).find((item) => item.name === name)?.value;
}

function createAdapter({ rows = [], products = [], queryImpl, getProductsImpl } = {}) {
  const calls = [];
  const executeReadOnlyQuery =
    queryImpl ??
    (async (text, inputs) => {
      calls.push({ text, inputs });
      return typeof rows === 'function' ? rows(text, inputs) : rows;
    });
  const getProductsCalls = [];
  const getProducts = async (filters) => {
    getProductsCalls.push(filters);
    if (getProductsImpl) return getProductsImpl(filters);
    return { products };
  };
  return {
    adapter: createRecommendationEvidenceAdapter({ executeReadOnlyQuery, getProducts }),
    calls,
    getProductsCalls,
  };
}

test('assertOwnedCustomerId accepts positive integers and digit strings', () => {
  assert.equal(assertOwnedCustomerId(7), 7);
  assert.equal(assertOwnedCustomerId('12'), 12);
  assert.equal(assertOwnedCustomerId(' 3 '), 3);
});

test('assertOwnedCustomerId rejects malformed customer identifiers', () => {
  const malformed = [null, undefined, '', '  ', 'abc', '1.5', '0', '-1', 0, -4, 1.5, NaN, Infinity, {}, [], false, true, '01'];
  for (const value of malformed) {
    assert.throws(() => assertOwnedCustomerId(value), (err) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 401);
      return true;
    }, `expected rejection for ${String(value)}`);
  }
});

test('factory requires injected read dependencies', () => {
  assert.throws(() => createRecommendationEvidenceAdapter(), TypeError);
  assert.throws(() => createRecommendationEvidenceAdapter({}), TypeError);
  assert.throws(
    () => createRecommendationEvidenceAdapter({ executeReadOnlyQuery: async () => [] }),
    TypeError,
  );
});

test('SQL statements are parameterised read-only selects', () => {
  assert.doesNotThrow(() => assertReadOnlySelect(CURRENT_BASKET_SQL));
  assert.doesNotThrow(() => assertReadOnlySelect(VALIDATED_HISTORY_SQL));
  const basket = compactSql(CURRENT_BASKET_SQL);
  const history = compactSql(VALIDATED_HISTORY_SQL);
  assert.match(basket, /WHERE c\.CustomerId = @customerId/i);
  assert.match(history, /sess\.CustomerId = @customerId/i);
  assert.match(history, /innerSess\.CustomerId = @customerId/i);
  assert.match(history, /@sessionLimit/);
  assert.doesNotMatch(basket, /@sessionId/);
  assert.doesNotMatch(CURRENT_BASKET_SQL, /WEB_Orders/i);
  assert.doesNotMatch(VALIDATED_HISTORY_SQL, /WEB_Orders/i);
  assert.doesNotMatch(CURRENT_BASKET_SQL, /APP_/);
  assert.doesNotMatch(VALIDATED_HISTORY_SQL, /APP_/);
  for (const hint of ['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'DROP', 'CREATE', 'TRUNCATE']) {
    assert.doesNotMatch(CURRENT_BASKET_SQL, new RegExp(`\\b${hint}\\b`, 'i'));
    assert.doesNotMatch(VALIDATED_HISTORY_SQL, new RegExp(`\\b${hint}\\b`, 'i'));
  }
});

test('current basket is the owned SB_CartItems row set, not a QR session', async () => {
  const { adapter, calls } = createAdapter({
    rows: [
      { id: 'prod-1', name: 'Pasta', family: 'Dry goods', description: 'Durum wheat', brand: 'Acme' },
    ],
  });
  const products = await adapter.loadCurrentBasketProducts(5);
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /SB_CartItems/i);
  assert.doesNotMatch(calls[0].text, /SB_SmartBasketSessions/i);
  assert.equal(inputValue(calls[0].inputs, 'customerId'), 5);
  assert.deepEqual(products, [
    { id: 'prod-1', name: 'Pasta', family: 'Dry goods', description: 'Durum wheat', brand: 'Acme', basketQuantity: null },
  ]);
});

test('current basket query never binds a guest session id', async () => {
  const { adapter, calls } = createAdapter({ rows: [] });
  await adapter.loadCurrentBasketProducts(9);
  const names = (calls[0].inputs ?? []).map((item) => item.name);
  assert.deepEqual(names, ['customerId']);
  assert.doesNotMatch(compactSql(calls[0].text), /SessionId/i);
});

test('strict customer ownership is bound on every customer-specific query', async () => {
  const { adapter, calls } = createAdapter({ rows: [] });
  await adapter.loadCurrentBasketProducts(42);
  await adapter.loadValidatedHistoryProducts(42);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(inputValue(call.inputs, 'customerId'), 42);
    assert.match(call.text, /CustomerId = @customerId/);
  }
});

test('history SQL requires validated status and excludes every other session status', () => {
  const history = compactSql(VALIDATED_HISTORY_SQL);
  assert.match(history, /sess\.Status = N'validated'/);
  assert.match(history, /innerSess\.Status = N'validated'/);
  assert.equal(VALIDATED_HISTORY_STATUS, 'validated');
  assert.equal(isValidatedHistoryStatus('validated'), true);
  assert.equal(isValidatedHistoryStatus('VALIDATED'), true);
  for (const status of EXCLUDED_HISTORY_STATUSES) {
    assert.equal(isValidatedHistoryStatus(status), false, status);
    assert.doesNotMatch(history, new RegExp(`N'${status}'`));
  }
  assert.deepEqual([...EXCLUDED_HISTORY_STATUSES], ['active', 'rejected', 'cancelled', 'expired']);
});

test('validated history reads smart-basket items and never the old web orders table', async () => {
  const { adapter, calls } = createAdapter({
    rows: [{ id: 'hist-1', name: 'Eggs', family: '', description: '', brand: '' }],
  });
  const products = await adapter.loadValidatedHistoryProducts(3);
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /SB_SmartBasketSessions/i);
  assert.match(calls[0].text, /SB_SmartBasketItems/i);
  assert.doesNotMatch(calls[0].text, /WEB_Orders/i);
  assert.doesNotMatch(calls[0].text, /WEB_OrderItems/i);
  assert.equal(inputValue(calls[0].inputs, 'customerId'), 3);
  assert.equal(inputValue(calls[0].inputs, 'sessionLimit'), RECOMMENDATION_HISTORY_SESSION_LIMIT);
  assert.deepEqual(products[0].id, 'hist-1');
});

test('duplicate history items are returned as-is for the service to collapse', async () => {
  const { adapter } = createAdapter({
    rows: [
      { id: 'same', name: 'Milk' },
      { id: 'same', name: 'Milk' },
    ],
  });
  const products = await adapter.loadValidatedHistoryProducts(1);
  assert.equal(products.length, 2);
  assert.equal(products[0].id, 'same');
  assert.equal(products[1].id, 'same');
});

test('empty database results become empty product lists', async () => {
  const { adapter } = createAdapter({ rows: [], products: [] });
  assert.deepEqual(await adapter.loadCurrentBasketProducts(1), []);
  assert.deepEqual(await adapter.loadValidatedHistoryProducts(1), []);
  assert.deepEqual(await adapter.loadCatalogueProductsForLinking(), []);
});

test('null query results are treated as empty, not thrown', async () => {
  const { adapter } = createAdapter({ queryImpl: async () => null });
  assert.deepEqual(await adapter.loadCurrentBasketProducts(2), []);
});

test('malformed customer identifiers never reach the database', async () => {
  let queried = false;
  const { adapter } = createAdapter({
    queryImpl: async () => {
      queried = true;
      return [];
    },
  });
  await assert.rejects(() => adapter.loadCurrentBasketProducts('nope'), (err) => {
    assert.ok(err instanceof AppError);
    assert.equal(err.statusCode, 401);
    return true;
  });
  await assert.rejects(() => adapter.loadValidatedHistoryProducts(0));
  await assert.rejects(() => adapter.loadEvidence(null));
  assert.equal(queried, false);
});

test('catalogue retrieval is bounded and uses the injected catalogue reader', async () => {
  const { adapter, getProductsCalls } = createAdapter({
    products: [
      { id: 'c1', name: 'Apple', familyName: 'Fruit', description: 'Red', brand: 'Farm' },
      { id: 'c2', name: 'Bread', familyName: 'Bakery', description: '', brand: '' },
    ],
  });
  const products = await adapter.loadCatalogueProductsForLinking(500);
  assert.equal(getProductsCalls.length, 1);
  assert.equal(getProductsCalls[0].limit, RECOMMENDATION_CATALOGUE_MAX_LIMIT);
  assert.equal(getProductsCalls[0].offset, 0);
  assert.equal(getProductsCalls[0].sort, 'name_asc');
  // Missing-ingredient links only use curated, recipe-eligible products.
  assert.equal(getProductsCalls[0].recipeEligibleOnly, true);
  assert.equal(products.length, 2);
  assert.deepEqual(products[0], {
    id: 'c1',
    name: 'Apple',
    family: 'Fruit',
    description: 'Red',
    brand: 'Farm',
    basketQuantity: null,
  });
  assert.equal('sitePrice' in products[0], false);
  assert.equal('familyName' in products[0], false);
});

test('catalogue default limit is used for invalid requests and results are sliced', async () => {
  const oversized = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `Item ${i}` }));
  const { adapter, getProductsCalls } = createAdapter({
    getProductsImpl: async (filters) => ({ products: oversized.slice(0, filters.limit) }),
  });
  const products = await adapter.loadCatalogueProductsForLinking('nope');
  assert.equal(getProductsCalls.length, 1);
  assert.equal(getProductsCalls[0].limit, RECOMMENDATION_CATALOGUE_DEFAULT_LIMIT);
  assert.ok(products.length <= RECOMMENDATION_CATALOGUE_DEFAULT_LIMIT);
});

test('catalogue adapter defensively slices if the reader ignores the cap', async () => {
  const extra = Array.from({ length: RECOMMENDATION_CATALOGUE_MAX_LIMIT + 5 }, (_, i) => ({
    id: `x${i}`,
    name: `N${i}`,
  }));
  const { adapter } = createAdapter({
    getProductsImpl: async () => ({ products: extra }),
  });
  const products = await adapter.loadCatalogueProductsForLinking(3);
  assert.equal(products.length, 3);
});

test('database failures propagate as a generic 503 without leaking SQL or rows', async () => {
  const { adapter } = createAdapter({
    queryImpl: async () => {
      throw new Error("SELECT * FROM dbo.SB_CartItems WHERE CustomerId = 99 leaked-row");
    },
  });
  await assert.rejects(() => adapter.loadCurrentBasketProducts(4), (err) => {
    assert.ok(err instanceof AppError);
    assert.equal(err.statusCode, 503);
    assert.equal(err.message, 'Recommendation evidence is temporarily unavailable.');
    assert.doesNotMatch(err.message, /SELECT/i);
    assert.doesNotMatch(err.message, /leaked-row/);
    assert.doesNotMatch(err.message, /SB_CartItems/);
    return true;
  });
});

test('catalogue reader failures also propagate as a generic 503', async () => {
  const { adapter } = createAdapter({
    getProductsImpl: async () => {
      throw new Error('TabStocksaico dump');
    },
  });
  await assert.rejects(() => adapter.loadCatalogueProductsForLinking(10), (err) => {
    assert.ok(err instanceof AppError);
    assert.equal(err.statusCode, 503);
    assert.doesNotMatch(err.message, /TabStocksaico/);
    return true;
  });
});

test('existing AppError from the query is not rewritten', async () => {
  const { adapter } = createAdapter({
    queryImpl: async () => {
      throw new AppError('Please sign in to continue.', 401);
    },
  });
  await assert.rejects(() => adapter.loadValidatedHistoryProducts(8), (err) => {
    assert.equal(err.statusCode, 401);
    return true;
  });
});

test('no write operation is issued on basket, history or combined load', async () => {
  const { adapter, calls, getProductsCalls } = createAdapter({ rows: [], products: [] });
  await adapter.loadEvidence(11, { catalogueLimit: 10 });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.doesNotThrow(() => assertReadOnlySelect(call.text));
    for (const hint of ['INSERT', 'UPDATE', 'DELETE', 'MERGE']) {
      assert.doesNotMatch(call.text, new RegExp(`\\b${hint}\\b`, 'i'));
    }
  }
  assert.equal(getProductsCalls.length, 1);
});

test('mapEvidenceProduct returns only mapper fields and does not mutate the source', () => {
  const row = deepFreeze({
    id: 'guid-1',
    name: 'Rice',
    family: 'Dry',
    description: 'Long grain',
    brand: 'Acme',
    PrixSite: 1.5,
    CustomerEmail: 'secret@example.com',
  });
  const mapped = mapEvidenceProduct(row);
  assert.deepEqual(mapped, {
    id: 'guid-1',
    name: 'Rice',
    family: 'Dry',
    description: 'Long grain',
    brand: 'Acme',
    basketQuantity: null,
  });
  assert.equal(row.PrixSite, 1.5);
  assert.equal(mapEvidenceProduct(null), null);
  assert.equal(mapEvidenceProduct({ name: 'no id' }), null);
});

test('adapter product mapping is deterministic and does not mutate query rows', async () => {
  const rows = deepFreeze([
    { id: 'a', name: 'Egg', family: 'Dairy', description: '', brand: 'B' },
    { ProductId: 'b', LibArt: 'Flour', LibFam: 'Dry', description: 'White', Marque: 'C' },
  ]);
  const { adapter } = createAdapter({ rows });
  const first = await adapter.loadCurrentBasketProducts(6);
  const second = await adapter.loadCurrentBasketProducts(6);
  assert.deepEqual(first, second);
  assert.equal(first[1].id, 'b');
  assert.equal(first[1].name, 'Flour');
  assert.equal(first[1].family, 'Dry');
  assert.equal(first[1].brand, 'C');
});

// --- Current-basket quantity (`SELECT` only, one customer) ---

import { parseEvidenceBasketQuantity } from './recommendationEvidence.adapter.js';

test('CURRENT_BASKET_SQL selects the cart line quantity, stays SELECT-only and customer-scoped', () => {
  assert.doesNotThrow(() => assertReadOnlySelect(CURRENT_BASKET_SQL));
  assert.match(CURRENT_BASKET_SQL, /c\.Quantity\s+AS\s+basketQuantity/i);
  assert.match(CURRENT_BASKET_SQL, /WHERE\s+c\.CustomerId\s*=\s*@customerId/i);
  for (const hint of ['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'DROP', 'ALTER', 'TRUNCATE', 'EXEC']) {
    assert.doesNotMatch(CURRENT_BASKET_SQL, new RegExp(`\\b${hint}\\b`, 'i'));
  }
  // no extra catalogue columns beyond the mapper fields + quantity
  assert.doesNotMatch(CURRENT_BASKET_SQL, /PrixSite|imgArt|UrlImage|CodBar/i);
});

test('adapter maps the basket-line quantity through as number|null (never coerced to 1)', async () => {
  const { adapter } = createAdapter({
    rows: [
      { id: 'p1', name: 'Eggs', family: 'Dairy', description: '', brand: '', basketQuantity: 2 },
      { id: 'p2', name: 'Rice', family: 'Dry', description: '', brand: '', basketQuantity: 0 },
      { id: 'p3', name: 'Oil', family: 'Oils', description: '', brand: '', basketQuantity: '4' },
      { id: 'p4', name: 'Milk', family: 'Dairy', description: '', brand: '' }, // no quantity
      { id: 'p5', name: 'Flour', family: 'Dry', description: '', brand: '', basketQuantity: 'bad' },
    ],
  });
  const products = await adapter.loadCurrentBasketProducts(7);
  assert.deepEqual(products.map((p) => p.basketQuantity), [2, null, 4, null, null]);
});

test('parseEvidenceBasketQuantity: trusted positive integer OR null, never 1', () => {
  assert.equal(parseEvidenceBasketQuantity(3), 3);
  assert.equal(parseEvidenceBasketQuantity('5'), 5);
  assert.equal(parseEvidenceBasketQuantity('06'), 6);
  for (const bad of [0, -2, 1.5, NaN, Infinity, null, undefined, '', '  ', 'x', '3.5', true, {}, [], 1e12, 100_001]) {
    assert.equal(parseEvidenceBasketQuantity(bad), null, String(bad));
  }
});
