import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliseProductText,
  validateIngredientMappingConfig,
  compileIngredientMappingConfig,
  mapProductToIngredient,
  createIngredientMapper,
  loadIngredientMappingConfig,
  collectRecipeIngredientKeys,
  readShippedConfigForTest,
  CONFIDENCE_BY_RULE,
} from './ingredientMapping.service.js';
import { loadRecipeDataset } from './recipeDataset.js';

// A small stand-in configuration. No real product data.

const RECIPE_KEYS = new Set([
  'milk', 'coconut_milk', 'rice', 'cheese', 'tomato', 'pasta', 'chicken', 'mushroom', 'courgette',
]);

const CONFIG = {
  $schemaVersion: 1,
  packagingTerms: ['own', 'brand'],
  rules: [
    { ingredientKey: 'milk', phrases: ['whole milk', 'semi skimmed milk', 'milk'], tokens: ['milk'], families: ['fresh milk'], descriptions: ['fresh dairy milk'] },
    { ingredientKey: 'coconut_milk', phrases: ['coconut milk', 'coconut cream'], tokens: [], families: [], descriptions: ['canned coconut milk'] },
    { ingredientKey: 'rice', phrases: ['basmati rice', 'long grain rice', 'rice'], tokens: ['rice'], families: ['rice'], descriptions: ['dried white rice'] },
    { ingredientKey: 'cheese', phrases: ['cheddar cheese', 'grated cheese', 'cheese'], tokens: ['cheddar'], families: ['cheese'], descriptions: ['grated hard cheese'] },
    { ingredientKey: 'tomato', phrases: ['chopped tomatoes', 'tomatoes', 'tomato'], tokens: ['tomato', 'tomatoes'], families: ['tomatoes'], descriptions: ['ripe tomatoes'] },
    { ingredientKey: 'pasta', phrases: ['spaghetti', 'pasta'], tokens: ['pasta', 'spaghetti'], families: ['pasta'], descriptions: ['durum wheat pasta'] },
    { ingredientKey: 'chicken', phrases: ['chicken breast', 'chicken'], tokens: ['chicken'], families: ['poultry'], descriptions: ['skinless chicken'] },
    { ingredientKey: 'mushroom', phrases: ['button mushrooms', 'mushrooms', 'mushroom'], tokens: ['mushroom', 'mushrooms'], families: ['mushrooms'], descriptions: ['sliced mushrooms'] },
    { ingredientKey: 'courgette', phrases: ['courgette', 'zucchini'], tokens: ['courgette', 'zucchini'], families: [], descriptions: [] },
  ],
};

const compiled = compileIngredientMappingConfig(CONFIG, RECIPE_KEYS);
const map = (product) => mapProductToIngredient(product, compiled);

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const CONFIDENCE_LABELS = new Set(['exact', 'high', 'medium', 'low', 'none']);

function assertShape(result) {
  assert.ok(['mapped', 'ambiguous', 'unresolved'].includes(result.status));
  assert.ok(CONFIDENCE_LABELS.has(result.confidence), `confidence must be a label, got ${result.confidence}`);
  assert.equal(typeof result.confidence, 'string'); // never a number / probability
  assert.ok(Array.isArray(result.candidates));
  assert.equal(typeof result.reason, 'string');
}

// --- Normalisation ---

test('normaliseProductText: lowercase, whitespace, punctuation', () => {
  assert.equal(normaliseProductText('  Whole   Milk!! '), 'whole milk');
  assert.equal(normaliseProductText('Cheddar-Cheese (Mature)'), 'cheddar cheese mature');
});

test('normaliseProductText: pack quantities and units are removed', () => {
  assert.equal(normaliseProductText('Basmati Rice 1kg'), 'basmati rice');
  assert.equal(normaliseProductText('Milk 2 x 1L'), 'milk');
  assert.equal(normaliseProductText('Chopped Tomatoes 400g'), 'chopped tomatoes');
  assert.equal(normaliseProductText('Eggs 6 Pack'), 'eggs');
});

test('normaliseProductText: brand is removed as whole words only', () => {
  assert.equal(normaliseProductText('BrandX Cheddar Cheese', { brand: 'BrandX' }), 'cheddar cheese');
  assert.equal(normaliseProductText('Cheddar Cheese', { brand: 'BrandX' }), 'cheddar cheese');
  // brand that is a substring of a word must not be stripped
  assert.equal(normaliseProductText('Branded Cheese', { brand: 'Brand' }), 'branded cheese');
});

