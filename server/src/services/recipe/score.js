// Scores a recipe by how many of its ingredients the customer has.

// score = essentialCoverageWeight * essentialCoverage
//       + optionalCoverageWeight * optionalCoverage
export const RECOMMENDATION_CONFIG = Object.freeze({
  essentialCoverageWeight: 1,
  optionalCoverageWeight: 0.1,
  tieBreakOrder: Object.freeze([
    'fewerMissingEssentialIngredients',
    'moreMatchedEssentialsWhenComplete',
    'lowerFallbackRank',
    'recipeIdAscending',
  ]),
});

// Normalise ingredient keys into a de-duplicated Set of lower-case strings.
export function normaliseAvailableKeys(availableIngredientKeys) {
  if (
    availableIngredientKeys == null ||
    typeof availableIngredientKeys[Symbol.iterator] !== 'function' ||
    typeof availableIngredientKeys === 'string'
  ) {
    throw new TypeError('availableIngredientKeys must be an iterable of strings (array or Set).');
  }
  const out = new Set();
  for (const raw of availableIngredientKeys) {
    if (typeof raw !== 'string') continue;
    const key = raw.trim().toLowerCase();
    if (key !== '') out.add(key);
  }
  return out;
}

function assertScorableRecipe(recipe) {
  if (typeof recipe !== 'object' || recipe === null || Array.isArray(recipe)) {
    throw new TypeError('scoreRecipe: recipe must be an object.');
  }
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
    throw new TypeError(`scoreRecipe: recipe "${recipe.id ?? '(no id)'}" must have a non-empty ingredients array.`);
  }
  if (typeof recipe.fallbackRank !== 'number' || !Number.isFinite(recipe.fallbackRank)) {
    throw new TypeError(`scoreRecipe: recipe "${recipe.id ?? '(no id)'}" must have a numeric fallbackRank.`);
  }
}


// Score a single recipe against the available ingredient keys.
export function scoreRecipe(recipe, availableIngredientKeys, config = RECOMMENDATION_CONFIG) {
  assertScorableRecipe(recipe);
  const available =
    availableIngredientKeys instanceof Set && isAllLowerTrimmed(availableIngredientKeys)
      ? availableIngredientKeys
      : normaliseAvailableKeys(availableIngredientKeys);

  const matchedEssential = [];
  const missingEssential = [];
  const matchedOptional = [];
  const missingOptional = [];

  for (const ingredient of recipe.ingredients) {
    const key = String(ingredient.key).trim().toLowerCase();
    const isEssential = ingredient.essential === true;
    const has = available.has(key);
    if (isEssential) {
      (has ? matchedEssential : missingEssential).push(key);
    } else {
      (has ? matchedOptional : missingOptional).push(key);
    }
  }

  matchedEssential.sort();
  missingEssential.sort();
  matchedOptional.sort();
  missingOptional.sort();

  const totalEssential = matchedEssential.length + missingEssential.length;
  const totalOptional = matchedOptional.length + missingOptional.length;

  const essentialCoverage = totalEssential === 0 ? 0 : matchedEssential.length / totalEssential;
  const optionalCoverage = totalOptional === 0 ? 0 : matchedOptional.length / totalOptional;

  const score =
    config.essentialCoverageWeight * essentialCoverage +
    config.optionalCoverageWeight * optionalCoverage;

  return {
    recipeId: recipe.id,
    score,
    essentialCoverage,
    optionalCoverage,
    matchedEssential,
    missingEssential,
    matchedOptional,
    missingOptional,
    matchedEssentialCount: matchedEssential.length,
    missingEssentialCount: missingEssential.length,
    matchedOptionalCount: matchedOptional.length,
    missingOptionalCount: missingOptional.length,
    totalEssential,
    totalOptional,
    fallbackRank: recipe.fallbackRank,
  };
}

function isAllLowerTrimmed(set) {
  for (const v of set) {
    if (typeof v !== 'string' || v !== v.trim().toLowerCase() || v === '') return false;
  }
  return true;
}

// --- Requirement evaluation (quantities and alternatives) ---

// Possible states of a recipe requirement.
export const REQUIREMENT_STATUSES = Object.freeze([
  'sufficient',        // an accepted alternative is present and its known quantity is enough
  'insufficient',      // an accepted alternative is present but its known quantity is too small
  'quantity_unknown',  // an accepted alternative is present but the amount cannot be verified
  'matched',           // an accepted alternative is present and no structured quantity is required
  'missing',           // no accepted alternative is present
  'not_evaluated',     // no shopping evidence to evaluate against (popularity fallback)
]);

