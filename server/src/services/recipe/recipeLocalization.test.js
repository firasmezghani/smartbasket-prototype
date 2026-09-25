import test from 'node:test';
import assert from 'node:assert/strict';

import { loadRecipeDataset } from './recipeDataset.js';
import {
  DEFAULT_RECIPE_LANGUAGE,
  SUPPORTED_RECIPE_LANGUAGES,
  parseRecipeLanguage,
  validateRecipeLocaleOverlay,
  readRecipeLocaleOverlayFile,
  loadRecipeLocaleOverlay,
  localizeRecipeCard,
  localizeRecommendationResult,
} from './recipeLocalization.js';

const RECIPES = loadRecipeDataset();
const FR_OVERLAY = readRecipeLocaleOverlayFile();
const FR_MAP = loadRecipeLocaleOverlay('fr', { recipes: RECIPES });

test('supported languages are exactly en and fr; default is en', () => {
  assert.deepEqual([...SUPPORTED_RECIPE_LANGUAGES], ['en', 'fr']);
  assert.equal(DEFAULT_RECIPE_LANGUAGE, 'en');
});

test('parseRecipeLanguage accepts en/fr (case/space tolerant), falls back to en otherwise', () => {
  assert.equal(parseRecipeLanguage('en'), 'en');
  assert.equal(parseRecipeLanguage('fr'), 'fr');
  assert.equal(parseRecipeLanguage(' FR '), 'fr');
  assert.equal(parseRecipeLanguage('EN'), 'en');
  for (const bad of [undefined, null, '', '   ', 'de', 'en-US', 'fr-CA', 'english', 42, ['fr'], {}]) {
    assert.equal(parseRecipeLanguage(bad), 'en', String(bad));
  }
});

test('the shipped French overlay is valid against the shipped recipe dataset', () => {
  const { valid, errors } = validateRecipeLocaleOverlay(FR_OVERLAY, RECIPES);
  assert.equal(valid, true, JSON.stringify(errors.slice(0, 5), null, 2));
});

test('every shipped recipe has a complete French overlay entry', () => {
  for (const recipe of RECIPES) {
    const entry = FR_MAP.get(recipe.id);
    assert.ok(entry, `missing overlay for ${recipe.id}`);
    for (const field of ['name', 'description', 'cuisine', 'category']) {
      assert.equal(typeof entry[field], 'string', `${recipe.id}.${field}`);
      assert.ok(entry[field].trim().length > 0, `${recipe.id}.${field} blank`);
    }
    for (const ingredient of recipe.ingredients) {
      const o = entry.ingredients[ingredient.key];
      assert.ok(o, `${recipe.id} missing ingredient overlay ${ingredient.key}`);
      assert.ok(o.label.trim().length > 0, `${recipe.id}.${ingredient.key}.label blank`);
      if (typeof ingredient.quantityText === 'string' && ingredient.quantityText.trim() !== '') {
        assert.equal(
          typeof o.quantityText,
          'string',
          `${recipe.id}.${ingredient.key}.quantityText missing (English has one)`,
        );
        assert.ok(o.quantityText.trim().length > 0);
      }
    }
    // No orphan ingredient keys in the overlay.
    const baseKeys = new Set(recipe.ingredients.map((i) => i.key));
    for (const key of Object.keys(entry.ingredients)) {
      assert.ok(baseKeys.has(key), `${recipe.id} overlay has orphan ingredient ${key}`);
    }
  }
  const cheesy = FR_MAP.get('cheesy-tomato-pasta');
  assert.equal(cheesy.ingredients.mozzarella, undefined);
  assert.equal(cheesy.ingredients.parmesan, undefined);
  assert.ok(cheesy.ingredients.cheese);
});

test('validateRecipeLocaleOverlay flags a missing recipe, an orphan recipe and a bad field', () => {
  const broken = JSON.parse(JSON.stringify(FR_OVERLAY));
  delete broken.recipes['classic-omelette'];
  broken.recipes['not-a-real-recipe'] = { name: 'x', description: 'x', cuisine: 'x', category: 'x', ingredients: {} };
  broken.recipes['fluffy-pancakes'].name = '   ';
  const { valid, errors } = validateRecipeLocaleOverlay(broken, RECIPES);
  assert.equal(valid, false);
  const codes = new Set(errors.map((e) => e.code));
  assert.ok(codes.has('MISSING_OVERLAY_RECIPE'));
  assert.ok(codes.has('ORPHAN_OVERLAY_RECIPE'));
  assert.ok(codes.has('INVALID_OVERLAY_FIELD'));
});