test('normaliseProductText: accents/diacritics are folded', () => {
  assert.equal(normaliseProductText('Jalapeño Peppers'), 'jalapeno peppers');
  assert.equal(normaliseProductText('Tomàtoes Purée'), 'tomatoes puree');
});

test('normaliseProductText: null / non-string / malformed input is safe', () => {
  for (const bad of [null, undefined, 42, {}, [], NaN, '   ', '!!!']) {
    assert.equal(normaliseProductText(bad), '');
  }
});

test('normaliseProductText: short meaningful food words are kept', () => {
  assert.equal(normaliseProductText('Egg'), 'egg');
  assert.equal(normaliseProductText('Oat Milk'), 'oat milk');
});

// --- Matching ---

test('exact phrase match', () => {
  const r = map({ name: 'Whole Milk' });
  assertShape(r);
  assert.equal(r.status, 'mapped');
  assert.equal(r.ingredientKey, 'milk');
  assert.equal(r.matchedRule, 'exact_phrase');
  assert.equal(r.confidence, 'exact');
  assert.equal(r.matchedText, 'whole milk');
});

test('configured synonym match (phrase appears inside a longer name)', () => {
  const r = map({ name: 'Organic Whole Milk Drink' });
  assert.equal(r.ingredientKey, 'milk');
  assert.equal(r.matchedRule, 'synonym_phrase');
  assert.equal(r.confidence, 'high');
});

test('case differences do not matter', () => {
  for (const name of ['WHOLE MILK', 'whole milk', 'WhOlE mIlK']) {
    assert.equal(map({ name }).ingredientKey, 'milk');
  }
});

test('punctuation does not matter', () => {
  assert.equal(map({ name: 'Cheddar Cheese.' }).ingredientKey, 'cheese');
  assert.equal(map({ name: '**Cheddar / Cheese**' }).ingredientKey, 'cheese');
});

test('quantities and units do not block a match', () => {
  assert.equal(map({ name: 'Spaghetti 500g' }).ingredientKey, 'pasta');
  assert.equal(map({ name: 'Basmati Rice 1kg' }).ingredientKey, 'rice');
  assert.equal(map({ name: 'Milk 2 x 1L' }).ingredientKey, 'milk');
});

test('brand is removed before matching', () => {
  assert.equal(map({ name: 'Brand Cheddar Cheese 200g', brand: 'Brand' }).ingredientKey, 'cheese');
  assert.equal(map({ name: 'Cheddar Cheese', brand: 'SomethingElse' }).ingredientKey, 'cheese');
});

test('phrase precedence: a longer phrase suppresses only overlapping / contained shorter phrases', () => {
  const r = map({ name: 'Coconut Milk 400ml' });
  assert.equal(r.ingredientKey, 'coconut_milk', 'coconut milk must beat contained milk');
  assert.equal(r.status, 'mapped');
  assert.equal(r.matchedText, 'coconut milk');

  // "chopped tomatoes" (2 tokens) beats "tomatoes" (1 token) for the same key.
  const r2 = map({ name: 'Italian Chopped Tomatoes' });
  assert.equal(r2.ingredientKey, 'tomato');
  assert.equal(r2.status, 'mapped');
  assert.equal(r2.matchedText, 'chopped tomatoes');
});

test('non-overlapping phrases for distinct keys remain evidence (ambiguous)', () => {
  const r = map({ name: 'coconut milk and rice' });
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.ingredientKey, null);
  assert.deepEqual(r.candidates.map((c) => c.ingredientKey), ['coconut_milk', 'rice']);

  const r2 = map({ name: 'chicken breast and mushroom' });
  assert.equal(r2.status, 'ambiguous');
  assert.equal(r2.ingredientKey, null);
  assert.deepEqual(r2.candidates.map((c) => c.ingredientKey), ['chicken', 'mushroom']);
});

test('overlapping phrases for the same key do not create false ambiguity', () => {
  const r = map({ name: 'chopped tomatoes' });
  assert.equal(r.status, 'mapped');
  assert.equal(r.ingredientKey, 'tomato');
  assert.deepEqual(r.candidates, []);

  const r2 = map({ name: 'chicken breast' });
  assert.equal(r2.status, 'mapped');
  assert.equal(r2.ingredientKey, 'chicken');
  assert.deepEqual(r2.candidates, []);
});

