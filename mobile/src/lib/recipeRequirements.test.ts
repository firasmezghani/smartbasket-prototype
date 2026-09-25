import test from 'node:test';
import assert from 'node:assert/strict';

import { translations, type TranslationKey } from '../i18n/translations';
import {
  buildRequirementView,
  essentialRequirementCounts,
  formatRequirementQuantity,
  ingredientLabelKey,
  isRequirementMatchedForHeader,
  parseRequirement,
  parseRequirements,
  requirementStatusKey,
  safePositiveAmount,
} from './recipeRequirements';
import type { RecipeRequirement } from '../types/recommendations';

const enT = (k: TranslationKey, p?: Record<string, string | number>) => interpolate(translations.en[k], p);
const frT = (k: TranslationKey, p?: Record<string, string | number>) => interpolate(translations.fr[k], p);
function interpolate(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(params[key] ?? `{{${key}}}`));
}

function req(overrides: Partial<RecipeRequirement> = {}): RecipeRequirement {
  return {
    key: 'egg',
    label: 'Eggs',
    labelKey: null,
    essential: true,
    anyOfKeys: ['egg'],
    matchedKey: 'egg',
    requiredAmount: 3,
    requiredUnit: 'piece',
    availableAmount: 6,
    availableUnit: 'piece',
    quantityText: '3',
    status: 'sufficient',
    reasonCode: 'known_quantity_meets_requirement',
    ...overrides,
  };
}

// --- Parse every evaluation status ---

test('parseRequirement accepts every valid status', () => {
  for (const status of ['sufficient', 'insufficient', 'quantity_unknown', 'matched', 'missing'] as const) {
    const r = parseRequirement({ key: 'egg', status, essential: true, anyOfKeys: ['egg'] });
    assert.ok(r);
    assert.equal(r.status, status);
  }
});

test('parseRequirement defaults an unknown status string safely', () => {
  assert.equal(parseRequirement({ key: 'egg', status: 'totally_made_up', matchedKey: 'egg' })?.status, 'matched');
  assert.equal(parseRequirement({ key: 'egg', status: 42 })?.status, 'missing');
  assert.equal(parseRequirement({ key: 'egg' })?.status, 'missing');
});

test('parseRequirement returns null only without a usable primary key', () => {
  assert.equal(parseRequirement(null), null);
  assert.equal(parseRequirement({}), null);
  assert.equal(parseRequirement({ key: 'Bad Key' }), null);
  assert.equal(parseRequirement({ key: 123 }), null);
  assert.ok(parseRequirement({ key: 'egg' }));
});

// --- Malformed numeric fields ---

test('safePositiveAmount rejects NaN / Infinity / <= 0 / non-numbers', () => {
  for (const bad of [Number.NaN, Infinity, -Infinity, 0, -5, '3', null, undefined, {}]) {
    assert.equal(safePositiveAmount(bad), null);
  }
  assert.equal(safePositiveAmount(3), 3);
  assert.equal(safePositiveAmount(0.5), 0.5);
});

test('parseRequirement drops malformed amounts / units and incomplete pairs', () => {
  const r = parseRequirement({
    key: 'egg',
    status: 'sufficient',
    requiredAmount: Number.NaN,
    requiredUnit: 'piece',
    availableAmount: -2,
    availableUnit: 'piece',
    matchedKey: 'egg',
  });
  assert.equal(r?.requiredAmount, null);
  assert.equal(r?.requiredUnit, null);
  assert.equal(r?.availableAmount, null);

  const r2 = parseRequirement({ key: 'egg', requiredAmount: 3, requiredUnit: 'cup', matchedKey: 'egg' });
  assert.equal(r2?.requiredUnit, null); // unsupported unit dropped
  assert.equal(r2?.requiredAmount, null);

  const r3 = parseRequirement({ key: 'egg', requiredAmount: 3, matchedKey: 'egg' }); // no unit
  assert.equal(r3?.requiredAmount, null);
});

