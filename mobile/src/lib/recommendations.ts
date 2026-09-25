// Helpers for recipe requests: the limit, the path and how errors are grouped.

// Matches server `DEFAULT_RECOMMENDATION_LIMIT` (recommendation.service.js).
export const DEFAULT_RECOMMENDATION_LIMIT = 10;

// Matches server `MAX_RECOMMENDATION_LIMIT` (recommendation.service.js).
export const MAX_RECOMMENDATION_LIMIT = 20;

// Base path for both endpoints; the detail path appends `/:recipeId`.
export const RECOMMENDATIONS_LIST_PATH = '/api/recommendations/recipes';

// Languages the recipe API serves. Matches server `SUPPORTED_RECIPE_LANGUAGES`.
export type RecipeLanguage = 'en' | 'fr';

// Add `?language=fr` only for French (English is the default).
export function recipeLanguageQuery(language?: string, existingQuery = false): string {
  return language === 'fr' ? `${existingQuery ? '&' : '?'}language=fr` : '';
}

// Validate a result limit: values above the cap are clamped, invalid values throw.
export function validateRecommendationLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('limit must be a positive integer.');
  }
  return Math.min(limit, MAX_RECOMMENDATION_LIMIT);
}

// Path for the recipe list request; without a limit the server default applies.
export function buildRecommendationsListPath(limit?: number, language?: string): string {
  if (limit === undefined) {
    return `${RECOMMENDATIONS_LIST_PATH}${recipeLanguageQuery(language)}`;
  }
  const validated = validateRecommendationLimit(limit);
  return `${RECOMMENDATIONS_LIST_PATH}?limit=${validated}${recipeLanguageQuery(language, true)}`;
}

// Path for one recipe (the id is URL-encoded).
export function buildRecommendationDetailPath(recipeId: string, language?: string): string {
  const trimmed = typeof recipeId === 'string' ? recipeId.trim() : '';
  if (!trimmed) {
    throw new Error('A recipe id is required.');
  }
  return `${RECOMMENDATIONS_LIST_PATH}/${encodeURIComponent(trimmed)}${recipeLanguageQuery(language)}`;
}

// Error kind from the HTTP status code.
export type RecommendationErrorKind =
  | 'auth'
  | 'unavailable'
  | 'rateLimited'
  | 'notFound'
  | 'validation'
  | 'unknown';

// Map an HTTP status to an error kind (auth, notFound, rateLimited, unavailable, validation, unknown).
export function classifyRecommendationErrorStatus(status: number | undefined): RecommendationErrorKind {
  switch (status) {
    case 401:
      return 'auth';
    case 404:
      return 'notFound';
    case 429:
      return 'rateLimited';
    case 503:
      return 'unavailable';
    case 400:
      return 'validation';
    default:
      return 'unknown';
  }
}
