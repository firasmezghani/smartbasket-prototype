// Applies the French recipe text (recipes.fr.json) to results; the ranking is unchanged.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { RECIPE_LIMITS, isPlainObject } from './recipeDataset.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));

// The only languages the recipe API accepts.
export const SUPPORTED_RECIPE_LANGUAGES = Object.freeze(['en', 'fr']);

// Served straight from `recipes.json`, no overlay.
export const DEFAULT_RECIPE_LANGUAGE = 'en';

// Absolute path to the authored French display overlay.
export const RECIPE_FR_OVERLAY_PATH = join(moduleDir, '../../data/recipes/recipes.fr.json');

// Parse a language code; anything unsupported falls back to `en`.
export function parseRecipeLanguage(raw) {
  if (typeof raw !== 'string') return DEFAULT_RECIPE_LANGUAGE;
  const value = raw.trim().toLowerCase();
  return SUPPORTED_RECIPE_LANGUAGES.includes(value) ? value : DEFAULT_RECIPE_LANGUAGE;
}

function isBoundedString(value, max) {
  return typeof value === 'string' && value.trim() !== '' && value.trim().length <= max;
}

// Check that every recipe and ingredient has a French translation.
export function validateRecipeLocaleOverlay(overlay, recipes) {
  const errors = [];
  const add = (code, message, recipeId = null, field = null) =>
    errors.push({ code, message, recipeId, field });

  if (!isPlainObject(overlay)) {
    add('INVALID_OVERLAY_SHAPE', 'Overlay must be an object.');
    return { valid: false, errors };
  }
  if (overlay.locale !== 'fr') {
    add('INVALID_OVERLAY_LOCALE', `Overlay "locale" must be "fr" (got ${JSON.stringify(overlay.locale)}).`, null, 'locale');
  }
  if (!isPlainObject(overlay.recipes)) {
    add('INVALID_OVERLAY_RECIPES', 'Overlay "recipes" must be an object keyed by recipe id.', null, 'recipes');
    return { valid: false, errors };
  }
  if (!Array.isArray(recipes)) {
    add('INVALID_BASE_RECIPES', 'Base recipes must be an array.');
    return { valid: false, errors };
  }

  const overlayIds = new Set(Object.keys(overlay.recipes));
  const baseIds = new Set();

  for (const recipe of recipes) {
    if (!isPlainObject(recipe) || typeof recipe.id !== 'string') continue;
    baseIds.add(recipe.id);
    const entry = overlay.recipes[recipe.id];
    if (!isPlainObject(entry)) {
      add('MISSING_OVERLAY_RECIPE', `No French overlay entry for recipe "${recipe.id}".`, recipe.id, recipe.id);
      continue;
    }

    for (const [field, max] of [
      ['name', RECIPE_LIMITS.nameMaxLength],
      ['description', RECIPE_LIMITS.descriptionMaxLength],
      ['cuisine', RECIPE_LIMITS.cuisineMaxLength],
      ['category', RECIPE_LIMITS.categoryMaxLength],
    ]) {
      if (!isBoundedString(entry[field], max)) {
        add(
          'INVALID_OVERLAY_FIELD',
          `Recipe "${recipe.id}" overlay ${field} must be a non-blank string up to ${max} characters.`,
          recipe.id,
          field,
        );
      }
    }

    const ingOverlay = entry.ingredients;
    if (!isPlainObject(ingOverlay)) {
      add('MISSING_OVERLAY_INGREDIENTS', `Recipe "${recipe.id}" overlay must have an "ingredients" object.`, recipe.id, 'ingredients');
      continue;
    }
    const baseKeys = new Set(
      (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
        .filter((i) => isPlainObject(i) && typeof i.key === 'string')
        .map((i) => i.key),
    );
    for (const ingredient of Array.isArray(recipe.ingredients) ? recipe.ingredients : []) {
      if (!isPlainObject(ingredient) || typeof ingredient.key !== 'string') continue;
      const o = ingOverlay[ingredient.key];
      if (!isPlainObject(o)) {
        add('MISSING_OVERLAY_INGREDIENT', `Recipe "${recipe.id}" overlay is missing ingredient "${ingredient.key}".`, recipe.id, `ingredients.${ingredient.key}`);
        continue;
      }
      if (!isBoundedString(o.label, RECIPE_LIMITS.labelMaxLength)) {
        add('INVALID_OVERLAY_INGREDIENT_LABEL', `Recipe "${recipe.id}" ingredient "${ingredient.key}" overlay label must be a non-blank string up to ${RECIPE_LIMITS.labelMaxLength} characters.`, recipe.id, `ingredients.${ingredient.key}.label`);
      }
      const englishHasQuantity =
        typeof ingredient.quantityText === 'string' && ingredient.quantityText.trim() !== '';
      if (englishHasQuantity) {
        if (!isBoundedString(o.quantityText, RECIPE_LIMITS.quantityTextMaxLength)) {
          add('INVALID_OVERLAY_INGREDIENT_QUANTITY', `Recipe "${recipe.id}" ingredient "${ingredient.key}" overlay quantityText must be a non-blank string up to ${RECIPE_LIMITS.quantityTextMaxLength} characters (English has one).`, recipe.id, `ingredients.${ingredient.key}.quantityText`);
        }
      } else if (o.quantityText !== undefined && o.quantityText !== null) {
        add('UNEXPECTED_OVERLAY_QUANTITY', `Recipe "${recipe.id}" ingredient "${ingredient.key}" overlay has a quantityText but the English ingredient has none.`, recipe.id, `ingredients.${ingredient.key}.quantityText`);
      }
    }
    for (const key of Object.keys(ingOverlay)) {
      if (!baseKeys.has(key)) {
        add('ORPHAN_OVERLAY_INGREDIENT', `Recipe "${recipe.id}" overlay has ingredient "${key}" which the recipe does not use.`, recipe.id, `ingredients.${key}`);
      }
    }
  }

  for (const id of overlayIds) {
    if (!baseIds.has(id)) {
      add('ORPHAN_OVERLAY_RECIPE', `Overlay entry "${id}" is not a recipe in recipes.json.`, id, id);
    }
  }

  return { valid: errors.length === 0, errors };
}

// Throw with a compact preview if the overlay is invalid; else return it.
export function assertValidRecipeLocaleOverlay(overlay, recipes) {
  const { valid, errors } = validateRecipeLocaleOverlay(overlay, recipes);
  if (!valid) {
    const preview = errors.slice(0, 10).map((e) => `  [${e.code}] ${e.message}`).join('\n');
    const more = errors.length > 10 ? `\n  …and ${errors.length - 10} more` : '';
    throw new Error(`French recipe overlay failed validation (${errors.length} issue(s)):\n${preview}${more}`);
  }
  return overlay;
}

// Read + parse the overlay JSON file (no validation).
export function readRecipeLocaleOverlayFile(path = RECIPE_FR_OVERLAY_PATH) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(`Could not read recipe locale overlay at ${path}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Recipe locale overlay at ${path} is not valid JSON: ${err.message}`);
  }
}

