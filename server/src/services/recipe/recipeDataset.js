// Loads the recipe JSON and checks its structure, reporting every problem found.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const moduleDir = dirname(fileURLToPath(import.meta.url));

// Absolute path to the curated synthetic dataset.
export const RECIPE_DATASET_PATH = join(moduleDir, '../../data/recipes/recipes.json');

// Schema version understood by this loader.
export const RECIPE_SCHEMA_VERSION = 1;

// Allowed values for `recipe.difficulty`.
export const ALLOWED_DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard']);

// Size limits that keep the recipes small and easy to review.
export const RECIPE_LIMITS = Object.freeze({
  idMaxLength: 64,
  nameMaxLength: 120,
  descriptionMaxLength: 400,
  labelMaxLength: 60,
  labelKeyMaxLength: 80,
  quantityTextMaxLength: 60,
  cuisineMaxLength: 40,
  categoryMaxLength: 40,
  ingredientKeyMaxLength: 40,
  minPrepTimeMinutes: 1,
  maxPrepTimeMinutes: 24 * 60,
  minIngredients: 1,
  minEssentialIngredients: 1,
  maxEssentialIngredients: 5,
  minFallbackRank: 1,
  // Structured `requiredAmount` upper bound (an interpretation-safe ceiling).
  requiredAmountMax: 100000,
  // Alternatives per requirement group (`anyOfKeys`). Kept small on purpose.
  maxAnyOfKeys: 4,
});

// Units allowed for a required amount. Vague amounts stay as text only.
export const REQUIRED_UNITS = Object.freeze(['piece', 'g', 'ml']);

// Optional translation-key form for a requirement group label.
export const LABEL_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+$/;

// Recipe identifiers: lower-case, digits, single hyphen separators.
export const RECIPE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Normalised ingredient keys: lower-case, digits, single underscore separators.
export const INGREDIENT_KEY_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;


export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isIntegerInRange(value, min, max) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

