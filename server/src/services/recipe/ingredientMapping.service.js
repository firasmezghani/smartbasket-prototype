// Maps a product to at most one recipe ingredient, or `ambiguous` / `unresolved` when unsure.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadRecipeDataset, INGREDIENT_KEY_PATTERN, isPlainObject } from './recipeDataset.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));

// Absolute path to the repository-owned mapping configuration.
export const INGREDIENT_MAPPING_CONFIG_PATH = join(moduleDir, '../../data/recipes/ingredientMappings.json');

export const INGREDIENT_MAPPING_SCHEMA_VERSION = 1;

// Packaging and marketing words removed before matching.
export const DEFAULT_PACKAGING_TERMS = Object.freeze([
  'pack', 'packs', 'multipack', 'bottle', 'bottles', 'jar', 'jars', 'bag', 'bags',
  'box', 'carton', 'punnet', 'pouch', 'tub', 'loose', 'value', 'finest', 'basics',
  'everyday', 'selected', 'pm', 'pmp',
]);

// Matching levels, tried in this order until one gives a result.
export const MATCH_RULES = Object.freeze([
  'exact_phrase',        // whole normalised product name equals a configured phrase
  'synonym_phrase',      // a configured phrase occurs as whole words inside the name (overlap-aware)
  'name_token',          // a configured significant single word occurs in the name
  'family_evidence',     // a configured phrase occurs in the family / category
  'description_evidence',// a configured phrase occurs in the description
  'none',
]);

// Fixed confidence label per rule, not a probability.
export const CONFIDENCE_BY_RULE = Object.freeze({
  exact_phrase: 'exact',
  synonym_phrase: 'high',
  name_token: 'medium',
  family_evidence: 'low',
  description_evidence: 'low',
  none: 'none',
});

// --- Normalisation ---

// Ligatures that must be replaced first (e.g. `Œufs` -> `oeufs`), otherwise
// they would be removed as punctuation.
export const LATIN_LIGATURE_TRANSLITERATIONS = Object.freeze({
  '\u0153': 'oe', // œ
  '\u0152': 'oe', // Œ
  '\u00e6': 'ae', // æ
  '\u00c6': 'ae', // Æ
});

const LIGATURE_PATTERN = /[\u0152\u0153\u00c6\u00e6]/g;

export function transliterateLigatures(text) {
  return text.replace(LIGATURE_PATTERN, (ch) => LATIN_LIGATURE_TRANSLITERATIONS[ch] ?? ch);
}