test('non-overlapping distinct-key matches are deterministic across repeated calls', () => {
  const product = { name: 'coconut milk and rice' };
  const first = map(product);
  const second = map(product);
  assert.deepEqual(first, second);
  assert.deepEqual(first.candidates.map((c) => c.ingredientKey), ['coconut_milk', 'rice']);
});

test('word boundaries are respected ("rice" must not match "price")', () => {
  const r = map({ name: 'Best Price Rice' });
  assert.equal(r.ingredientKey, 'rice');
  assert.equal(r.matchedText, 'rice');
  assert.equal(map({ name: 'Best Price Only' }).status, 'unresolved');
  assert.equal(map({ name: 'Priced Pasta' }).ingredientKey, 'pasta');
});

test('family / category evidence is used only when the name does not resolve', () => {
  const r = map({ name: 'Value Block 200', family: 'Cheese' });
  assert.equal(r.ingredientKey, 'cheese');
  assert.equal(r.matchedRule, 'family_evidence');
  assert.equal(r.confidence, 'low');
});

test('description evidence is the last resort before unresolved', () => {
  const r = map({
    name: 'Kitchen Staple',
    family: 'Ambient Grocery',
    description: 'Dried white rice, ideal for curries and salads',
  });
  assert.equal(r.ingredientKey, 'rice');
  assert.equal(r.matchedRule, 'description_evidence');
  assert.equal(r.confidence, 'low');
});

test('priority order: name beats family beats description', () => {
  // name says pasta, family says cheese, description says rice -> pasta wins
  const r = map({ name: 'Spaghetti', family: 'Cheese', description: 'dried white rice' });
  assert.equal(r.ingredientKey, 'pasta');
  assert.equal(r.matchedRule, 'exact_phrase');
});

test('conflicting evidence at the same level returns ambiguous, never a guess', () => {
  const r = map({ name: 'Chicken and Mushroom' });
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.ingredientKey, null);
  assert.deepEqual(r.candidates.map((c) => c.ingredientKey).sort(), ['chicken', 'mushroom']);
  assert.match(r.reason, /conflicting/);
});

test('unresolved product returns a clear unresolved result', () => {
  const r = map({ name: 'Sparkling Spring Water' });
  assert.equal(r.status, 'unresolved');
  assert.equal(r.ingredientKey, null);
  assert.equal(r.matchedRule, 'none');
  assert.equal(r.confidence, 'none');
});

test('null and malformed products are safe and unresolved', () => {
  for (const bad of [null, undefined, 42, 'string', {}, { name: null }, { name: 123, family: [], description: {} }]) {
    const r = map(bad);
    assertShape(r);
    assert.equal(r.status, 'unresolved');
    assert.equal(r.ingredientKey, null);
  }
});

test('results are deterministic across repeated calls', () => {
  for (const product of [
    { name: 'Whole Milk 1L' },
    { name: 'Chicken and Mushroom' },
    { name: 'Value Block', family: 'Cheese' },
    { name: 'Nothing Here' },
  ]) {
    assert.deepEqual(map(product), map(product));
  }
});

test('mapping does not mutate the product or the compiled config', () => {
  const product = deepFreeze({ name: 'BrandX Whole Milk 1L', brand: 'BrandX', family: 'Dairy', description: 'fresh dairy milk' });
  assert.doesNotThrow(() => mapProductToIngredient(product, deepFreeze({ ...compiled })));
  assert.equal(product.name, 'BrandX Whole Milk 1L');
});

test('compileIngredientMappingConfig does not mutate the config object', () => {
  const cfg = deepFreeze(JSON.parse(JSON.stringify(CONFIG)));
  assert.doesNotThrow(() => compileIngredientMappingConfig(cfg, RECIPE_KEYS));
  assert.equal(cfg.rules[0].ingredientKey, 'milk');
});

test('every rule type maps to a fixed confidence label (not a probability)', () => {
  for (const [rule, label] of Object.entries(CONFIDENCE_BY_RULE)) {
    assert.ok(CONFIDENCE_LABELS.has(label), `${rule} -> ${label}`);
  }
});

test('createIngredientMapper binds a compiled config', () => {
  const mapper = createIngredientMapper(compiled);
  assert.equal(mapper({ name: 'Spaghetti' }).ingredientKey, 'pasta');
});

