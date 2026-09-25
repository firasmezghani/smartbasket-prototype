import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECOMMENDATION_CONFIG,
  normaliseAvailableKeys,
  scoreRecipe,
  compareScored,
  rankRecipes,
  popularityFallbackOrder,
} from './score.js';

function recipe(overrides = {}) {
  return {
    id: 'r1',
    name: 'Recipe One',
    fallbackRank: 10,
    ingredients: [
      { key: 'pasta', label: 'Pasta', essential: true },
      { key: 'tomato', label: 'Tomato', essential: true },
      { key: 'garlic', label: 'Garlic', essential: true },
      { key: 'basil', label: 'Basil', essential: false },
      { key: 'parmesan', label: 'Parmesan', essential: false },
    ],
    ...overrides,
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test('RECOMMENDATION_CONFIG is frozen and weights essential coverage above optional', () => {
  assert.equal(Object.isFrozen(RECOMMENDATION_CONFIG), true);
  assert.ok(RECOMMENDATION_CONFIG.essentialCoverageWeight > RECOMMENDATION_CONFIG.optionalCoverageWeight);
  // The optional weight is a refinement; the comparator enforces priority.
  assert.ok(RECOMMENDATION_CONFIG.optionalCoverageWeight < 1 / 5);
});

test('complete essential-ingredient match => coverage 1', () => {
  const s = scoreRecipe(recipe(), ['pasta', 'tomato', 'garlic']);
  assert.equal(s.essentialCoverage, 1);
  assert.equal(s.matchedEssentialCount, 3);
  assert.equal(s.missingEssentialCount, 0);
  assert.deepEqual(s.missingEssential, []);
  assert.equal(s.score, 1); // 1*1 + 0.1*0
});

test('partial essential-ingredient match => fractional coverage', () => {
  const s = scoreRecipe(recipe(), ['pasta', 'garlic']);
  assert.equal(s.essentialCoverage, 2 / 3);
  assert.deepEqual(s.matchedEssential, ['garlic', 'pasta']);
  assert.deepEqual(s.missingEssential, ['tomato']);
  assert.equal(s.score, RECOMMENDATION_CONFIG.essentialCoverageWeight * (2 / 3));
});

test('no ingredient match => zero coverage and everything missing', () => {
  const s = scoreRecipe(recipe(), ['flour', 'egg']);
  assert.equal(s.score, 0);
  assert.equal(s.essentialCoverage, 0);
  assert.equal(s.optionalCoverage, 0);
  assert.deepEqual(s.matchedEssential, []);
  assert.deepEqual(s.missingEssential, ['garlic', 'pasta', 'tomato']);
  assert.deepEqual(s.missingOptional, ['basil', 'parmesan']);
});

test('optional ingredients contribute, but never outweigh a missing essential', () => {
  const full = scoreRecipe(recipe(), ['pasta', 'tomato', 'garlic']); // all essential, no optional
  const optionalHeavy = scoreRecipe(recipe(), ['pasta', 'tomato', 'basil', 'parmesan']); // 1 essential missing, all optional
  assert.equal(optionalHeavy.optionalCoverage, 1);
  assert.equal(optionalHeavy.missingEssentialCount, 1);
  assert.ok(full.score > optionalHeavy.score, `${full.score} should beat ${optionalHeavy.score}`);
});

test('missing essential ingredients are reported explicitly', () => {
  const s = scoreRecipe(recipe(), ['pasta']);
  assert.deepEqual(s.missingEssential, ['garlic', 'tomato']);
  assert.equal(s.missingEssentialCount, 2);
  assert.equal(s.totalEssential, 3);
  assert.equal(s.totalOptional, 2);
});

test('unknown available ingredients are ignored', () => {
  const withNoise = scoreRecipe(recipe(), ['pasta', 'tomato', 'garlic', 'unicorn', 'moon-cheese']);
  const clean = scoreRecipe(recipe(), ['pasta', 'tomato', 'garlic']);
  assert.deepEqual(withNoise, clean);
});

test('empty available-ingredient set is safe (no division by zero)', () => {
  const s = scoreRecipe(recipe(), []);
  assert.equal(s.score, 0);
  assert.equal(s.essentialCoverage, 0);
  assert.equal(s.optionalCoverage, 0);
});

test('a recipe with only optional ingredients does not divide by zero', () => {
  const optOnly = {
    id: 'opt-only',
    name: 'Optional only',
    fallbackRank: 1,
    ingredients: [
      { key: 'salt', label: 'Salt', essential: false },
      { key: 'pepper', label: 'Pepper', essential: false },
    ],
  };
  const s = scoreRecipe(optOnly, ['salt']);
  assert.equal(s.totalEssential, 0);
  assert.equal(s.essentialCoverage, 0);
  assert.equal(s.optionalCoverage, 0.5);
  assert.equal(s.score, RECOMMENDATION_CONFIG.optionalCoverageWeight * 0.5);
});

test('duplicate / mixed-case available keys are normalised', () => {
  const a = scoreRecipe(recipe(), ['pasta', 'pasta', 'PASTA', '  Pasta  ']);
  const b = scoreRecipe(recipe(), ['pasta']);
  assert.deepEqual(a, b);

  const set = normaliseAvailableKeys(['A', 'a', ' b ', '', 'B']);
  assert.deepEqual([...set].sort(), ['a', 'b']);
});

test('results are deterministic across repeated calls', () => {
  const keys = ['tomato', 'garlic', 'basil'];
  const first = scoreRecipe(recipe(), keys);
  const second = scoreRecipe(recipe(), keys);
  assert.deepEqual(first, second);
});

test('scoreRecipe does not mutate the recipe or the input keys', () => {
  const r = deepFreeze(recipe());
  const keys = Object.freeze(['pasta', 'tomato']);
  assert.doesNotThrow(() => scoreRecipe(r, keys));
  assert.equal(r.ingredients.length, 5);
  assert.deepEqual(keys, ['pasta', 'tomato']);
});

test('rankRecipes does not mutate its inputs and returns a new sorted array', () => {
  const recipes = deepFreeze([
    recipe({ id: 'a', fallbackRank: 3 }),
    recipe({ id: 'b', fallbackRank: 1 }),
    recipe({ id: 'c', fallbackRank: 2 }),
  ]);
  const keys = Object.freeze(['pasta', 'tomato', 'garlic']);
  const ranked = rankRecipes(recipes, keys);
  assert.equal(ranked.length, 3);
  assert.equal(recipes[0].id, 'a'); // original order untouched
  assert.deepEqual(keys, ['pasta', 'tomato', 'garlic']);
});

test('stable tie-breaking: equal score -> fewer missing essentials, then lower fallbackRank, then id', () => {
  // Two recipes, identical essential coverage (1/2) and no optionals => equal score.
  const twoEss = (id, rank, keys) => ({
    id,
    name: id,
    fallbackRank: rank,
    ingredients: [
      { key: keys[0], label: keys[0], essential: true },
      { key: keys[1], label: keys[1], essential: true },
    ],
  });

  // Same score, different missingEssentialCount:
  const a = scoreRecipe(
    { id: 'a', name: 'a', fallbackRank: 50, ingredients: [
      { key: 'x1', label: 'x1', essential: true },
      { key: 'x2', label: 'x2', essential: true },
      { key: 'x3', label: 'x3', essential: true },
      { key: 'x4', label: 'x4', essential: true },
    ] },
    ['x1', 'x2'],
  ); // coverage 0.5, missing 2
  const b = scoreRecipe(twoEss('b', 50, ['y1', 'y2']), ['y1']); // coverage 0.5, missing 1
  assert.equal(a.score, b.score);
  assert.ok(compareScored(b, a) < 0, 'fewer missing essentials should rank first');

  // Same score and same missing count: lower fallbackRank wins.
  const c = scoreRecipe(twoEss('c', 5, ['p1', 'p2']), ['p1']);
  const d = scoreRecipe(twoEss('d', 9, ['q1', 'q2']), ['q1']);
  assert.equal(c.score, d.score);
  assert.ok(compareScored(c, d) < 0, 'lower fallbackRank should rank first');

  // Same score, same missing count, same rank: lexicographic id.
  const e = { ...scoreRecipe(twoEss('e', 7, ['m1', 'm2']), ['m1']) };
  const f = { ...scoreRecipe(twoEss('f', 7, ['n1', 'n2']), ['n1']) };
  assert.ok(compareScored(e, f) < 0);
  assert.ok(compareScored(f, e) > 0);
});

test('specificity: when both recipes are complete, more matched essentials ranks first', () => {
  const general = {
    id: 'plain-pancakes',
    name: 'Plain',
    fallbackRank: 1,
    ingredients: [
      { key: 'flour', label: 'Flour', essential: true },
      { key: 'egg', label: 'Egg', essential: true },
      { key: 'milk', label: 'Milk', essential: true },
    ],
  };
  const specific = {
    id: 'peanut-pancakes',
    name: 'Peanut',
    fallbackRank: 10,
    ingredients: [
      { key: 'flour', label: 'Flour', essential: true },
      { key: 'egg', label: 'Egg', essential: true },
      { key: 'milk', label: 'Milk', essential: true },
      { key: 'peanut_butter', label: 'Peanut butter', essential: true },
    ],
  };
  const withoutPb = rankRecipes([general, specific], ['flour', 'egg', 'milk']);
  assert.equal(withoutPb[0].recipeId, 'plain-pancakes');
  assert.equal(withoutPb[1].missingEssentialCount, 1);

  const withPb = rankRecipes([general, specific], ['flour', 'egg', 'milk', 'peanut_butter']);
  assert.equal(withPb[0].score, withPb[1].score);
  assert.equal(withPb[0].missingEssentialCount, 0);
  assert.equal(withPb[1].missingEssentialCount, 0);
  assert.equal(withPb[0].recipeId, 'peanut-pancakes');
  assert.ok(withPb[0].matchedEssentialCount > withPb[1].matchedEssentialCount);
});

test('specificity never overrides better essential coverage', () => {
  const specificIncomplete = {
    id: 'four-essentials',
    name: 'Four',
    fallbackRank: 1,
    ingredients: [
      { key: 'a', label: 'a', essential: true },
      { key: 'b', label: 'b', essential: true },
      { key: 'c', label: 'c', essential: true },
      { key: 'd', label: 'd', essential: true },
    ],
  };
  const generalComplete = {
    id: 'two-essentials',
    name: 'Two',
    fallbackRank: 9,
    ingredients: [
      { key: 'a', label: 'a', essential: true },
      { key: 'b', label: 'b', essential: true },
    ],
  };
  const ranked = rankRecipes([specificIncomplete, generalComplete], ['a', 'b', 'c']);
  assert.equal(ranked[0].recipeId, 'two-essentials');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('popularity never overrides ingredient coverage in rankRecipes', () => {
  // "popular" has the best fallbackRank but none of its ingredients are available.
  const popularButUncovered = {
    id: 'popular',
    name: 'Popular',
    fallbackRank: 1,
    ingredients: [
      { key: 'quinoa', label: 'Quinoa', essential: true },
      { key: 'kale', label: 'Kale', essential: true },
    ],
  };
  // "niche" has the worst fallbackRank but is fully covered.
  const nicheButCovered = recipe({ id: 'niche', fallbackRank: 99 });
  const ranked = rankRecipes([popularButUncovered, nicheButCovered], ['pasta', 'tomato', 'garlic']);
  assert.equal(ranked[0].recipeId, 'niche');
  assert.equal(ranked[0].score, 1);
  assert.equal(ranked[1].recipeId, 'popular');
  assert.equal(ranked[1].score, 0);
});

test('popularityFallbackOrder is independent of ingredient evidence', () => {
  const recipes = [
    recipe({ id: 'c', fallbackRank: 3 }),
    recipe({ id: 'a', fallbackRank: 1 }),
    recipe({ id: 'b', fallbackRank: 2 }),
  ];
  const order = popularityFallbackOrder(recipes);
  assert.deepEqual(order.map((r) => r.recipeId), ['a', 'b', 'c']);
  // It takes no ingredient keys at all, and returns no coverage fields.
  assert.equal(popularityFallbackOrder.length, 1);
  for (const entry of order) {
    assert.deepEqual(Object.keys(entry).sort(), ['fallbackRank', 'name', 'recipeId']);
  }
  // Order is stable regardless of what the customer has.
  const shuffled = [recipes[2], recipes[0], recipes[1]];
  assert.deepEqual(popularityFallbackOrder(shuffled).map((r) => r.recipeId), ['a', 'b', 'c']);
});

test('popularityFallbackOrder does not mutate its input', () => {
  const recipes = deepFreeze([recipe({ id: 'b', fallbackRank: 2 }), recipe({ id: 'a', fallbackRank: 1 })]);
  assert.doesNotThrow(() => popularityFallbackOrder(recipes));
  assert.equal(recipes[0].id, 'b');
});

test('invalid recipes are rejected by the scorer', () => {
  assert.throws(() => scoreRecipe(null, []), TypeError);
  assert.throws(() => scoreRecipe({}, []), TypeError);
  assert.throws(() => scoreRecipe({ id: 'x', ingredients: [] }, []), TypeError);
  assert.throws(() => scoreRecipe({ id: 'x', ingredients: 'nope' }, []), TypeError);
  assert.throws(() => scoreRecipe({ id: 'x', ingredients: [{ key: 'a', essential: true }] }, []), TypeError); // no fallbackRank
});

test('normaliseAvailableKeys rejects non-iterable / string inputs', () => {
  assert.throws(() => normaliseAvailableKeys(null), TypeError);
  assert.throws(() => normaliseAvailableKeys(undefined), TypeError);
  assert.throws(() => normaliseAvailableKeys(42), TypeError);
  assert.throws(() => normaliseAvailableKeys('pasta,tomato'), TypeError);
  assert.doesNotThrow(() => normaliseAvailableKeys(new Set(['a'])));
  assert.doesNotThrow(() => normaliseAvailableKeys([]));
});


test('essential priority holds across different requirement counts despite optional bonus', () => {
  const make = (id, count) => recipe({ id, ingredients: [
    ...Array.from({ length: count }, (_, i) => ({ key: `e${i}`, essential: true })),
    { key: `${id}_optional`, essential: false },
  ] });
  const lower = scoreRecipe(make('lower', 3), ['e0', 'e1', 'lower_optional']);
  const higher = scoreRecipe(make('higher', 4), ['e0', 'e1', 'e2']);
  assert.ok(lower.score > higher.score, 'regression requires the misleading weighted-score ordering');
  assert.ok(compareScored(higher, lower) < 0);
  assert.ok(compareScored(lower, higher) > 0);
});

test('essential priority holds for every coverage fraction in the supported recipe sizes', () => {
  for (let n = 1; n <= 5; n++) for (let m = 1; m <= 5; m++) {
    for (let a = 0; a <= n; a++) for (let b = 0; b <= m; b++) {
      if (a / n <= b / m) continue;
      const high = { recipeId: 'high', essentialCoverage: a/n, score: a/n, missingEssentialCount: n-a, matchedEssentialCount: a, fallbackRank: 99 };
      const low = { recipeId: 'low', essentialCoverage: b/m, score: b/m+0.1, missingEssentialCount: m-b, matchedEssentialCount: b, fallbackRank: 1 };
      assert.ok(compareScored(high, low) < 0, `${a}/${n} must outrank ${b}/${m}`);
    }
  }
});