function stripDiacritics(text) {
  // Replace ligatures first (NFKD leaves œ and æ as they are).
  const delig = transliterateLigatures(text);
  // Then remove accents (boîte -> boite).
  return delig.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

const QUANTITY_PATTERNS = [
  /\b\d+\s?x\b/gi, // "4 x", "4x"
  /\bx\s?\d+\b/gi, // "x 6", "x6"
  /\b\d+(?:[.,]\d+)?\s?(?:g|kg|mg|ml|cl|l|ltr|litre|litres|gram|grams|kilo|kilos|pk|pcs|pc|ct|s)\b/gi,
  /\b\d+(?:[.,]\d+)?\b/g, // any remaining bare number
];

function coerceString(value) {
  return typeof value === 'string' ? value : '';
}

function tokenise(normalised) {
  return normalised ? normalised.split(' ').filter(Boolean) : [];
}

// Normalise product text to lower-case tokens without punctuation or quantities.
export function normaliseProductText(text, options = {}) {
  const raw = coerceString(text);
  if (raw.trim() === '') return '';

  const packaging =
    options.packagingTerms instanceof Set
      ? options.packagingTerms
      : new Set([...(options.packagingTerms ?? []), ...DEFAULT_PACKAGING_TERMS]);

  let s = stripDiacritics(raw).toLowerCase();
  s = s.replace(/[^a-z0-9\s]+/g, ' ');
  s = ` ${s.replace(/\s+/g, ' ').trim()} `;

  // Remove the brand (as whole words) when it appears in the text.
  const brand = coerceString(options.brand);
  if (brand.trim() !== '') {
    const brandTokens = tokenise(stripDiacritics(brand).toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim());
    if (brandTokens.length > 0) {
      const tokens = tokenise(s);
      const out = [];
      let i = 0;
      let removed = false;
      while (i < tokens.length) {
        if (!removed && isSliceAt(tokens, brandTokens, i)) {
          i += brandTokens.length;
          removed = true;
        } else {
          out.push(tokens[i]);
          i += 1;
        }
      }
      s = ` ${out.join(' ')} `;
    }
  }

  for (const pattern of QUANTITY_PATTERNS) {
    s = s.replace(pattern, ' ');
  }

  const tokens = tokenise(s.replace(/\s+/g, ' ').trim())
    .filter((tok) => tok.length > 1)
    .filter((tok) => !packaging.has(tok));

  return tokens.join(' ');
}

function isSliceAt(haystack, needle, start) {
  if (start + needle.length > haystack.length) return false;
  for (let k = 0; k < needle.length; k += 1) {
    if (haystack[start + k] !== needle[k]) return false;
  }
  return true;
}

function findSliceStarts(haystackTokens, needleTokens) {
  const starts = [];
  if (needleTokens.length === 0 || needleTokens.length > haystackTokens.length) return starts;
  for (let i = 0; i + needleTokens.length <= haystackTokens.length; i += 1) {
    if (isSliceAt(haystackTokens, needleTokens, i)) starts.push(i);
  }
  return starts;
}

function spansOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

// --- Configuration ---

// Validate the mapping configuration against the recipe ingredient keys.
export function validateIngredientMappingConfig(config, recipeKeys) {
  const keys = recipeKeys instanceof Set ? recipeKeys : new Set(recipeKeys ?? []);
  const errors = [];
  const add = (code, message, ruleIndex = -1, ingredientKey = null, field = null) =>
    errors.push({ code, message, ruleIndex, ingredientKey, field });

  let rules;
  if (isPlainObject(config) && Array.isArray(config.rules)) {
    rules = config.rules;
    if (config.$schemaVersion !== undefined && config.$schemaVersion !== INGREDIENT_MAPPING_SCHEMA_VERSION) {
      add('UNSUPPORTED_SCHEMA_VERSION', `Unsupported $schemaVersion ${JSON.stringify(config.$schemaVersion)}; expected ${INGREDIENT_MAPPING_SCHEMA_VERSION}.`, -1, null, '$schemaVersion');
    }
    if (config.packagingTerms !== undefined) {
      if (!Array.isArray(config.packagingTerms) || config.packagingTerms.some((t) => typeof t !== 'string' || t.trim() === '')) {
        add('INVALID_PACKAGING_TERM', 'packagingTerms must be an array of non-blank strings.', -1, null, 'packagingTerms');
      }
    }
  } else {
    add('INVALID_CONFIG_SHAPE', 'Configuration must be an object with a "rules" array.');
    return { valid: false, errors };
  }

  if (rules.length === 0) {
    add('EMPTY_CONFIG', 'Configuration has no rules.', -1, null, 'rules');
  }

  // Track phrase/token/family/description -> Set(keys) to detect conflicts and duplicates.
  const seen = { phrases: new Map(), tokens: new Map(), families: new Map(), descriptions: new Map() };
  const record = (bucket, text, key, ruleIndex) => {
    const map = seen[bucket];
    if (!map.has(text)) {
      map.set(text, new Set([key]));
      return;
    }
    const set = map.get(text);
    if (set.has(key)) {
      add('DUPLICATE_RULE_ENTRY', `"${text}" is listed more than once for ingredient "${key}" (${bucket}).`, ruleIndex, key, bucket);
    } else {
      set.add(key);
      add(
        'CONFLICTING_RULE_ENTRY',
        `"${text}" maps to more than one ingredient key (${[...set].sort().join(', ')}) via ${bucket}; equal-priority rules must not disagree.`,
        ruleIndex,
        key,
        bucket,
      );
    }
  };

  rules.forEach((rule, ruleIndex) => {
    if (!isPlainObject(rule)) {
      add('INVALID_RULE_SHAPE', `Rule at index ${ruleIndex} is not an object.`, ruleIndex);
      return;
    }
    const key = typeof rule.ingredientKey === 'string' ? rule.ingredientKey.trim() : '';
    if (key === '') {
      add('MISSING_INGREDIENT_KEY', `Rule at index ${ruleIndex} has no ingredientKey.`, ruleIndex, null, 'ingredientKey');
    } else if (!INGREDIENT_KEY_PATTERN.test(key)) {
      add('INVALID_INGREDIENT_KEY_FORMAT', `Rule "${key}" (index ${ruleIndex}) ingredientKey must match ${INGREDIENT_KEY_PATTERN}.`, ruleIndex, key, 'ingredientKey');
    } else if (!keys.has(key)) {
      add(
        'UNKNOWN_INGREDIENT_KEY',
        `Rule "${key}" (index ${ruleIndex}) maps to an ingredient key that no recipe in recipes.json uses.`,
        ruleIndex,
        key,
        'ingredientKey',
      );
    }

    const buckets = ['phrases', 'tokens', 'families', 'descriptions'];
    let anyEvidence = false;
    for (const bucket of buckets) {
      const list = rule[bucket];
      if (list === undefined) continue;
      if (!Array.isArray(list)) {
        add('INVALID_RULE_FIELD', `Rule "${key || ruleIndex}" ${bucket} must be an array.`, ruleIndex, key || null, bucket);
        continue;
      }
      list.forEach((entry, entryIndex) => {
        if (typeof entry !== 'string' || entry.trim() === '') {
          add('INVALID_RULE_ENTRY', `Rule "${key || ruleIndex}" ${bucket}[${entryIndex}] must be a non-blank string.`, ruleIndex, key || null, `${bucket}[${entryIndex}]`);
          return;
        }
        const normalised = normaliseProductText(entry);
        if (normalised === '') {
          add('INVALID_RULE_ENTRY', `Rule "${key || ruleIndex}" ${bucket}[${entryIndex}] ("${entry}") normalises to empty text.`, ruleIndex, key || null, `${bucket}[${entryIndex}]`);
          return;
        }
        if (bucket === 'tokens' && normalised.includes(' ')) {
          add('INVALID_TOKEN', `Rule "${key || ruleIndex}" tokens[${entryIndex}] ("${entry}") must be a single word.`, ruleIndex, key || null, `tokens[${entryIndex}]`);
          return;
        }
        anyEvidence = true;
        if (key !== '') record(bucket, normalised, key, ruleIndex);
      });
    }

    if (!anyEvidence && key !== '') {
      add('EMPTY_RULE', `Rule "${key}" (index ${ruleIndex}) has no usable phrases, tokens, families or descriptions.`, ruleIndex, key, null);
    }
  });

  return { valid: errors.length === 0, errors };
}

function entriesToCompiled(list) {
  return (list ?? [])
    .map((text) => normaliseProductText(text))
    .filter((text) => text !== '')
    .map((text) => ({ text, tokens: tokenise(text) }));
}

function sortCompiled(items) {
  // Longest / most specific phrase first, then stable alphabetical order.
  return items.sort((a, b) => {
    if (b.tokens.length !== a.tokens.length) return b.tokens.length - a.tokens.length;
    if (b.text.length !== a.text.length) return b.text.length - a.text.length;
    if (a.text !== b.text) return a.text < b.text ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

// Compile a validated configuration into lookup structures (throws if invalid).
export function compileIngredientMappingConfig(config, recipeKeys) {
  const keys = recipeKeys instanceof Set ? recipeKeys : new Set(recipeKeys ?? []);
  const { valid, errors } = validateIngredientMappingConfig(config, keys);
  if (!valid) {
    const preview = errors.slice(0, 10).map((e) => `  [${e.code}] ${e.message}`).join('\n');
    const more = errors.length > 10 ? `\n  …and ${errors.length - 10} more` : '';
    throw new Error(`Ingredient mapping configuration failed validation (${errors.length} issue(s)):\n${preview}${more}`);
  }

  const packagingTerms = new Set([...(config.packagingTerms ?? []).map((t) => t.toLowerCase()), ...DEFAULT_PACKAGING_TERMS]);

  const phrases = [];
  const tokensMap = new Map(); // token -> Set(key)
  const families = [];
  const descriptions = [];

  for (const rule of config.rules) {
    const key = rule.ingredientKey.trim();

    for (const item of entriesToCompiled(rule.phrases)) {
      phrases.push({ key, ...item });
      descriptions.push({ key, ...item }); // phrases are also usable as description evidence
    }
    for (const tokenText of (rule.tokens ?? [])) {
      const t = normaliseProductText(tokenText);
      if (t === '' || t.includes(' ')) continue;
      if (!tokensMap.has(t)) tokensMap.set(t, new Set());
      tokensMap.get(t).add(key);
    }
    for (const item of entriesToCompiled(rule.families)) {
      families.push({ key, ...item });
    }
    for (const item of entriesToCompiled(rule.descriptions)) {
      descriptions.push({ key, ...item });
    }
  }

  // De-duplicate description entries (phrase may appear twice for the same key).
  const descSeen = new Set();
  const dedupedDescriptions = [];
  for (const item of descriptions) {
    const sig = `${item.key}::${item.text}`;
    if (descSeen.has(sig)) continue;
    descSeen.add(sig);
    dedupedDescriptions.push(item);
  }

  return {
    packagingTerms,
    recipeKeys: keys,
    phrases: sortCompiled(phrases),
    tokens: tokensMap,
    families: sortCompiled(families),
    descriptions: sortCompiled(dedupedDescriptions),
  };
}

let cachedCompiled = null;

// Load, validate and cache the mapping configuration.
export function loadIngredientMappingConfig(options = {}) {
  const { force = false, path = INGREDIENT_MAPPING_CONFIG_PATH } = options;
  if (cachedCompiled && !force && path === INGREDIENT_MAPPING_CONFIG_PATH) return cachedCompiled;

  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(`Could not read ingredient mapping config at ${path}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Ingredient mapping config at ${path} is not valid JSON: ${err.message}`);
  }

  const recipeKeys = collectRecipeIngredientKeys();
  const compiled = compileIngredientMappingConfig(parsed, recipeKeys);
  if (path === INGREDIENT_MAPPING_CONFIG_PATH) cachedCompiled = compiled;
  return compiled;
}

// Read the mapping configuration file without validating it (for tests).
export function readShippedConfigForTest(path = INGREDIENT_MAPPING_CONFIG_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Canonical ingredient keys declared by recipe requirements or their alternatives.
export function collectRecipeIngredientKeys() {
  const recipes = loadRecipeDataset();
  const set = new Set();
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      set.add(String(ingredient.key).trim().toLowerCase());
      for (const alternative of ingredient.anyOfKeys ?? []) {
        set.add(String(alternative).trim().toLowerCase());
      }
    }
  }
  return set;
}

// --- Mapping ---

function decide(matches, rule, fallbackText) {
  // matches: [{ key, text }]
  const byKey = new Map();
  for (const m of matches) {
    if (!byKey.has(m.key)) byKey.set(m.key, m.text);
  }
  const distinct = [...byKey.keys()].sort();
  if (distinct.length === 0) return null;
  if (distinct.length === 1) {
    return {
      ingredientKey: distinct[0],
      status: 'mapped',
      confidence: CONFIDENCE_BY_RULE[rule],
      matchedRule: rule,
      matchedText: byKey.get(distinct[0]) ?? fallbackText ?? null,
      candidates: [],
      reason: `${rule.replace(/_/g, ' ')} match on "${byKey.get(distinct[0]) ?? fallbackText}"`,
    };
  }
  return {
    ingredientKey: null,
    status: 'ambiguous',
    confidence: CONFIDENCE_BY_RULE[rule],
    matchedRule: rule,
    matchedText: null,
    candidates: distinct.map((key) => ({ ingredientKey: key, matchedRule: rule, matchedText: byKey.get(key) })),
    reason: `conflicting ${rule.replace(/_/g, ' ')} evidence for: ${distinct.join(', ')}`,
  };
}

// Find configured phrases in the product text. A longer phrase hides a shorter
// overlapping one (`coconut milk` hides `milk`); separate matches are kept.
function longestPhraseMatches(compiledList, haystackTokens) {
  const occurrences = [];
  for (const phrase of compiledList) {
    for (const start of findSliceStarts(haystackTokens, phrase.tokens)) {
      occurrences.push({
        key: phrase.key,
        text: phrase.text,
        start,
        end: start + phrase.tokens.length,
        length: phrase.tokens.length,
      });
    }
  }
  if (occurrences.length === 0) return [];

  // Longer first so they can suppress shorter overlapping/contained spans.
  occurrences.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    if (a.start !== b.start) return a.start - b.start;
    if (a.text !== b.text) return a.text < b.text ? -1 : 1;
    if (a.key < b.key) return -1;
    if (a.key > b.key) return 1;
    return 0;
  });

  const kept = [];
  for (const occ of occurrences) {
    const suppressed = kept.some((winner) => winner.length > occ.length && spansOverlap(winner, occ));
    if (!suppressed) kept.push(occ);
  }

  // Prefer the most specific (longest) text per key when `decide()` first-sees it.
  kept.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    if (a.text !== b.text) return a.text < b.text ? -1 : 1;
    if (a.key < b.key) return -1;
    if (a.key > b.key) return 1;
    return 0;
  });

  return kept.map((occ) => ({ key: occ.key, text: occ.text }));
}