// Units a structured requirement may compare against.
export const REQUIREMENT_UNITS = Object.freeze(['piece', 'g', 'ml']);

// Statuses that count as "satisfied" for coverage / ranking.
const SATISFYING_STATUSES = new Set(['sufficient', 'matched', 'quantity_unknown']);

export function isRequirementSatisfied(status) {
  return SATISFYING_STATUSES.has(status);
}

// The ordered, de-duplicated, lower-cased list of accepted alternative keys.
export function acceptedAlternativeKeys(ingredient) {
  const primary = String(ingredient.key ?? '').trim().toLowerCase();
  const raw = Array.isArray(ingredient.anyOfKeys) && ingredient.anyOfKeys.length > 0
    ? ingredient.anyOfKeys
    : [primary];
  const out = [];
  const seen = new Set();
  for (const k of raw) {
    if (typeof k !== 'string') continue;
    const key = k.trim().toLowerCase();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  if (out.length === 0 && primary !== '') out.push(primary);
  return out;
}

function structuredRequirement(ingredient) {
  const amount = ingredient.requiredAmount;
  const unit = ingredient.requiredUnit;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
  if (!REQUIREMENT_UNITS.includes(unit)) return null;
  return { amount, unit };
}

// Requirement entry for a popularity-fallback recipe (no basket evidence).
export function notEvaluatedRequirement(ingredient) {
  const key = String(ingredient.key ?? '').trim().toLowerCase();
  const required = structuredRequirement(ingredient);
  return {
    key,
    label: typeof ingredient.label === 'string' ? ingredient.label : key,
    labelKey: typeof ingredient.labelKey === 'string' ? ingredient.labelKey : null,
    essential: ingredient.essential === true,
    anyOfKeys: acceptedAlternativeKeys(ingredient),
    matchedKey: null,
    requiredAmount: required ? required.amount : null,
    requiredUnit: required ? required.unit : null,
    availableAmount: null,
    availableUnit: null,
    confidence: null,
    quantityText: typeof ingredient.quantityText === 'string' ? ingredient.quantityText : null,
    status: 'not_evaluated',
    reasonCode: 'no_evidence',
  };
}

// Evaluate one recipe ingredient (one requirement group). Quantities are
// only known for the current basket (`availabilityByKey`).
export function evaluateRecipeRequirement(ingredient, availableKeys, availabilityByKey = null) {
  const key = String(ingredient.key ?? '').trim().toLowerCase();
  const anyOfKeys = acceptedAlternativeKeys(ingredient);
  const essential = ingredient.essential === true;
  const required = structuredRequirement(ingredient);
  const base = {
    key,
    label: typeof ingredient.label === 'string' ? ingredient.label : key,
    labelKey: typeof ingredient.labelKey === 'string' ? ingredient.labelKey : null,
    essential,
    anyOfKeys,
    matchedKey: null,
    requiredAmount: required ? required.amount : null,
    requiredUnit: required ? required.unit : null,
    availableAmount: null,
    availableUnit: null,
    confidence: null,
    quantityText: typeof ingredient.quantityText === 'string' ? ingredient.quantityText : null,
    status: 'missing',
    reasonCode: 'no_accepted_alternative_present',
  };

  const matchedKey = anyOfKeys.find((k) => availableKeys.has(k)) ?? null;
  if (!matchedKey) return base;
  base.matchedKey = matchedKey;

  const avail =
    availabilityByKey instanceof Map ? availabilityByKey.get(matchedKey) : null;
  if (avail && typeof avail === 'object' && Number.isFinite(avail.amount) && avail.amount > 0 && typeof avail.unit === 'string') {
    base.availableAmount = avail.amount;
    base.availableUnit = avail.unit;
    base.confidence = typeof avail.confidence === 'string' ? avail.confidence : null;
  }

  if (!required) {
    base.status = 'matched';
    base.reasonCode = 'present_no_structured_quantity';
    return base;
  }

  if (base.availableAmount != null && base.availableUnit === required.unit) {
    if (base.availableAmount >= required.amount) {
      base.status = 'sufficient';
      base.reasonCode = 'known_quantity_meets_requirement';
    } else {
      base.status = 'insufficient';
      base.reasonCode = 'known_quantity_below_requirement';
    }
    return base;
  }

  base.status = 'quantity_unknown';
  base.reasonCode = base.availableAmount != null ? 'available_unit_incompatible' : 'quantity_not_verified';
  return base;
}

// Score one recipe using requirement evaluation (alternatives and quantities).
// Gives the same numbers as `scoreRecipe` for simple recipes.
export function scoreRecipeWithRequirements(
  recipe,
  availableIngredientKeys,
  availabilityByKey = null,
  config = RECOMMENDATION_CONFIG,
) {
  assertScorableRecipe(recipe);
  const available =
    availableIngredientKeys instanceof Set && isAllLowerTrimmed(availableIngredientKeys)
      ? availableIngredientKeys
      : normaliseAvailableKeys(availableIngredientKeys);

  const requirements = recipe.ingredients.map((ing) =>
    evaluateRecipeRequirement(ing, available, availabilityByKey),
  );

  const matchedEssential = [];
  const missingEssential = [];
  const matchedOptional = [];
  const missingOptional = [];
  for (const r of requirements) {
    const bucketMatched = r.essential ? matchedEssential : matchedOptional;
    const bucketMissing = r.essential ? missingEssential : missingOptional;
    (isRequirementSatisfied(r.status) ? bucketMatched : bucketMissing).push(r.key);
  }
  matchedEssential.sort();
  missingEssential.sort();
  matchedOptional.sort();
  missingOptional.sort();

  const totalEssential = matchedEssential.length + missingEssential.length;
  const totalOptional = matchedOptional.length + missingOptional.length;
  const essentialCoverage = totalEssential === 0 ? 0 : matchedEssential.length / totalEssential;
  const optionalCoverage = totalOptional === 0 ? 0 : matchedOptional.length / totalOptional;
  const score =
    config.essentialCoverageWeight * essentialCoverage +
    config.optionalCoverageWeight * optionalCoverage;

  return {
    recipeId: recipe.id,
    score,
    essentialCoverage,
    optionalCoverage,
    matchedEssential,
    missingEssential,
    matchedOptional,
    missingOptional,
    matchedEssentialCount: matchedEssential.length,
    missingEssentialCount: missingEssential.length,
    matchedOptionalCount: matchedOptional.length,
    missingOptionalCount: missingOptional.length,
    totalEssential,
    totalOptional,
    fallbackRank: recipe.fallbackRank,
    requirements,
  };
}

// Requirement-aware ranking, same order as `rankRecipes`.
export function rankRecipesByRequirements(
  recipes,
  availableIngredientKeys,
  availabilityByKey = null,
  config = RECOMMENDATION_CONFIG,
) {
  if (!Array.isArray(recipes)) {
    throw new TypeError('rankRecipesByRequirements: recipes must be an array.');
  }
  const available = normaliseAvailableKeys(availableIngredientKeys);
  return recipes
    .map((recipe) => scoreRecipeWithRequirements(recipe, available, availabilityByKey, config))
    .sort(compareScored);
}

// Recommendation order, best first: essential coverage, score, fewer missing
// essentials, more specific complete recipe, fallbackRank, then recipeId.
export function compareScored(a, b) {
  if (b.essentialCoverage !== a.essentialCoverage) return b.essentialCoverage - a.essentialCoverage;
  if (b.score !== a.score) return b.score - a.score;
  if (a.missingEssentialCount !== b.missingEssentialCount) {
    return a.missingEssentialCount - b.missingEssentialCount;
  }
  if (
    a.missingEssentialCount === 0
    && b.missingEssentialCount === 0
    && a.matchedEssentialCount !== b.matchedEssentialCount
  ) {
    return b.matchedEssentialCount - a.matchedEssentialCount;
  }
  if (a.fallbackRank !== b.fallbackRank) return a.fallbackRank - b.fallbackRank;
  if (a.recipeId < b.recipeId) return -1;
  if (a.recipeId > b.recipeId) return 1;
  return 0;
}

// Score every recipe and return them sorted best first.
export function rankRecipes(recipes, availableIngredientKeys, config = RECOMMENDATION_CONFIG) {
  if (!Array.isArray(recipes)) {
    throw new TypeError('rankRecipes: recipes must be an array.');
  }
  const available = normaliseAvailableKeys(availableIngredientKeys);
  return recipes.map((recipe) => scoreRecipe(recipe, available, config)).sort(compareScored);
}

// Cold-start order: recipes sorted by their authored `fallbackRank`.
export function popularityFallbackOrder(recipes) {
  if (!Array.isArray(recipes)) {
    throw new TypeError('popularityFallbackOrder: recipes must be an array.');
  }
  return [...recipes]
    .sort((a, b) => {
      if (a.fallbackRank !== b.fallbackRank) return a.fallbackRank - b.fallbackRank;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    })
    .map((recipe) => ({
      recipeId: recipe.id,
      name: recipe.name,
      fallbackRank: recipe.fallbackRank,
    }));
}