// Validate the dataset and return all errors.
export function validateRecipeDataset(dataset) {
  const errors = [];

  const add = (code, message, recipeId = null, recipeIndex = -1, field = null) => {
    errors.push({ code, message, recipeId, recipeIndex, field });
  };

  let recipes;
  if (Array.isArray(dataset)) {
    recipes = dataset;
  } else if (isPlainObject(dataset) && Array.isArray(dataset.recipes)) {
    recipes = dataset.recipes;
    if (
      dataset.$schemaVersion !== undefined &&
      dataset.$schemaVersion !== RECIPE_SCHEMA_VERSION
    ) {
      add(
        'UNSUPPORTED_SCHEMA_VERSION',
        `Unsupported $schemaVersion ${JSON.stringify(dataset.$schemaVersion)}; expected ${RECIPE_SCHEMA_VERSION}.`,
        null,
        -1,
        '$schemaVersion',
      );
    }
  } else {
    add(
      'INVALID_DATASET_SHAPE',
      'Dataset must be an array of recipes or an object with a "recipes" array.',
    );
    return { valid: false, errors, recipeCount: 0 };
  }

  if (recipes.length === 0) {
    add('EMPTY_DATASET', 'Dataset contains no recipes.', null, -1, 'recipes');
  }

  const seenIds = new Map(); // id -> first index
  const seenFallbackRanks = new Map(); // rank -> first recipe id
  // Every well-formed primary ingredient key seen anywhere in the dataset.

  recipes.forEach((recipe, index) => {
    if (!isPlainObject(recipe)) {
      add('INVALID_RECIPE_SHAPE', `Recipe at index ${index} is not an object.`, null, index, null);
      return;
    }

    const recipeId = isNonBlankString(recipe.id) ? recipe.id.trim() : null;

    // --- id ---
    if (!isNonBlankString(recipe.id)) {
      add('INVALID_RECIPE_ID', `Recipe at index ${index} has a missing or blank id.`, recipeId, index, 'id');
    } else {
      if (recipe.id.length > RECIPE_LIMITS.idMaxLength) {
        add('INVALID_RECIPE_ID', `Recipe id "${recipe.id}" exceeds ${RECIPE_LIMITS.idMaxLength} characters.`, recipeId, index, 'id');
      }
      if (!RECIPE_ID_PATTERN.test(recipe.id)) {
        add('INVALID_RECIPE_ID', `Recipe id "${recipe.id}" must match ${RECIPE_ID_PATTERN}.`, recipeId, index, 'id');
      }
      if (seenIds.has(recipe.id)) {
        add(
          'DUPLICATE_RECIPE_ID',
          `Duplicate recipe id "${recipe.id}" (also at index ${seenIds.get(recipe.id)}).`,
          recipeId,
          index,
          'id',
        );
      } else {
        seenIds.set(recipe.id, index);
      }
    }

    // --- name ---
    if (!isNonBlankString(recipe.name)) {
      add('MISSING_NAME', `Recipe "${recipeId ?? index}" has a missing or blank name.`, recipeId, index, 'name');
    } else if (recipe.name.trim().length > RECIPE_LIMITS.nameMaxLength) {
      add('MISSING_NAME', `Recipe "${recipeId ?? index}" name exceeds ${RECIPE_LIMITS.nameMaxLength} characters.`, recipeId, index, 'name');
    }

    // --- description ---
    if (!isNonBlankString(recipe.description)) {
      add('MISSING_DESCRIPTION', `Recipe "${recipeId ?? index}" has a missing or blank description.`, recipeId, index, 'description');
    } else if (recipe.description.trim().length > RECIPE_LIMITS.descriptionMaxLength) {
      add('MISSING_DESCRIPTION', `Recipe "${recipeId ?? index}" description exceeds ${RECIPE_LIMITS.descriptionMaxLength} characters.`, recipeId, index, 'description');
    }

    // --- cuisine / category (optional) ---
    if (recipe.cuisine !== undefined && recipe.cuisine !== null) {
      if (!isNonBlankString(recipe.cuisine) || recipe.cuisine.trim().length > RECIPE_LIMITS.cuisineMaxLength) {
        add('INVALID_CUISINE', `Recipe "${recipeId ?? index}" cuisine must be a non-blank string up to ${RECIPE_LIMITS.cuisineMaxLength} characters.`, recipeId, index, 'cuisine');
      }
    }
    if (recipe.category !== undefined && recipe.category !== null) {
      if (!isNonBlankString(recipe.category) || recipe.category.trim().length > RECIPE_LIMITS.categoryMaxLength) {
        add('INVALID_CATEGORY', `Recipe "${recipeId ?? index}" category must be a non-blank string up to ${RECIPE_LIMITS.categoryMaxLength} characters.`, recipeId, index, 'category');
      }
    }

    // --- prepTimeMinutes ---
    if (!isIntegerInRange(recipe.prepTimeMinutes, RECIPE_LIMITS.minPrepTimeMinutes, RECIPE_LIMITS.maxPrepTimeMinutes)) {
      add(
        'INVALID_PREP_TIME',
        `Recipe "${recipeId ?? index}" prepTimeMinutes must be an integer between ${RECIPE_LIMITS.minPrepTimeMinutes} and ${RECIPE_LIMITS.maxPrepTimeMinutes}.`,
        recipeId,
        index,
        'prepTimeMinutes',
      );
    }

    // --- difficulty ---
    if (!ALLOWED_DIFFICULTIES.includes(recipe.difficulty)) {
      add(
        'INVALID_DIFFICULTY',
        `Recipe "${recipeId ?? index}" difficulty must be one of: ${ALLOWED_DIFFICULTIES.join(', ')}.`,
        recipeId,
        index,
        'difficulty',
      );
    }

    // --- fallbackRank ---
    if (!isIntegerInRange(recipe.fallbackRank, RECIPE_LIMITS.minFallbackRank, Number.MAX_SAFE_INTEGER)) {
      add(
        'INVALID_FALLBACK_RANK',
        `Recipe "${recipeId ?? index}" fallbackRank must be an integer >= ${RECIPE_LIMITS.minFallbackRank}.`,
        recipeId,
        index,
        'fallbackRank',
      );
    } else if (seenFallbackRanks.has(recipe.fallbackRank)) {
      add(
        'DUPLICATE_FALLBACK_RANK',
        `Duplicate fallbackRank ${recipe.fallbackRank} (also used by "${seenFallbackRanks.get(recipe.fallbackRank)}"). Fallback ranks must be unique so popularity ordering is deterministic.`,
        recipeId,
        index,
        'fallbackRank',
      );
    } else {
      seenFallbackRanks.set(recipe.fallbackRank, recipeId ?? String(index));
    }

    // --- source / licence metadata ---
    if (
      !isPlainObject(recipe.source) ||
      !isNonBlankString(recipe.source.name) ||
      !isNonBlankString(recipe.source.licence)
    ) {
      add(
        'MISSING_SOURCE_METADATA',
        `Recipe "${recipeId ?? index}" must have a source object with non-blank "name" and "licence".`,
        recipeId,
        index,
        'source',
      );
    }

    // --- image (optional) ---
    if (recipe.image !== undefined && recipe.image !== null && typeof recipe.image !== 'string') {
      add('INVALID_IMAGE', `Recipe "${recipeId ?? index}" image must be null or a string path.`, recipeId, index, 'image');
    }

    // --- ingredients ---
    if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length < RECIPE_LIMITS.minIngredients) {
      add('NO_INGREDIENTS', `Recipe "${recipeId ?? index}" must have at least ${RECIPE_LIMITS.minIngredients} ingredient(s).`, recipeId, index, 'ingredients');
      return;
    }

    const seenKeys = new Map();
    let essentialCount = 0;

    recipe.ingredients.forEach((ingredient, ingIndex) => {
      const field = `ingredients[${ingIndex}]`;
      if (!isPlainObject(ingredient)) {
        add('INVALID_INGREDIENT_SHAPE', `Recipe "${recipeId ?? index}" ${field} is not an object.`, recipeId, index, field);
        return;
      }

      if (typeof ingredient.key !== 'string' || !INGREDIENT_KEY_PATTERN.test(ingredient.key) || ingredient.key.length > RECIPE_LIMITS.ingredientKeyMaxLength) {
        add(
          'INVALID_INGREDIENT_KEY',
          `Recipe "${recipeId ?? index}" ${field}.key must match ${INGREDIENT_KEY_PATTERN} and be up to ${RECIPE_LIMITS.ingredientKeyMaxLength} characters (got ${JSON.stringify(ingredient.key)}).`,
          recipeId,
          index,
          `${field}.key`,
        );
      } else if (seenKeys.has(ingredient.key)) {
        add(
          'DUPLICATE_INGREDIENT_KEY',
          `Recipe "${recipeId ?? index}" repeats ingredient key "${ingredient.key}" (also at ingredients[${seenKeys.get(ingredient.key)}]).`,
          recipeId,
          index,
          `${field}.key`,
        );
      } else {
        seenKeys.set(ingredient.key, ingIndex);
      }

      if (!isNonBlankString(ingredient.label) || ingredient.label.trim().length > RECIPE_LIMITS.labelMaxLength) {
        add('MISSING_INGREDIENT_LABEL', `Recipe "${recipeId ?? index}" ${field}.label must be a non-blank string up to ${RECIPE_LIMITS.labelMaxLength} characters.`, recipeId, index, `${field}.label`);
      }

      if (typeof ingredient.essential !== 'boolean') {
        add('INVALID_ESSENTIAL_FLAG', `Recipe "${recipeId ?? index}" ${field}.essential must be a boolean.`, recipeId, index, `${field}.essential`);
      } else if (ingredient.essential) {
        essentialCount += 1;
      }

      // quantityText (optional)
      if (ingredient.quantityText !== undefined && ingredient.quantityText !== null) {
        if (typeof ingredient.quantityText !== 'string' || ingredient.quantityText.length > RECIPE_LIMITS.quantityTextMaxLength) {
          add('INVALID_QUANTITY_TEXT', `Recipe "${recipeId ?? index}" ${field}.quantityText must be a string up to ${RECIPE_LIMITS.quantityTextMaxLength} characters.`, recipeId, index, `${field}.quantityText`);
        }
      }

      // labelKey (optional): a translation-key form, e.g. "recipe.reqLabel.cookingFat".
      if (ingredient.labelKey !== undefined && ingredient.labelKey !== null) {
        if (
          typeof ingredient.labelKey !== 'string' ||
          ingredient.labelKey.length > RECIPE_LIMITS.labelKeyMaxLength ||
          !LABEL_KEY_PATTERN.test(ingredient.labelKey)
        ) {
          add('INVALID_LABEL_KEY', `Recipe "${recipeId ?? index}" ${field}.labelKey must match ${LABEL_KEY_PATTERN} and be up to ${RECIPE_LIMITS.labelKeyMaxLength} characters.`, recipeId, index, `${field}.labelKey`);
        }
      }

      // Structured requirement quantity (optional; requiredAmount + requiredUnit
      // are all-or-nothing). Only `piece` / `g` / `ml`, see REQUIRED_UNITS.
      const hasAmount = ingredient.requiredAmount !== undefined && ingredient.requiredAmount !== null;
      const hasUnit = ingredient.requiredUnit !== undefined && ingredient.requiredUnit !== null;
      if (hasAmount !== hasUnit) {
        add('INCOMPLETE_REQUIRED_QUANTITY', `Recipe "${recipeId ?? index}" ${field} must provide requiredAmount and requiredUnit together, or neither.`, recipeId, index, `${field}.requiredAmount`);
      } else if (hasAmount && hasUnit) {
        const amountOk =
          typeof ingredient.requiredAmount === 'number' &&
          Number.isFinite(ingredient.requiredAmount) &&
          ingredient.requiredAmount > 0 &&
          ingredient.requiredAmount <= RECIPE_LIMITS.requiredAmountMax;
        if (!amountOk) {
          add('INVALID_REQUIRED_AMOUNT', `Recipe "${recipeId ?? index}" ${field}.requiredAmount must be a finite number in (0, ${RECIPE_LIMITS.requiredAmountMax}].`, recipeId, index, `${field}.requiredAmount`);
        }
        if (!REQUIRED_UNITS.includes(ingredient.requiredUnit)) {
          add('INVALID_REQUIRED_UNIT', `Recipe "${recipeId ?? index}" ${field}.requiredUnit must be one of: ${REQUIRED_UNITS.join(', ')}.`, recipeId, index, `${field}.requiredUnit`);
        } else if (ingredient.requiredUnit === 'piece' && amountOk && !Number.isInteger(ingredient.requiredAmount)) {
          add('NON_INTEGER_PIECE_AMOUNT', `Recipe "${recipeId ?? index}" ${field}.requiredAmount must be an integer when requiredUnit is "piece".`, recipeId, index, `${field}.requiredAmount`);
        }
      }

      // anyOfKeys (optional): the accepted alternatives for this one requirement.
      if (ingredient.anyOfKeys !== undefined && ingredient.anyOfKeys !== null) {
        if (!Array.isArray(ingredient.anyOfKeys) || ingredient.anyOfKeys.length === 0) {
          add('INVALID_ANYOF_SHAPE', `Recipe "${recipeId ?? index}" ${field}.anyOfKeys must be a non-empty array of ingredient keys.`, recipeId, index, `${field}.anyOfKeys`);
        } else if (ingredient.anyOfKeys.length > RECIPE_LIMITS.maxAnyOfKeys) {
          add('TOO_MANY_ANYOF_KEYS', `Recipe "${recipeId ?? index}" ${field}.anyOfKeys has ${ingredient.anyOfKeys.length} entries; the maximum is ${RECIPE_LIMITS.maxAnyOfKeys}.`, recipeId, index, `${field}.anyOfKeys`);
        } else {
          const seenAlt = new Set();
          let includesPrimary = false;
          ingredient.anyOfKeys.forEach((alt, altIndex) => {
            if (typeof alt !== 'string' || !INGREDIENT_KEY_PATTERN.test(alt) || alt.length > RECIPE_LIMITS.ingredientKeyMaxLength) {
              add('INVALID_ANYOF_KEY', `Recipe "${recipeId ?? index}" ${field}.anyOfKeys[${altIndex}] must match ${INGREDIENT_KEY_PATTERN}.`, recipeId, index, `${field}.anyOfKeys[${altIndex}]`);
              return;
            }
            if (seenAlt.has(alt)) {
              add('DUPLICATE_ANYOF_KEY', `Recipe "${recipeId ?? index}" ${field}.anyOfKeys repeats "${alt}".`, recipeId, index, `${field}.anyOfKeys[${altIndex}]`);
              return;
            }
            seenAlt.add(alt);
            if (typeof ingredient.key === 'string' && alt === ingredient.key) includesPrimary = true;
          });
          if (typeof ingredient.key === 'string' && ingredient.key !== '' && !includesPrimary && seenAlt.size > 0) {
            add('ANYOF_MISSING_PRIMARY', `Recipe "${recipeId ?? index}" ${field}.anyOfKeys must include the ingredient's own key "${ingredient.key}".`, recipeId, index, `${field}.anyOfKeys`);
          }
        }
      }
    });

    if (essentialCount < RECIPE_LIMITS.minEssentialIngredients) {
      add(
        'NO_ESSENTIAL_INGREDIENT',
        `Recipe "${recipeId ?? index}" must have at least ${RECIPE_LIMITS.minEssentialIngredients} essential ingredient(s).`,
        recipeId,
        index,
        'ingredients',
      );
    }
    if (essentialCount > RECIPE_LIMITS.maxEssentialIngredients) {
      add(
        'TOO_MANY_ESSENTIAL_INGREDIENTS',
        `Recipe "${recipeId ?? index}" has ${essentialCount} essential ingredients; the maximum is ${RECIPE_LIMITS.maxEssentialIngredients} (prototype recipe complexity limit).`,
        recipeId,
        index,
        'ingredients',
      );
    }
  });

  return { valid: errors.length === 0, errors, recipeCount: recipes.length };
}

