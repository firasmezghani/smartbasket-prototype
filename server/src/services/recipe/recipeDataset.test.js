import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateRecipeDataset,
  assertValidRecipeDataset,
  loadRecipeDataset,
  readRecipeDatasetFile,
  RECIPE_LIMITS,
  ALLOWED_DIFFICULTIES,
} from './recipeDataset.js';

// Build a minimal valid recipe; override any field for negative tests.
function makeRecipe(overrides = {}) {
  return {
    id: 'sample-recipe',
    name: 'Sample Recipe',
    description: 'A short synthetic description for testing.',
    cuisine: 'international',
    category: 'main',
    prepTimeMinutes: 20,
    difficulty: 'easy',
    fallbackRank: 1,
    source: { name: 'SmartBasket synthetic recipe dataset', licence: 'CC0-1.0', url: null },
    ingredients: [
      { key: 'pasta', label: 'Pasta', essential: true, quantityText: '300 g' },
      { key: 'tomato', label: 'Tomatoes', essential: true, quantityText: '400 g' },
      { key: 'basil', label: 'Basil', essential: false },
    ],
    ...overrides,
  };
}

function makeDataset(recipes) {
  return { $schemaVersion: 1, recipes };
}

function codes(result) {
  return result.errors.map((e) => e.code);
}

test('the shipped recipes.json dataset loads and validates', () => {
  const recipes = loadRecipeDataset({ force: true });
  assert.ok(Array.isArray(recipes));
  assert.equal(recipes.length, 10, `expected the approved 10-recipe operational set, got ${recipes.length}`);

  const parsed = readRecipeDatasetFile();
  const result = validateRecipeDataset(parsed);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.deepEqual(result.errors, []);
});

test('a well-formed dataset is valid with no errors', () => {
  const result = validateRecipeDataset(makeDataset([makeRecipe()]));
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.recipeCount, 1);
});

test('accepts a bare array of recipes as well as { recipes: [...] }', () => {
  const result = validateRecipeDataset([makeRecipe()]);
  assert.equal(result.valid, true);
});

test('reports duplicate recipe identifiers and names the field/recipe', () => {
  const result = validateRecipeDataset(
    makeDataset([makeRecipe({ id: 'dup', fallbackRank: 1 }), makeRecipe({ id: 'dup', fallbackRank: 2 })]),
  );
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes('DUPLICATE_RECIPE_ID'));
  const issue = result.errors.find((e) => e.code === 'DUPLICATE_RECIPE_ID');
  assert.equal(issue.recipeId, 'dup');
  assert.equal(issue.field, 'id');
  assert.equal(issue.recipeIndex, 1);
});

test('reports missing or blank names', () => {
  assert.ok(codes(validateRecipeDataset(makeDataset([makeRecipe({ name: '' })]))).includes('MISSING_NAME'));
  assert.ok(codes(validateRecipeDataset(makeDataset([makeRecipe({ name: '   ' })]))).includes('MISSING_NAME'));
  assert.ok(codes(validateRecipeDataset(makeDataset([makeRecipe({ name: 42 })]))).includes('MISSING_NAME'));
});

test('reports a missing or blank description', () => {
  assert.ok(
    codes(validateRecipeDataset(makeDataset([makeRecipe({ description: '' })]))).includes('MISSING_DESCRIPTION'),
  );
});

test('reports recipes without ingredients', () => {
  assert.ok(codes(validateRecipeDataset(makeDataset([makeRecipe({ ingredients: [] })]))).includes('NO_INGREDIENTS'));
  assert.ok(
    codes(validateRecipeDataset(makeDataset([makeRecipe({ ingredients: 'nope' })]))).includes('NO_INGREDIENTS'),
  );
});

test('reports duplicate ingredient keys within one recipe', () => {
  const recipe = makeRecipe({
    ingredients: [
      { key: 'tomato', label: 'Tomatoes', essential: true },
      { key: 'tomato', label: 'More tomatoes', essential: false },
    ],
  });
  const result = validateRecipeDataset(makeDataset([recipe]));
  assert.equal(result.valid, false);
  const issue = result.errors.find((e) => e.code === 'DUPLICATE_INGREDIENT_KEY');
  assert.ok(issue);
  assert.equal(issue.recipeId, 'sample-recipe');
  assert.match(issue.field, /^ingredients\[1\]\.key$/);
});