test('parseRequirement sanitises a malformed anyOfKeys array', () => {
  const r = parseRequirement({ key: 'butter', anyOfKeys: ['butter', 'Bad Key', 42, 'olive_oil', 'butter'] });
  assert.deepEqual(r?.anyOfKeys, ['butter', 'olive_oil']);
  const r2 = parseRequirement({ key: 'butter', anyOfKeys: 'nope' });
  assert.deepEqual(r2?.anyOfKeys, ['butter']); // falls back to the primary key
});

test('parseRequirements drops unusable entries only', () => {
  const list = parseRequirements([{ key: 'egg', status: 'matched' }, null, 5, { nope: true }, { key: 'butter', status: 'missing' }]);
  assert.deepEqual(list.map((r) => r.key), ['egg', 'butter']);
  assert.deepEqual(parseRequirements('not an array'), []);
});

// --- EN/FR translation-key parity ---

test('every new requirement translation key exists in EN and FR', () => {
  const keys: TranslationKey[] = [
    'recipe.matchedHeading',
    'recipe.requirementsNoneMatched',
    'recipe.reqLabel.cookingFat',
    'recipe.reqDetected',
    'recipe.reqRequires',
    'recipe.reqMatchedWith',
    'recipe.reqSufficient',
    'recipe.reqInsufficient',
    'recipe.reqQuantityUnknown',
    'recipe.reqMatched',
    'recipe.reqMissing',
    'recipe.reqHistoryAssociated',
    'recipe.reqHistoryNotAssociated',
    'recipe.reqHistoryQuantityUnverified',
    'recipe.coverageHistory',
    'recipe.historyNote',
    'recipe.listIntroBasket',
    'recipe.listIntroHistory',
    'recipe.ideasIntroHistory',
    'recipe.pieceEggOne',
    'recipe.pieceEggOther',
    'recipe.pieceUnitOne',
    'recipe.pieceUnitOther',
    'recipe.qtyGrams',
    'recipe.qtyMillilitres',
    'recipe.ingredient.egg',
    'recipe.ingredient.butter',
    'recipe.ingredient.oliveOil',
  ];
  for (const k of keys) {
    assert.ok(k in translations.en && translations.en[k].trim() !== '', `en missing ${k}`);
    assert.ok(k in translations.fr && translations.fr[k].trim() !== '', `fr missing ${k}`);
  }
});

test('requirementStatusKey maps every status to a defined key', () => {
  for (const status of ['sufficient', 'insufficient', 'quantity_unknown', 'matched', 'missing'] as const) {
    const k = requirementStatusKey(status);
    assert.ok(k in translations.en && k in translations.fr, `${status} -> ${k}`);
  }
});

// --- Formatting piece / g / ml ---

test('formatRequirementQuantity formats grams and millilitres', () => {
  assert.equal(formatRequirementQuantity(500, 'g', 'flour', enT), '500 g');
  assert.equal(formatRequirementQuantity(250, 'ml', 'milk', enT), '250 ml');
  assert.equal(formatRequirementQuantity(1500, 'g', 'rice', frT), '1500 g');
  assert.equal(formatRequirementQuantity(0.5, 'ml', 'x', enT), '0.5 ml');
});

test('formatRequirementQuantity returns "" for unusable amount/unit', () => {
  assert.equal(formatRequirementQuantity(null, 'g', 'x', enT), '');
  assert.equal(formatRequirementQuantity(Number.NaN, 'g', 'x', enT), '');
  assert.equal(formatRequirementQuantity(5, null, 'x', enT), '');
});

// --- Singular / plural egg wording ---

test('formatRequirementQuantity uses singular/plural egg nouns (EN + FR)', () => {
  assert.equal(formatRequirementQuantity(1, 'piece', 'egg', enT), '1 egg');
  assert.equal(formatRequirementQuantity(6, 'piece', 'egg', enT), '6 eggs');
  assert.equal(formatRequirementQuantity(1, 'piece', 'egg', frT), '1 œuf');
  assert.equal(formatRequirementQuantity(12, 'piece', 'egg', frT), '12 œufs');
  // unknown countable -> generic unit noun
  assert.equal(formatRequirementQuantity(1, 'piece', 'lemon', enT), '1 unit');
  assert.equal(formatRequirementQuantity(3, 'piece', 'lemon', enT), '3 units');
});