// Return the recipes, or throw if the dataset is invalid.
export function assertValidRecipeDataset(dataset) {
  const { valid, errors } = validateRecipeDataset(dataset);
  if (!valid) {
    const preview = errors
      .slice(0, 10)
      .map((e) => `  [${e.code}] ${e.field ? `${e.field}: ` : ''}${e.message}`)
      .join('\n');
    const more = errors.length > 10 ? `\n  …and ${errors.length - 10} more` : '';
    throw new Error(`Recipe dataset failed validation (${errors.length} issue(s)):\n${preview}${more}`);
  }
  return Array.isArray(dataset) ? dataset : dataset.recipes;
}

// Read the recipe JSON file (no validation).
export function readRecipeDatasetFile(path = RECIPE_DATASET_PATH) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(`Could not read recipe dataset at ${path}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Recipe dataset at ${path} is not valid JSON: ${err.message}`);
  }
}

let cachedRecipes = null;

// Load, validate and cache the recipe dataset.
export function loadRecipeDataset(options = {}) {
  const { force = false, path = RECIPE_DATASET_PATH } = options;
  if (cachedRecipes && !force && path === RECIPE_DATASET_PATH) {
    return cachedRecipes;
  }
  const parsed = readRecipeDatasetFile(path);
  const recipes = assertValidRecipeDataset(parsed);
  if (path === RECIPE_DATASET_PATH) {
    cachedRecipes = recipes;
  }
  return recipes;
}