test('mapProductToIngredient rejects a missing / bad compiled config', () => {
  assert.throws(() => mapProductToIngredient({ name: 'Milk' }, null), TypeError);
  assert.throws(() => mapProductToIngredient({ name: 'Milk' }, {}), TypeError);
});

// --- Configuration integrity ---

test('valid configuration passes validation', () => {
  const { valid, errors } = validateIngredientMappingConfig(CONFIG, RECIPE_KEYS);
  assert.equal(valid, true, JSON.stringify(errors, null, 2));
});

test('rejects a configuration that is not { rules: [...] }', () => {
  for (const bad of [null, 42, {}, { rules: 'x' }, []]) {
    assert.equal(validateIngredientMappingConfig(bad, RECIPE_KEYS).valid, false);
  }
});

test('rejects a rule with a missing or malformed ingredientKey', () => {
  const codes = (cfg) => validateIngredientMappingConfig(cfg, RECIPE_KEYS).errors.map((e) => e.code);
  assert.ok(codes({ rules: [{ phrases: ['milk'] }] }).includes('MISSING_INGREDIENT_KEY'));
  assert.ok(codes({ rules: [{ ingredientKey: 'Bad Key', phrases: ['x'] }] }).includes('INVALID_INGREDIENT_KEY_FORMAT'));
  assert.ok(codes({ rules: ['nope'] }).includes('INVALID_RULE_SHAPE'));
});

test('rejects an ingredient key that no recipe in the dataset uses', () => {
  const { valid, errors } = validateIngredientMappingConfig(
    { rules: [{ ingredientKey: 'unicorn_meat', phrases: ['unicorn'] }] },
    RECIPE_KEYS,
  );
  assert.equal(valid, false);
  const issue = errors.find((e) => e.code === 'UNKNOWN_INGREDIENT_KEY');
  assert.ok(issue);
  assert.equal(issue.ingredientKey, 'unicorn_meat');
});

test('rejects a rule with no usable evidence', () => {
  const codes = validateIngredientMappingConfig(
    { rules: [{ ingredientKey: 'milk', phrases: [], tokens: [], families: [], descriptions: [] }] },
    RECIPE_KEYS,
  ).errors.map((e) => e.code);
  assert.ok(codes.includes('EMPTY_RULE'));
});

test('rejects a multi-word token', () => {
  const codes = validateIngredientMappingConfig(
    { rules: [{ ingredientKey: 'milk', tokens: ['whole milk'] }] },
    RECIPE_KEYS,
  ).errors.map((e) => e.code);
  assert.ok(codes.includes('INVALID_TOKEN'));
});

test('rejects two equal-priority rules that map the same text to different keys', () => {
  const { valid, errors } = validateIngredientMappingConfig(
    {
      rules: [
        { ingredientKey: 'milk', phrases: ['milk'] },
        { ingredientKey: 'rice', phrases: ['milk'] },
      ],
    },
    RECIPE_KEYS,
  );
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.code === 'CONFLICTING_RULE_ENTRY'));
});

test('rejects a duplicated rule entry for the same key', () => {
  const codes = validateIngredientMappingConfig(
    { rules: [{ ingredientKey: 'milk', phrases: ['milk', 'milk'] }] },
    RECIPE_KEYS,
  ).errors.map((e) => e.code);
  assert.ok(codes.includes('DUPLICATE_RULE_ENTRY'));
});

test('compileIngredientMappingConfig throws for an invalid configuration', () => {
  assert.throws(
    () => compileIngredientMappingConfig({ rules: [{ ingredientKey: 'ghost', phrases: ['x'] }] }, RECIPE_KEYS),
    /failed validation/,
  );
});

// --- Multilingual / accented synthetic examples ---

test('generic multilingual / accented synthetic examples', () => {
  assert.equal(map({ name: 'Zucchini' }).ingredientKey, 'courgette'); // US term -> courgette synonym
  assert.equal(map({ name: 'Jalapeño Rice' }).ingredientKey, 'rice'); // accent folded, boundary respected
  assert.equal(map({ name: 'Tomàtoes' }).ingredientKey, 'tomato');
});

// --- The shipped configuration ---

test('the shipped ingredient mapping configuration loads and validates', () => {
  const parsed = readShippedConfigForTest();
  const result = validateIngredientMappingConfig(parsed, collectRecipeIngredientKeys());
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));

  const compiledShipped = loadIngredientMappingConfig({ force: true });
  assert.ok(compiledShipped.phrases.length > 0);
  assert.ok(compiledShipped.recipeKeys.size >= 8);
});