const overlayCache = new Map(); // language -> Map<recipeId, entry> | null

// Load and cache the translation overlay (null for English).
export function loadRecipeLocaleOverlay(language, { recipes, force = false, path } = {}) {
  const lang = parseRecipeLanguage(language);
  if (lang === 'en') return null;
  const usingDefaultPath = path === undefined || path === RECIPE_FR_OVERLAY_PATH;
  if (!force && usingDefaultPath && overlayCache.has(lang)) {
    return overlayCache.get(lang);
  }
  const parsed = readRecipeLocaleOverlayFile(path ?? RECIPE_FR_OVERLAY_PATH);
  assertValidRecipeLocaleOverlay(parsed, recipes);
  const map = new Map(Object.entries(parsed.recipes));
  if (usingDefaultPath) overlayCache.set(lang, map);
  return map;
}

// --- Translate a finished result ---

function localizeIngredientInfo(info, entry) {
  if (!isPlainObject(info) || typeof info.key !== 'string') return info;
  const o = entry.ingredients?.[info.key];
  if (!isPlainObject(o)) return info;
  const next = { ...info };
  if (isBoundedString(o.label, RECIPE_LIMITS.labelMaxLength)) next.label = o.label;
  if (
    typeof info.quantityText === 'string' &&
    info.quantityText.trim() !== '' &&
    isBoundedString(o.quantityText, RECIPE_LIMITS.quantityTextMaxLength)
  ) {
    next.quantityText = o.quantityText;
  }
  return next;
}