test('reports invalid ingredient keys (spaces, capitals, punctuation)', () => {
  for (const badKey of ['Tomato Sauce', 'TOMATO', 'tomato-sauce', 'tomato ', '_tomato', 'tomato__sauce', '']) {
    const recipe = makeRecipe({
      ingredients: [
        { key: badKey, label: 'Thing', essential: true },
        { key: 'water', label: 'Water', essential: false },
      ],
    });
    const result = validateRecipeDataset(makeDataset([recipe]));
    assert.ok(codes(result).includes('INVALID_INGREDIENT_KEY'), `expected INVALID_INGREDIENT_KEY for ${JSON.stringify(badKey)}`);
  }
});

test('reports a recipe with no essential ingredient', () => {
  const recipe = makeRecipe({
    ingredients: [
      { key: 'basil', label: 'Basil', essential: false },
      { key: 'parmesan', label: 'Parmesan', essential: false },
    ],
  });
  assert.ok(codes(validateRecipeDataset(makeDataset([recipe]))).includes('NO_ESSENTIAL_INGREDIENT'));
});

test('reports too many essential ingredients (prototype complexity limit)', () => {
  const ingredients = [];
  for (let i = 0; i < RECIPE_LIMITS.maxEssentialIngredients + 1; i += 1) {
    ingredients.push({ key: `ingredient_${i}`, label: `Ingredient ${i}`, essential: true });
  }
  assert.ok(
    codes(validateRecipeDataset(makeDataset([makeRecipe({ ingredients })]))).includes('TOO_MANY_ESSENTIAL_INGREDIENTS'),
  );
});

test('reports invalid preparation times', () => {
  for (const bad of [0, -5, 3.5, '20', null, RECIPE_LIMITS.maxPrepTimeMinutes + 1]) {
    assert.ok(
      codes(validateRecipeDataset(makeDataset([makeRecipe({ prepTimeMinutes: bad })]))).includes('INVALID_PREP_TIME'),
      `expected INVALID_PREP_TIME for ${JSON.stringify(bad)}`,
    );
  }
});

test('reports invalid fallback ranks', () => {
  for (const bad of [0, -1, 2.5, '1', null]) {
    assert.ok(
      codes(validateRecipeDataset(makeDataset([makeRecipe({ fallbackRank: bad })]))).includes('INVALID_FALLBACK_RANK'),
      `expected INVALID_FALLBACK_RANK for ${JSON.stringify(bad)}`,
    );
  }
});

test('reports duplicate fallback ranks (uniqueness required by design)', () => {
  const result = validateRecipeDataset(
    makeDataset([makeRecipe({ id: 'a', fallbackRank: 7 }), makeRecipe({ id: 'b', fallbackRank: 7 })]),
  );
  assert.equal(result.valid, false);
  const issue = result.errors.find((e) => e.code === 'DUPLICATE_FALLBACK_RANK');
  assert.ok(issue);
  assert.equal(issue.recipeId, 'b');
  assert.equal(issue.field, 'fallbackRank');
});

test('reports missing source / licence metadata', () => {
  assert.ok(codes(validateRecipeDataset(makeDataset([makeRecipe({ source: undefined })]))).includes('MISSING_SOURCE_METADATA'));
  assert.ok(codes(validateRecipeDataset(makeDataset([makeRecipe({ source: { name: 'x' } })]))).includes('MISSING_SOURCE_METADATA'));
  assert.ok(
    codes(validateRecipeDataset(makeDataset([makeRecipe({ source: { name: 'x', licence: '  ' } })]))).includes(
      'MISSING_SOURCE_METADATA',
    ),
  );
});

test('reports invalid difficulty values', () => {
  for (const bad of ['expert', 'Easy', '', 3, undefined]) {
    assert.ok(
      codes(validateRecipeDataset(makeDataset([makeRecipe({ difficulty: bad })]))).includes('INVALID_DIFFICULTY'),
      `expected INVALID_DIFFICULTY for ${JSON.stringify(bad)}`,
    );
  }
  // sanity: all allowed difficulties pass
  for (const good of ALLOWED_DIFFICULTIES) {
    assert.equal(validateRecipeDataset(makeDataset([makeRecipe({ difficulty: good })])).valid, true);
  }
});

test('every validation issue identifies the affected recipe and field', () => {
  const result = validateRecipeDataset(
    makeDataset([
      makeRecipe({ id: 'broken', name: '', prepTimeMinutes: -1, difficulty: 'wrong' }),
    ]),
  );
  assert.equal(result.valid, false);
  for (const issue of result.errors) {
    assert.equal(typeof issue.code, 'string');
    assert.equal(typeof issue.message, 'string');
    assert.ok('recipeId' in issue);
    assert.ok('field' in issue);
    assert.equal(issue.recipeId, 'broken');
  }
});