test('the shipped configuration maps representative synthetic products', () => {
  const mapper = createIngredientMapper(loadIngredientMappingConfig({ force: true }));
  assert.equal(mapper({ name: 'Spaghetti 500g' }).ingredientKey, 'pasta');
  assert.equal(mapper({ name: 'Smooth Peanut Butter 330g' }).ingredientKey, 'peanut_butter');
  assert.equal(mapper({ name: 'Whole Milk 2L' }).ingredientKey, 'milk');
  assert.equal(mapper({ name: 'Best Price Long Grain Rice' }).ingredientKey, 'rice');
  assert.equal(mapper({ name: 'Totally Unknown Item' }).status, 'unresolved');
});

test('shipped config: peanut butter maps to peanut_butter (contained butter is suppressed)', () => {
  const mapper = createIngredientMapper(loadIngredientMappingConfig({ force: true }));
  const r = mapper({ name: 'peanut butter' });
  assert.equal(r.status, 'mapped');
  assert.equal(r.ingredientKey, 'peanut_butter');
  assert.deepEqual(r.candidates, []);
});

test('shipped config: peanut butter and rice is ambiguous (peanut_butter, rice)', () => {
  const mapper = createIngredientMapper(loadIngredientMappingConfig({ force: true }));
  const r = mapper({ name: 'peanut butter and rice' });
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.ingredientKey, null);
  assert.deepEqual(r.candidates.map((c) => c.ingredientKey), ['peanut_butter', 'rice']);
});

test('shipped config: cheddar cheese and mushroom is ambiguous (cheese, mushroom)', () => {
  const mapper = createIngredientMapper(loadIngredientMappingConfig({ force: true }));
  const r = mapper({ name: 'cheddar cheese and mushroom' });
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.ingredientKey, null);
  assert.deepEqual(r.candidates.map((c) => c.ingredientKey), ['cheese', 'mushroom']);
});

test('shipped config: tomato and olive oil is ambiguous (olive_oil, tomato)', () => {
  const mapper = createIngredientMapper(loadIngredientMappingConfig({ force: true }));
  const r = mapper({ name: 'tomato and olive oil' });
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.ingredientKey, null);
  assert.deepEqual(r.candidates.map((c) => c.ingredientKey), ['olive_oil', 'tomato']);
});

test('shipped config: overlapping same-key phrases do not create false ambiguity', () => {
  const mapper = createIngredientMapper(loadIngredientMappingConfig({ force: true }));
  const r = mapper({ name: 'extra virgin olive oil' });
  assert.equal(r.status, 'mapped');
  assert.equal(r.ingredientKey, 'olive_oil');
  assert.deepEqual(r.candidates, []);
});

test('shipped config: non-overlapping multi-key results are identical on repeated calls', () => {
  const mapper = createIngredientMapper(loadIngredientMappingConfig({ force: true }));
  const product = { name: 'tomato and olive oil' };
  const first = mapper(product);
  const second = mapper(product);
  assert.deepEqual(first, second);
  assert.deepEqual(first.candidates.map((c) => c.ingredientKey), ['olive_oil', 'tomato']);
});

test('every configured ingredient key exists in a recipe requirement or alternative group', () => {
  const recipeKeys = collectRecipeIngredientKeys();
  const parsed = readShippedConfigForTest();
  for (const rule of parsed.rules) {
    assert.ok(recipeKeys.has(rule.ingredientKey), `config key "${rule.ingredientKey}" is not used by any recipe`);
  }
});

test('every shipped recipe alternative has a configured ingredient mapping', () => {
  const configuredKeys = new Set(readShippedConfigForTest().rules.map((rule) => rule.ingredientKey));
  const recipes = loadRecipeDataset({ force: true });
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      for (const alternative of ingredient.anyOfKeys ?? []) {
        assert.ok(
          configuredKeys.has(alternative),
          `recipe "${recipe.id}" alternative "${alternative}" has no mapping rule`,
        );
      }
    }
  }
});

// --- French product names (made-up examples, no real brands) ---

const shippedMapper = createIngredientMapper(loadIngredientMappingConfig({ force: true }));

test('normalisation: Latin ligatures are transliterated before ASCII cleanup', () => {
  assert.equal(normaliseProductText('Œufs'), 'oeufs');       // Œufs
  assert.equal(normaliseProductText('œuf'), 'oeuf');         // œuf
  assert.equal(normaliseProductText('Bœuf Haché'), 'boeuf hache'); // Bœuf Haché
  assert.equal(normaliseProductText('Æsir'), 'aesir');       // Æsir
  assert.equal(normaliseProductText('Tæl'), 'tael');         // Tæl
});