const UNRESOLVED = Object.freeze({
  ingredientKey: null,
  status: 'unresolved',
  confidence: 'none',
  matchedRule: 'none',
  matchedText: null,
  candidates: [],
  reason: 'no configured rule matched the product name, family or description',
});

// Map one product to at most one ingredient key.
export function mapProductToIngredient(product, compiled) {
  if (!compiled || !Array.isArray(compiled.phrases) || !(compiled.tokens instanceof Map)) {
    throw new TypeError('mapProductToIngredient: a compiled configuration is required.');
  }
  const source = isPlainObject(product) ? product : {};
  const packagingTerms = compiled.packagingTerms;

  const brand = source.brand;
  const name = normaliseProductText(source.name, { brand, packagingTerms });
  const familyRaw = source.family ?? source.category ?? source.familyName;
  const family = normaliseProductText(familyRaw, { packagingTerms });
  const description = normaliseProductText(source.description, { brand, packagingTerms });

  if (name === '' && family === '' && description === '') {
    return { ...UNRESOLVED, reason: 'product has no usable name, family or description' };
  }

  const nameTokens = tokenise(name);
  const familyTokens = tokenise(family);
  const descriptionTokens = tokenise(description);

  // Level 1: exact phrase (whole normalised name equals a configured phrase).
  if (nameTokens.length > 0) {
    const exact = compiled.phrases
      .filter((p) => p.text === name)
      .map((p) => ({ key: p.key, text: p.text }));
    const r1 = decide(exact, 'exact_phrase', name);
    if (r1) return r1;
  }

  // Level 2: synonym phrase (configured phrase appears as whole words in the name).
  // A longer phrase suppresses a shorter one only when their token spans overlap.
  if (nameTokens.length > 0) {
    const r2 = decide(longestPhraseMatches(compiled.phrases, nameTokens), 'synonym_phrase', null);
    if (r2) return r2;
  }

  // Level 3: significant single word in the name.
  if (nameTokens.length > 0) {
    const tokenMatches = [];
    for (const tok of nameTokens) {
      const keys = compiled.tokens.get(tok);
      if (keys) {
        for (const key of keys) tokenMatches.push({ key, text: tok });
      }
    }
    const r3 = decide(tokenMatches, 'name_token', null);
    if (r3) return r3;
  }

  // Level 4: family / category evidence.
  if (familyTokens.length > 0) {
    const r4 = decide(longestPhraseMatches(compiled.families, familyTokens), 'family_evidence', null);
    if (r4) return r4;
  }

  // Level 5: description evidence.
  if (descriptionTokens.length > 0) {
    const r5 = decide(longestPhraseMatches(compiled.descriptions, descriptionTokens), 'description_evidence', null);
    if (r5) return r5;
  }

  return { ...UNRESOLVED };
}

// Create a mapper function using the given (or default) configuration.
export function createIngredientMapper(compiled = loadIngredientMappingConfig()) {
  return (product) => mapProductToIngredient(product, compiled);
}