test('validateRecipeLocaleOverlay rejects a non-fr locale', () => {
  const wrong = { ...FR_OVERLAY, locale: 'de' };
  const { valid, errors } = validateRecipeLocaleOverlay(wrong, RECIPES);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.code === 'INVALID_OVERLAY_LOCALE'));
});

// --- Pure card localization ---

function omeletteCard() {
  // A card shaped like `buildCoverageCard` output for classic-omelette.
  return {
    recipeId: 'classic-omelette',
    name: 'Classic Omelette',
    description: 'A plain folded omelette that cooks in a few minutes for one person.',
    cuisine: 'french',
    category: 'breakfast',
    prepTimeMinutes: 10,
    difficulty: 'easy',
    fallbackRank: 7,
    rank: 1,
    score: 0.83,
    coveragePercent: 100,
    essentialCoverage: 1,
    matchedEssentialCount: 2,
    missingEssentialCount: 0,
    totalEssential: 2,
    personalised: true,
    evidenceSource: 'basket',
    availabilitySemantics: 'current_availability',
    explanationText: '2 of 2 essential requirements matched from products currently in your basket.',
    dataLimitationText: 'Recommendations are based on implicit, incomplete shopping evidence.',
    matchedIngredients: [
      { key: 'egg', label: 'Eggs', essential: true, quantityText: '3' },
      { key: 'butter', label: 'Butter or olive oil', essential: true, quantityText: '1 knob butter or a little olive oil' },
    ],
    missingIngredients: [{ key: 'cheese', label: 'Grated cheese', essential: false, quantityText: '30 g' }],
    missingEssential: [],
    missingOptional: [{ key: 'cheese', label: 'Grated cheese', essential: false, quantityText: '30 g' }],
    requirements: [
      {
        key: 'egg', label: 'Eggs', labelKey: null, essential: true,
        anyOfKeys: ['egg'], matchedKey: 'egg',
        requiredAmount: 3, requiredUnit: 'piece', availableAmount: 6, availableUnit: 'piece',
        quantityText: '3', status: 'sufficient', reasonCode: 'known_quantity_meets_requirement',
      },
      {
        key: 'butter', label: 'Butter or olive oil', labelKey: 'recipe.reqLabel.cookingFat', essential: true,
        anyOfKeys: ['butter', 'olive_oil'], matchedKey: 'olive_oil',
        requiredAmount: null, requiredUnit: null, availableAmount: null, availableUnit: null,
        quantityText: '1 knob butter or a little olive oil', status: 'matched', reasonCode: 'present_no_structured_quantity',
      },
    ],
    missingLinkedProducts: [
      {
        requirementKey: 'cheese', ingredientKey: 'cheese', label: 'Grated cheese', labelKey: null,
        essential: false, satisfiesRequirement: true, productId: 'p-1', productName: 'Cheddar râpé Fromy 120 g',
        confidence: 'high', matchedRule: 'name_token',
      },
    ],
  };
}

test('localizeRecipeCard swaps only display strings for French', () => {
  const entry = FR_MAP.get('classic-omelette');
  const en = omeletteCard();
  const fr = localizeRecipeCard(en, entry);

  assert.equal(fr.name, 'Omelette nature');
  assert.equal(fr.description, 'Une omelette pliée, cuite en quelques minutes pour une personne.');
  assert.equal(fr.cuisine, 'française');
  assert.equal(fr.category, 'petit-déjeuner');
  assert.equal(fr.requirements[0].label, 'Œufs');
  assert.equal(fr.requirements[1].label, 'Beurre ou huile d’olive');
  assert.equal(fr.requirements[1].quantityText, '1 noix de beurre ou un peu d’huile d’olive');
  assert.equal(fr.matchedIngredients[0].label, 'Œufs');
  assert.equal(fr.missingOptional[0].label, 'Fromage râpé');
  assert.equal(fr.missingOptional[0].quantityText, '30 g');
  assert.equal(fr.missingLinkedProducts[0].label, 'Fromage râpé');

  // Structural / numeric / status fields are byte-identical to English.
  for (const key of [
    'recipeId', 'prepTimeMinutes', 'difficulty', 'fallbackRank', 'rank', 'score',
    'coveragePercent', 'essentialCoverage', 'matchedEssentialCount', 'missingEssentialCount',
    'totalEssential', 'personalised', 'evidenceSource', 'availabilitySemantics', 'explanationText', 'dataLimitationText',
  ]) {
    assert.deepEqual(fr[key], en[key], key);
  }
  for (let i = 0; i < en.requirements.length; i += 1) {
    for (const key of ['key', 'labelKey', 'essential', 'anyOfKeys', 'matchedKey', 'requiredAmount', 'requiredUnit', 'availableAmount', 'availableUnit', 'status', 'reasonCode']) {
      assert.deepEqual(fr.requirements[i][key], en.requirements[i][key], `requirements[${i}].${key}`);
    }
  }
  // Imported catalogue product name is never translated.
  assert.equal(fr.missingLinkedProducts[0].productName, 'Cheddar râpé Fromy 120 g');
  // The English input object is not mutated.
  assert.equal(en.name, 'Classic Omelette');
});