test('normalisation: ordinary accents still fold (regression guard)', () => {
  assert.equal(normaliseProductText('boîte'), 'boite');            // boîte
  assert.equal(normaliseProductText('concentré'), 'concentre');    // concentré
  assert.equal(normaliseProductText('pâtissière'), 'patissiere'); // pâtissière
});

test('FR: BOITE DE 06 OEUFS ...-shaped generic text maps to egg', () => {
  const r = shippedMapper({
    name: 'BOITE DE 06 OEUFS JAUNE ORANGE',
    family: 'VOLAILLE',
  });
  assertShape(r);
  assert.equal(r.status, 'mapped');
  assert.equal(r.ingredientKey, 'egg');
  assert.ok(['synonym_phrase', 'name_token', 'exact_phrase'].includes(r.matchedRule));
});

test('FR: "Boîte de 6 œufs" (ligature + accent + count) maps to egg', () => {
  const r = shippedMapper({ name: 'Boîte de 6 œufs' });
  assert.equal(r.status, 'mapped');
  assert.equal(r.ingredientKey, 'egg');
});

test('FR: uppercase / lowercase / mixed case are equivalent for egg', () => {
  for (const name of ['OEUFS FRAIS', 'oeufs frais', 'OeUfS fRaIs', 'ŒUFS', 'œufs']) {
    assert.equal(shippedMapper({ name }).ingredientKey, 'egg', name);
  }
});

test('FR: brand token and packaging nouns do not prevent a valid match', () => {
  // Generic invented brand token + packaging noun around a real food word.
  assert.equal(
    shippedMapper({ name: 'BrandCo BOITE 6 OEUFS', brand: 'BrandCo' }).ingredientKey,
    'egg',
  );
  assert.equal(
    shippedMapper({ name: 'PAQUET FARINE PATISSIERE 1 KG', brand: 'BrandCo' }).ingredientKey,
    'flour',
  );
  assert.equal(
    shippedMapper({ name: 'BOUTEILLE HUILE D OLIVE EXTRA VIERGE 500 ML' }).ingredientKey,
    'olive_oil',
  );
});

test('FR: every audited curated Food product resolves to its canonical key', () => {
  // Generic reconstructions of the 15 curated Food products (no company brands).
  const cases = [
    ['SPAGHETTI 500 GR', 'PATES', 'pasta'],
    ['PENNE RIGATE 500 GR', 'PATES', 'pasta'],
    ['RIZ 1KG', 'RIZ', 'rice'],
    ['DOUBLE CONCENTRE DE TOMATE 1/6', 'CONSERVES', 'tomato'],
    ['HUILE D OLIVE EXTRA VIERGE 500 ML PET', 'HUILES', 'olive_oil'],
    ['THON HV 85 GR', 'CONSERVES', 'canned_tuna'],
    ['POIS CHICHES CUITS 400 GR', 'CONSERVES', 'chickpeas'],
    ['LAIT UHT ENTIER 1 L', 'LAITERIE', 'milk'],
    ['BEURRE 100 GR', 'LAITERIE', 'butter'],
    ['CHEDDAR RAPE 120 G', 'FROMAGERIE', 'cheese'],
    ['MOZZARELLA RAPEE 110 GR', 'FROMAGERIE', 'mozzarella'],
    ['PARMIGIANO REGGIANO 100G', 'FROMAGERIE', 'parmesan'],
    ['FARINE PATISSIERE 1 KG', 'PATISSERIE', 'flour'],
    ['SUCRE POUDRE 1KG', 'EPICES', 'sugar'],
    ['BOITE DE 06 OEUFS JAUNE ORANGE', 'VOLAILLE', 'egg'],
  ];
  for (const [name, family, expected] of cases) {
    const r = shippedMapper({ name, family });
    assert.equal(r.status, 'mapped', `${name} -> ${r.status}`);
    assert.equal(r.ingredientKey, expected, `${name} -> ${r.ingredientKey}`);
  }
});