// --- Presentation models: sufficient / insufficient / unknown ---

test('buildRequirementView: sufficient (6 eggs, requires 3)', () => {
  const v = buildRequirementView(req(), enT);
  assert.equal(v.titleLabel, 'Eggs');
  assert.equal(v.detectedLine, 'Detected: 6 eggs');
  assert.equal(v.requiresLine, 'Recipe requires: 3 eggs');
  assert.equal(v.remainingLine, null);
  assert.equal(v.statusLine, 'Quantity sufficient');
  assert.equal(v.matchedWithLine, null); // matched by the primary key
});

test('buildRequirementView: insufficient (2 eggs, requires 3)', () => {
  const v = buildRequirementView(req({ availableAmount: 2, status: 'insufficient' }), frT);
  assert.equal(v.detectedLine, 'Détecté : 2 œufs');
  assert.equal(v.requiresLine, 'La recette nécessite : 3 œufs');
  assert.equal(v.statusLine, 'Quantité détectée insuffisante');
});

test('buildRequirementView: quantity unknown', () => {
  const v = buildRequirementView(
    req({ availableAmount: null, availableUnit: null, status: 'quantity_unknown' }),
    enT,
  );
  assert.equal(v.detectedLine, null);
  assert.equal(v.requiresLine, 'Recipe requires: 3 eggs');
  assert.equal(v.statusLine, 'Available quantity could not be verified');
});

// --- Alternative matched by olive oil ---

test('buildRequirementView: cooking-fat group matched by olive oil (EN + FR)', () => {
  const fat = req({
    key: 'butter',
    label: 'Butter or olive oil',
    labelKey: 'recipe.reqLabel.cookingFat',
    anyOfKeys: ['butter', 'olive_oil'],
    matchedKey: 'olive_oil',
    requiredAmount: null,
    requiredUnit: null,
    availableAmount: null,
    availableUnit: null,
    status: 'matched',
  });
  const en = buildRequirementView(fat, enT);
  assert.equal(en.titleLabel, 'Cooking fat — Butter or Olive oil');
  assert.equal(en.matchedWithLine, 'Matched with: Olive oil');
  assert.equal(en.requiresLine, null);
  assert.equal(en.remainingLine, null);
  assert.equal(en.statusLine, 'In your current basket');

  const fr = buildRequirementView(fat, frT);
  assert.equal(fr.titleLabel, 'Matière grasse de cuisson — Beurre ou Huile d’olive');
  assert.equal(fr.matchedWithLine, 'Correspondance : Huile d’olive');
});

test('buildRequirementView: remaining line when units are compatible', () => {
  const v = buildRequirementView(
    req({
      key: 'canned_tuna',
      label: 'Tinned tuna',
      requiredAmount: 250,
      requiredUnit: 'g',
      availableAmount: 130,
      availableUnit: 'g',
      status: 'insufficient',
    }),
    enT,
  );
  assert.equal(v.detectedLine, 'Detected: 130 g');
  assert.equal(v.requiresLine, 'Recipe requires: 250 g');
  assert.equal(v.remainingLine, 'Remaining: 120 g');
});

test('ingredientLabelKey resolves the known alternative labels', () => {
  assert.equal(ingredientLabelKey('olive_oil'), 'recipe.ingredient.oliveOil');
  assert.equal(ingredientLabelKey('butter'), 'recipe.ingredient.butter');
  assert.equal(ingredientLabelKey('mystery'), null);
});

// --- Counts + "no untranslated server prose" ---