test('localizeRecommendationResult is identity for en and localizes for fr', () => {
  const enResult = { evidenceSource: 'basket', personalised: true, recommendations: [omeletteCard()] };

  const asEn = localizeRecommendationResult(enResult, { language: 'en', overlay: FR_MAP });
  assert.equal(asEn, enResult); // Same reference, so nothing is rewritten.

  const asFr = localizeRecommendationResult(
    { evidenceSource: 'basket', personalised: true, recommendations: [omeletteCard()] },
    { language: 'fr', overlay: FR_MAP },
  );
  assert.equal(asFr.recommendations[0].name, 'Omelette nature');
  assert.equal(asFr.evidenceSource, 'basket');
  assert.equal(asFr.recommendations[0].recipeId, 'classic-omelette');

  // detail-shaped result
  const asFrDetail = localizeRecommendationResult(
    { evidenceSource: 'basket', personalised: true, recommendation: omeletteCard() },
    { language: 'fr', overlay: FR_MAP },
  );
  assert.equal(asFrDetail.recommendation.name, 'Omelette nature');
});

test('localizeRecommendationResult never reorders and never changes ids or ranking for any recipe', () => {
  const cards = RECIPES.map((r, i) => ({
    recipeId: r.id,
    name: r.name,
    description: r.description,
    cuisine: r.cuisine ?? null,
    category: r.category ?? null,
    fallbackRank: r.fallbackRank,
    rank: i + 1,
    score: 1 / (i + 1),
    evidenceSource: 'popularity',
    personalised: false,
    requirements: r.ingredients.map((ing) => ({
      key: ing.key,
      label: ing.label,
      labelKey: ing.labelKey ?? null,
      essential: ing.essential,
      anyOfKeys: ing.anyOfKeys ?? [ing.key],
      matchedKey: null,
      requiredAmount: ing.requiredAmount ?? null,
      requiredUnit: ing.requiredUnit ?? null,
      availableAmount: null,
      availableUnit: null,
      quantityText: ing.quantityText ?? null,
      status: 'not_evaluated',
      reasonCode: 'no_evidence',
    })),
    matchedIngredients: [],
    missingIngredients: [],
    missingEssential: [],
    missingOptional: [],
    missingLinkedProducts: [],
  }));
  const en = { recommendations: cards.map((c) => ({ ...c })) };
  const fr = localizeRecommendationResult({ recommendations: cards.map((c) => ({ ...c })) }, { language: 'fr', overlay: FR_MAP });

  assert.deepEqual(
    fr.recommendations.map((c) => c.recipeId),
    en.recommendations.map((c) => c.recipeId),
  );
  for (let i = 0; i < en.recommendations.length; i += 1) {
    const a = en.recommendations[i];
    const b = fr.recommendations[i];
    assert.equal(b.recipeId, a.recipeId);
    assert.equal(b.fallbackRank, a.fallbackRank);
    assert.equal(b.rank, a.rank);
    assert.equal(b.score, a.score);
    assert.deepEqual(
      b.requirements.map((r) => [r.key, r.status, r.requiredAmount, r.requiredUnit, JSON.stringify(r.anyOfKeys)]),
      a.requirements.map((r) => [r.key, r.status, r.requiredAmount, r.requiredUnit, JSON.stringify(r.anyOfKeys)]),
    );
    // French name differs from English for every recipe.
    assert.notEqual(b.name, a.name, `${a.recipeId} name not localized`);
  }
});