test('assertValidRecipeDataset throws for an invalid dataset and returns recipes for a valid one', () => {
  assert.throws(() => assertValidRecipeDataset(makeDataset([makeRecipe({ id: 'BAD KEY' })])), /failed validation/);
  const recipes = assertValidRecipeDataset(makeDataset([makeRecipe()]));
  assert.equal(recipes.length, 1);
});

test('reports a completely wrong dataset shape', () => {
  assert.equal(validateRecipeDataset(null).valid, false);
  assert.equal(validateRecipeDataset(42).valid, false);
  assert.ok(codes(validateRecipeDataset({ notRecipes: [] })).includes('INVALID_DATASET_SHAPE'));
});

// --- Structured requirements: requiredAmount / requiredUnit / labelKey / anyOfKeys ---

// A dataset that also carries `olive_oil` somewhere, so anyOfKeys can reference it.
function datasetWithOliveOil(firstRecipeOverrides) {
  return makeDataset([
    makeRecipe(firstRecipeOverrides),
    makeRecipe({
      id: 'other-recipe',
      fallbackRank: 2,
      ingredients: [
        { key: 'olive_oil', label: 'Olive oil', essential: true },
        { key: 'lemon', label: 'Lemon', essential: false },
      ],
    }),
  ]);
}

test('accepts a valid structured requirement + alternative group', () => {
  const ds = datasetWithOliveOil({
    ingredients: [
      { key: 'egg', label: 'Eggs', essential: true, quantityText: '3', requiredAmount: 3, requiredUnit: 'piece', anyOfKeys: ['egg'] },
      { key: 'butter', label: 'Butter or olive oil', labelKey: 'recipe.reqLabel.cookingFat', essential: true, anyOfKeys: ['butter', 'olive_oil'] },
      { key: 'basil', label: 'Basil', essential: false },
    ],
  });
  const r = validateRecipeDataset(ds);
  assert.equal(r.valid, true, JSON.stringify(r.errors, null, 2));
});

test('rejects invalid requiredAmount values', () => {
  const bad = (requiredAmount) =>
    codes(validateRecipeDataset(datasetWithOliveOil({
      ingredients: [
        { key: 'egg', label: 'Eggs', essential: true, requiredAmount, requiredUnit: 'piece', anyOfKeys: ['egg'] },
        { key: 'tomato', label: 'Tomatoes', essential: true },
      ],
    })));
  assert.ok(bad(0).includes('INVALID_REQUIRED_AMOUNT'));
  assert.ok(bad(-3).includes('INVALID_REQUIRED_AMOUNT'));
  assert.ok(bad(Number.POSITIVE_INFINITY).includes('INVALID_REQUIRED_AMOUNT'));
  assert.ok(bad('3').includes('INVALID_REQUIRED_AMOUNT'));
  assert.ok(bad(2_000_000).includes('INVALID_REQUIRED_AMOUNT'));
  assert.ok(bad(2.5).includes('NON_INTEGER_PIECE_AMOUNT'));
});

test('rejects an unsupported requiredUnit and an incomplete pair', () => {
  const withUnit = (u) => codes(validateRecipeDataset(datasetWithOliveOil({
    ingredients: [
      { key: 'egg', label: 'Eggs', essential: true, requiredAmount: 3, requiredUnit: u, anyOfKeys: ['egg'] },
      { key: 'tomato', label: 'Tomatoes', essential: true },
    ],
  })));
  assert.ok(withUnit('cup').includes('INVALID_REQUIRED_UNIT'));
  assert.ok(withUnit('tbsp').includes('INVALID_REQUIRED_UNIT'));
  // amount without unit
  assert.ok(codes(validateRecipeDataset(datasetWithOliveOil({
    ingredients: [
      { key: 'egg', label: 'Eggs', essential: true, requiredAmount: 3, anyOfKeys: ['egg'] },
      { key: 'tomato', label: 'Tomatoes', essential: true },
    ],
  }))).includes('INCOMPLETE_REQUIRED_QUANTITY'));
});