test('essentialRequirementCounts: quantity_unknown counts as matched, insufficient does not', () => {
  const list = [
    req({ key: 'egg', status: 'quantity_unknown', essential: true }),
    req({ key: 'butter', status: 'missing', essential: true }),
  ];
  assert.deepEqual(essentialRequirementCounts(list), { matched: 1, total: 2 });

  const list2 = [req({ key: 'egg', status: 'insufficient', essential: true })];
  assert.deepEqual(essentialRequirementCounts(list2), { matched: 0, total: 1 });

  assert.equal(isRequirementMatchedForHeader('sufficient'), true);
  assert.equal(isRequirementMatchedForHeader('matched'), true);
  assert.equal(isRequirementMatchedForHeader('quantity_unknown'), true);
  assert.equal(isRequirementMatchedForHeader('insufficient'), false);
  assert.equal(isRequirementMatchedForHeader('missing'), false);
});

test('a requirement view is fully renderable without any server explanation prose', () => {
  // The card only ever needs: the parsed requirement + a translate function.
  const v = buildRequirementView(req(), enT);
  for (const piece of [v.titleLabel, v.statusLine]) {
    assert.equal(typeof piece, 'string');
    assert.ok(piece.length > 0);
    assert.doesNotMatch(piece, /\{\{|\}\}/); // no unresolved placeholders
  }
});

// --- Popularity cards are not evaluated ---

import {
  buildRecipeCardSummary,
  isNeutralRecipeCard,
  isNeutralRequirementSet,
  neutralRequirementCount,
  partitionRequirements,
  remainingRequirementAmount,
  requirementDisplayTitle,
  type RecipeCardSummaryInput,
} from './recipeRequirements';

test('parseRequirement accepts not_evaluated and preserves quantityText', () => {
  const r = parseRequirement({
    key: 'butter', label: 'Butter or olive oil', labelKey: 'recipe.reqLabel.cookingFat',
    essential: true, anyOfKeys: ['butter', 'olive_oil'], matchedKey: null,
    requiredAmount: null, requiredUnit: null, availableAmount: null, availableUnit: null,
    quantityText: '1 knob butter or a little olive oil',
    status: 'not_evaluated', reasonCode: 'no_evidence',
  });
  assert.ok(r);
  assert.equal(r.status, 'not_evaluated');
  assert.equal(r.quantityText, '1 knob butter or a little olive oil');
  assert.deepEqual(r.anyOfKeys, ['butter', 'olive_oil']);
  assert.equal(r.reasonCode, 'no_evidence');
});

test('parseRequirement drops a blank / non-string quantityText', () => {
  assert.equal(parseRequirement({ key: 'egg', quantityText: '   ' })?.quantityText, null);
  assert.equal(parseRequirement({ key: 'egg', quantityText: 5 })?.quantityText, null);
  assert.equal(parseRequirement({ key: 'egg' })?.quantityText, null);
});

test('not_evaluated is neither matched nor missing for the header count', () => {
  assert.equal(isRequirementMatchedForHeader('not_evaluated'), false);
  const list = [
    req({ key: 'egg', status: 'not_evaluated', essential: true }),
    req({ key: 'butter', status: 'not_evaluated', essential: true }),
  ];
  assert.deepEqual(essentialRequirementCounts(list), { matched: 0, total: 2 });
});

test('isNeutralRequirementSet is true only when every requirement is not_evaluated', () => {
  assert.equal(isNeutralRequirementSet([]), false);
  assert.equal(
    isNeutralRequirementSet([req({ status: 'not_evaluated' }), req({ key: 'b', status: 'not_evaluated' })]),
    true,
  );
  assert.equal(
    isNeutralRequirementSet([req({ status: 'not_evaluated' }), req({ key: 'b', status: 'missing' })]),
    false,
  );
  assert.equal(isNeutralRequirementSet([req({ status: 'sufficient' })]), false);
});

test('requirementStatusKey("not_evaluated") resolves to a defined EN + FR key', () => {
  const k = requirementStatusKey('not_evaluated');
  assert.equal(k, 'recipe.reqNotEvaluated');
  assert.ok(k in translations.en && k in translations.fr);
  assert.ok(translations.en[k].trim() !== '' && translations.fr[k].trim() !== '');
});