function localizeInfoList(list, entry) {
  return Array.isArray(list) ? list.map((info) => localizeIngredientInfo(info, entry)) : list;
}

function localizeRequirement(req, entry) {
  if (!isPlainObject(req) || typeof req.key !== 'string') return req;
  const o = entry.ingredients?.[req.key];
  if (!isPlainObject(o)) return req;
  const next = { ...req };
  // French label, used when a requirement has no translation key.
  if (isBoundedString(o.label, RECIPE_LIMITS.labelMaxLength)) next.label = o.label;
  if (
    typeof req.quantityText === 'string' &&
    req.quantityText.trim() !== '' &&
    isBoundedString(o.quantityText, RECIPE_LIMITS.quantityTextMaxLength)
  ) {
    next.quantityText = o.quantityText;
  }
  return next;
}

function localizeLinkedProduct(link, entry) {
  if (!isPlainObject(link)) return link;
  const key =
    typeof link.requirementKey === 'string'
      ? link.requirementKey
      : typeof link.ingredientKey === 'string'
        ? link.ingredientKey
        : null;
  const o = key ? entry.ingredients?.[key] : null;
  if (!isPlainObject(o) || !isBoundedString(o.label, RECIPE_LIMITS.labelMaxLength)) return link;
  // `productName` is an imported catalogue value and is never translated.
  return { ...link, label: o.label };
}

// Localize the display text of one recommendation card.
export function localizeRecipeCard(card, entry) {
  if (!isPlainObject(card) || !isPlainObject(entry)) return card;
  const next = { ...card };
  if (isBoundedString(entry.name, RECIPE_LIMITS.nameMaxLength)) next.name = entry.name;
  if (isBoundedString(entry.description, RECIPE_LIMITS.descriptionMaxLength)) {
    next.description = entry.description;
  }
  if (card.cuisine != null && isBoundedString(entry.cuisine, RECIPE_LIMITS.cuisineMaxLength)) {
    next.cuisine = entry.cuisine;
  }
  if (card.category != null && isBoundedString(entry.category, RECIPE_LIMITS.categoryMaxLength)) {
    next.category = entry.category;
  }
  next.requirements = Array.isArray(card.requirements)
    ? card.requirements.map((req) => localizeRequirement(req, entry))
    : card.requirements;
  next.matchedIngredients = localizeInfoList(card.matchedIngredients, entry);
  next.missingIngredients = localizeInfoList(card.missingIngredients, entry);
  next.missingEssential = localizeInfoList(card.missingEssential, entry);
  next.missingOptional = localizeInfoList(card.missingOptional, entry);
  next.missingLinkedProducts = Array.isArray(card.missingLinkedProducts)
    ? card.missingLinkedProducts.map((link) => localizeLinkedProduct(link, entry))
    : card.missingLinkedProducts;
  return next;
}

// Apply the language overlay to a recommendation result (English is unchanged).
export function localizeRecommendationResult(result, { language, overlay } = {}) {
  const lang = parseRecipeLanguage(language);
  if (lang === 'en' || !(overlay instanceof Map) || !isPlainObject(result)) return result;

  const localizeOne = (card) => {
    if (!isPlainObject(card)) return card;
    const entry = overlay.get(card.recipeId);
    return entry ? localizeRecipeCard(card, entry) : card;
  };

  const next = { ...result };
  if (Array.isArray(result.recommendations)) {
    next.recommendations = result.recommendations.map(localizeOne);
  }
  if (isPlainObject(result.recommendation)) {
    next.recommendation = localizeOne(result.recommendation);
  }
  return next;
}