test('rejects malformed / empty / duplicate / oversized alternative groups', () => {
  const withAnyOf = (anyOfKeys) => codes(validateRecipeDataset(datasetWithOliveOil({
    ingredients: [
      { key: 'egg', label: 'Eggs', essential: true, anyOfKeys },
      { key: 'tomato', label: 'Tomatoes', essential: true },
    ],
  })));
  assert.ok(withAnyOf([]).includes('INVALID_ANYOF_SHAPE'));
  assert.ok(withAnyOf('egg').includes('INVALID_ANYOF_SHAPE'));
  assert.ok(withAnyOf(['egg', 'egg']).includes('DUPLICATE_ANYOF_KEY'));
  assert.ok(withAnyOf(['egg', 'Not A Key']).includes('INVALID_ANYOF_KEY'));
  assert.ok(!withAnyOf(['egg', 'synthetic_alternative']).includes('INVALID_ANYOF_KEY'));
  assert.ok(withAnyOf(['butter', 'olive_oil']).includes('ANYOF_MISSING_PRIMARY')); // primary "egg" absent
  assert.ok(withAnyOf(['egg', 'olive_oil', 'butter', 'lemon', 'tomato']).includes('TOO_MANY_ANYOF_KEYS'));
});

test('rejects a malformed labelKey', () => {
  const c = codes(validateRecipeDataset(datasetWithOliveOil({
    ingredients: [
      { key: 'egg', label: 'Eggs', essential: true, labelKey: 'Not A Key' },
      { key: 'tomato', label: 'Tomatoes', essential: true },
    ],
  })));
  assert.ok(c.includes('INVALID_LABEL_KEY'));
});

test('an alternative group is still one essential requirement (max-essential invariant)', () => {
  // 5 essential ingredients, one of which has a 2-key anyOf group -> still 5, valid.
  const ds = datasetWithOliveOil({
    ingredients: [
      { key: 'egg', label: 'Eggs', essential: true, anyOfKeys: ['egg', 'olive_oil'] },
      { key: 'tomato', label: 'Tomatoes', essential: true },
      { key: 'pasta', label: 'Pasta', essential: true },
      { key: 'garlic', label: 'Garlic', essential: true },
      { key: 'onion', label: 'Onion', essential: true },
      { key: 'basil', label: 'Basil', essential: false },
    ],
  });
  const r = validateRecipeDataset(ds);
  assert.ok(!codes(r).includes('TOO_MANY_ESSENTIAL_INGREDIENTS'), JSON.stringify(r.errors));
});

test('the shipped Classic Omelette carries the reviewed structured requirement + alternative', () => {
  const recipes = loadRecipeDataset({ force: true });
  const omelette = recipes.find((r) => r.id === 'classic-omelette');
  const egg = omelette.ingredients.find((i) => i.key === 'egg');
  assert.equal(egg.requiredAmount, 3);
  assert.equal(egg.requiredUnit, 'piece');
  const fat = omelette.ingredients.find((i) => i.key === 'butter');
  assert.deepEqual(fat.anyOfKeys, ['butter', 'olive_oil']);
  assert.equal(fat.labelKey, 'recipe.reqLabel.cookingFat');
});

test('the shipped Cheesy Tomato Pasta models cheese alternatives as one requirement only', () => {
  const recipes = loadRecipeDataset({ force: true });
  const cheesyPasta = recipes.find((r) => r.id === 'cheesy-tomato-pasta');
  const cheese = cheesyPasta.ingredients.find((i) => i.key === 'cheese');
  assert.deepEqual(cheese.anyOfKeys, ['cheese', 'mozzarella', 'parmesan']);
  assert.equal(cheese.essential, true);
  assert.equal(cheesyPasta.ingredients.some((i) => i.key === 'mozzarella'), false);
  assert.equal(cheesyPasta.ingredients.some((i) => i.key === 'parmesan'), false);
  assert.equal(cheesyPasta.ingredients.filter((i) => i.essential).length, 4);
  assert.equal(cheesyPasta.ingredients.filter((i) => i.essential === false).length, 0);
});

test('an anyOf alternative does not need a duplicate ingredient row in any recipe', () => {
  const r = validateRecipeDataset(makeDataset([
    makeRecipe({
      ingredients: [
        { key: 'pasta', label: 'Pasta', essential: true },
        { key: 'cheese', label: 'Cheese', essential: true, anyOfKeys: ['cheese', 'mozzarella'] },
      ],
    }),
  ]));
  assert.equal(r.valid, true, JSON.stringify(r.errors));
  assert.equal(r.errors.some((e) => e.code === 'UNKNOWN_ANYOF_KEY'), false);
});