test('the new heading + neutral-status keys exist in EN and FR', () => {
  for (const k of ['recipe.recipeRequirementsHeading', 'recipe.reqNotEvaluated'] as const) {
    assert.ok(k in translations.en && translations.en[k].trim() !== '', `en ${k}`);
    assert.ok(k in translations.fr && translations.fr[k].trim() !== '', `fr ${k}`);
  }
});

test('buildRequirementView: not_evaluated is neutral — no detected line, no matched-with, quantity as "requires"', () => {
  const egg = buildRequirementView(
    req({
      key: 'egg', status: 'not_evaluated', matchedKey: null,
      availableAmount: null, availableUnit: null,
      requiredAmount: 3, requiredUnit: 'piece', quantityText: '3',
    }),
    enT,
  );
  assert.equal(egg.neutral, true);
  assert.equal(egg.detectedLine, null);
  assert.equal(egg.matchedWithLine, null);
  assert.equal(egg.requiresLine, 'Recipe requires: 3 eggs'); // structured wins
  assert.equal(egg.statusLine, 'Needed for this recipe');

  const fat = buildRequirementView(
    req({
      key: 'butter', label: 'Butter or olive oil', labelKey: 'recipe.reqLabel.cookingFat',
      status: 'not_evaluated', matchedKey: null, anyOfKeys: ['butter', 'olive_oil'],
      requiredAmount: null, requiredUnit: null, availableAmount: null, availableUnit: null,
      quantityText: '1 knob butter or a little olive oil',
    }),
    frT,
  );
  assert.equal(fat.titleLabel, 'Matière grasse de cuisson — Beurre ou Huile d’olive');
  assert.equal(fat.detectedLine, null);
  assert.equal(fat.matchedWithLine, null); // no "Correspondance :" claim without evidence
  assert.equal(fat.requiresLine, 'La recette nécessite : 1 knob butter or a little olive oil');
  assert.equal(fat.statusLine, 'Nécessaire pour cette recette');
});

// --- Recipe-list card summary (popularity vs personalised) ---

const NEUTRAL_REQS: RecipeRequirement[] = [
  req({ key: 'egg', essential: true, status: 'not_evaluated', matchedKey: null, availableAmount: null, availableUnit: null }),
  req({ key: 'butter', essential: true, status: 'not_evaluated', matchedKey: null, availableAmount: null, availableUnit: null }),
  req({ key: 'cheese', essential: false, status: 'not_evaluated', matchedKey: null, availableAmount: null, availableUnit: null }),
];

const popularityCard: RecipeCardSummaryInput = {
  evidenceSource: 'popularity',
  personalised: false,
  requirements: NEUTRAL_REQS,
  // The server sends zeros for popularity cards; the summary ignores them anyway.
  matchedEssentialCount: 0,
  missingEssentialCount: 0,
  totalEssential: 2,
};

const personalisedCard: RecipeCardSummaryInput = {
  evidenceSource: 'basket',
  personalised: true,
  requirements: [
    req({ key: 'egg', essential: true, status: 'sufficient' }),
    req({ key: 'butter', essential: true, status: 'missing', matchedKey: null }),
  ],
  matchedEssentialCount: 1,
  missingEssentialCount: 1,
  totalEssential: 2,
};

test('isNeutralRecipeCard: true only for a no-evidence card whose requirements are all not_evaluated', () => {
  assert.equal(isNeutralRecipeCard(popularityCard), true);
  assert.equal(isNeutralRecipeCard(personalisedCard), false);
  // A no-evidence source with checked requirements is not treated as neutral.
  assert.equal(
    isNeutralRecipeCard({ evidenceSource: 'popularity', personalised: false, requirements: [req({ status: 'sufficient' })] }),
    false,
  );
  // all not_evaluated but the card claims personalisation → not neutral
  assert.equal(
    isNeutralRecipeCard({ evidenceSource: 'basket', personalised: true, requirements: NEUTRAL_REQS }),
    false,
  );
  // no requirements at all → not neutral (nothing to summarise neutrally)
  assert.equal(isNeutralRecipeCard({ evidenceSource: 'popularity', personalised: false, requirements: [] }), false);
});