test('FR: representative Household / Personal-care / Drink / Other names never map', () => {
  const nonFood = [
    'LESSIVE MACHINE 500 GR',
    'LIQUIDE VAISSELLE ANTIBACTERIEN 580 ML',
    'JAVEL CLASSIC 1.5 L',
    'EPONGE COLOR',
    'SAC POUBELLE 50X65 MM',
    'PAPIER HYGIENIQUE 4 ROULEAUX',
    'SHAMPOOING ARGAN JOJOBA 350 ML',
    'SAVON 200 G',
    'DENTIFRICE MENTHOL FRESH 50 ML',
    'DEODORANT BILLE 50 ML',
    'EAU MINERALE 1.5 L',
    'COLA 0.5 L',
    'CIDRE 0.5 L',
    'JUS ORANGE 1 L',
    'CAFE MELANGE FILTRE 125 GR',
    'PAPIER ALUMINIUM 8 M',
    'FILM ALIMENTAIRE 8M',
    'PILE BOUTON CR2032 LITHIUM',
  ];
  for (const name of nonFood) {
    const r = shippedMapper({ name });
    assert.equal(r.status, 'unresolved', `${name} unexpectedly ${r.status} -> ${r.ingredientKey}`);
    assert.equal(r.ingredientKey, null);
  }
});

test('FR: multi-ingredient products stay ambiguous, never a guess', () => {
  const riceMilk = shippedMapper({ name: 'RIZ AU LAIT' });
  assert.equal(riceMilk.status, 'ambiguous');
  assert.deepEqual(riceMilk.candidates.map((c) => c.ingredientKey).sort(), ['milk', 'rice']);

  const flourChickpea = shippedMapper({ name: 'FARINE DE POIS CHICHE' });
  assert.equal(flourChickpea.status, 'ambiguous');
  assert.deepEqual(flourChickpea.candidates.map((c) => c.ingredientKey).sort(), ['chickpeas', 'flour']);

  const mayoEgg = shippedMapper({ name: 'MAYONNAISE AUX OEUFS FRAIS' });
  assert.equal(mayoEgg.status, 'ambiguous');
  assert.deepEqual(mayoEgg.candidates.map((c) => c.ingredientKey).sort(), ['egg', 'mayonnaise']);
});

test('FR: unrelated / unrecognised food remains unresolved (no invented mapping)', () => {
  for (const name of ['HARISSA 135 GR', 'OLIVES VERTES ENTIERES 350 GR', 'CONFITURE FRAISE 350 GR', 'CAFE MOULU 250 GR']) {
    const r = shippedMapper({ name });
    assert.equal(r.status, 'unresolved', `${name} -> ${r.status}`);
  }
});

test('EN: existing English mappings are unchanged by the FR additions', () => {
  const cases = [
    ['Free Range Eggs 6 Pack', 'egg'],
    ['Large Eggs', 'egg'],
    ['Whole Milk 2L', 'milk'],
    ['Best Price Long Grain Rice', 'rice'],
    ['Spaghetti 500g', 'pasta'],
    ['Extra Virgin Olive Oil 500ml', 'olive_oil'],
    ['Smooth Peanut Butter', 'peanut_butter'],
    ['Chickpeas 400g', 'chickpeas'],
    ['Tinned Tuna in Brine', 'canned_tuna'],
    ['Plain Flour 1kg', 'flour'],
    ['Caster Sugar 1kg', 'sugar'],
    ['Unsalted Butter 250g', 'butter'],
    ['Chopped Tomatoes 400g', 'tomato'],
  ];
  for (const [name, expected] of cases) {
    assert.equal(shippedMapper({ name }).ingredientKey, expected, name);
  }
  assert.equal(shippedMapper({ name: 'Totally Unknown Item' }).status, 'unresolved');
  // Distinct-key English phrases still produce the documented ambiguity.
  const r = shippedMapper({ name: 'tomato and olive oil' });
  assert.equal(r.status, 'ambiguous');
  assert.deepEqual(r.candidates.map((c) => c.ingredientKey), ['olive_oil', 'tomato']);
});

test('the shipped configuration has no conflicting or duplicate rule entries', () => {
  const parsed = readShippedConfigForTest();
  const { valid, errors } = validateIngredientMappingConfig(parsed, collectRecipeIngredientKeys());
  assert.equal(valid, true, JSON.stringify(errors, null, 2));
  assert.equal(errors.filter((e) => e.code === 'CONFLICTING_RULE_ENTRY').length, 0);
  assert.equal(errors.filter((e) => e.code === 'DUPLICATE_RULE_ENTRY').length, 0);
});