test('neutralRequirementCount uses the essential count, falling back to the total', () => {
  assert.equal(neutralRequirementCount(NEUTRAL_REQS), 2); // egg + butter essential
  assert.equal(
    neutralRequirementCount([req({ essential: false }), req({ key: 'b', essential: false })]),
    2,
  );
});

test('buildRecipeCardSummary: popularity card never claims possession (EN + FR)', () => {
  const en = buildRecipeCardSummary(popularityCard, enT);
  assert.equal(en.neutral, true);
  assert.equal(en.kind, 'popularity');
  assert.equal(en.statusLine, 'Ingredients not checked.');
  assert.equal(en.detailLine, null);
  assert.doesNotMatch(en.statusLine, /ready to cook|missing|you have/i);

  const fr = buildRecipeCardSummary(popularityCard, frT);
  assert.equal(fr.kind, 'popularity');
  assert.equal(fr.statusLine, 'Ingrédients non vérifiés.');
});

test('buildRecipeCardSummary: ready to cook only for current-basket sufficient essentials', () => {
  const ready = buildRecipeCardSummary({
    evidenceSource: 'basket',
    availabilitySemantics: 'current_availability',
    personalised: true,
    requirements: [
      req({ key: 'egg', essential: true, status: 'sufficient' }),
      req({ key: 'butter', essential: true, status: 'matched', matchedKey: 'olive_oil', requiredAmount: null, requiredUnit: null, availableAmount: null, availableUnit: null }),
    ],
  }, enT);
  assert.equal(ready.kind, 'ready');
  assert.equal(ready.statusLine, 'Ready to cook');
  assert.doesNotMatch(ready.statusLine, /essential requirements matched/i);
});

test('buildRecipeCardSummary: missing essentials list first two plus count', () => {
  const s = buildRecipeCardSummary({
    evidenceSource: 'basket',
    availabilitySemantics: 'current_availability',
    personalised: true,
    requirements: [
      req({ key: 'pasta', essential: true, status: 'missing', matchedKey: null }),
      req({ key: 'tomato', essential: true, status: 'missing', matchedKey: null }),
      req({ key: 'olive_oil', essential: true, status: 'missing', matchedKey: null }),
      req({ key: 'cheese', essential: true, status: 'missing', matchedKey: null, anyOfKeys: ['cheese', 'mozzarella', 'parmesan'] }),
    ],
  }, enT);
  assert.equal(s.kind, 'missing');
  assert.equal(s.statusLine, 'Missing: Pasta, Tomato +2 more');
});

test('buildRecipeCardSummary: insufficient quantity uses remaining amount', () => {
  const s = buildRecipeCardSummary({
    evidenceSource: 'basket',
    availabilitySemantics: 'current_availability',
    personalised: true,
    requirements: [
      req({
        key: 'canned_tuna',
        essential: true,
        status: 'insufficient',
        requiredAmount: 250,
        requiredUnit: 'g',
        availableAmount: 130,
        availableUnit: 'g',
      }),
    ],
  }, enT);
  assert.equal(s.kind, 'insufficient');
  assert.equal(s.statusLine, 'Need 120 g more Tuna');
});

test('buildRecipeCardSummary: quantity_unknown is never ready to cook', () => {
  const s = buildRecipeCardSummary({
    evidenceSource: 'basket',
    availabilitySemantics: 'current_availability',
    personalised: true,
    requirements: [req({ key: 'egg', essential: true, status: 'quantity_unknown', availableAmount: null, availableUnit: null })],
  }, enT);
  assert.equal(s.kind, 'check_quantity');
  assert.equal(s.statusLine, 'Check quantity: Eggs');
  assert.doesNotMatch(s.statusLine, /ready to cook|quantity sufficient/i);
});

test('buildRecipeCardSummary: history never claims current possession or sufficient quantity', () => {
  const historyCard = {
    evidenceSource: 'history' as const,
    availabilitySemantics: 'previous_purchase_association' as const,
    personalised: true,
    requirements: [req({ status: 'quantity_unknown' }), req({ key: 'butter', status: 'missing', matchedKey: null })],
    matchedEssentialCount: 1,
    missingEssentialCount: 1,
    totalEssential: 2,
  };
  const s = buildRecipeCardSummary(historyCard, enT);
  assert.equal(s.kind, 'history');
  assert.equal(s.statusLine, 'Check what you still have');
  assert.match(s.detailLine ?? '', /Previously associated: Eggs/i);
  assert.doesNotMatch(s.statusLine, /ready to cook|quantity sufficient|you have now/i);
  const complete = buildRecipeCardSummary({
    ...historyCard,
    requirements: [req({ status: 'quantity_unknown' }), req({ key: 'butter', status: 'matched', matchedKey: 'butter' })],
  }, enT);
  assert.equal(complete.statusLine, 'Check what you still have');
  assert.doesNotMatch(complete.statusLine, /Ready to cook/);
});

test('requirementDisplayTitle shows one alternative group, not multiple missing items', () => {
  const cheese = req({
    key: 'cheese',
    label: 'Cheese',
    anyOfKeys: ['cheese', 'mozzarella', 'parmesan'],
    status: 'missing',
    matchedKey: null,
  });
  assert.equal(
    requirementDisplayTitle(cheese, enT),
    'Cheese — Cheddar, Mozzarella or Parmesan',
  );
});

test('partitionRequirements keeps alternatives as one still-needed row', () => {
  const list = [
    req({ key: 'pasta', essential: true, status: 'matched' }),
    req({
      key: 'cheese',
      essential: true,
      status: 'missing',
      matchedKey: null,
      anyOfKeys: ['cheese', 'mozzarella', 'parmesan'],
    }),
    req({ key: 'sugar', essential: false, status: 'missing', matchedKey: null }),
  ];
  const p = partitionRequirements(list);
  assert.deepEqual(p.youHaveNow.map((r) => r.key), ['pasta']);
  assert.deepEqual(p.stillNeeded.map((r) => r.key), ['cheese']);
  assert.deepEqual(p.optionalAdditions.map((r) => r.key), ['sugar']);
  assert.equal(remainingRequirementAmount(list[1]), null);
});

test('requirementStatusKey uses history wording and never quantity-sufficient language', () => {
  assert.equal(requirementStatusKey('quantity_unknown', 'previous_purchase_association'), 'recipe.reqHistoryQuantityUnverified');
  assert.equal(requirementStatusKey('matched', 'previous_purchase_association'), 'recipe.reqHistoryAssociated');
  assert.equal(requirementStatusKey('sufficient', 'previous_purchase_association'), 'recipe.reqHistoryAssociated');
  assert.equal(requirementStatusKey('sufficient', 'current_availability'), 'recipe.reqSufficient');
  assert.match(enT('recipe.reqHistoryQuantityUnverified'), /not verified from purchase history/i);
  assert.doesNotMatch(enT('recipe.reqHistoryAssociated'), /Quantity sufficient|currently covered/i);
});

test('buildRequirementView: history never shows detected quantity or sufficient status', () => {
  const v = buildRequirementView(
    req({ status: 'quantity_unknown', availableAmount: 6, availableUnit: 'piece' }),
    enT,
    'previous_purchase_association',
  );
  assert.equal(v.detectedLine, null);
  assert.match(v.statusLine, /not verified from purchase history/i);
  assert.doesNotMatch(v.statusLine, /Quantity sufficient|In your current basket/i);
});

test('recipe.requirementCount exists and is in EN/FR parity', () => {
  const k: TranslationKey = 'recipe.requirementCount';
  assert.ok(k in translations.en && translations.en[k].trim() !== '');
  assert.ok(k in translations.fr && translations.fr[k].trim() !== '');
  assert.match(translations.en[k], /\{\{count\}\}/);
  assert.match(translations.fr[k], /\{\{count\}\}/);
});
