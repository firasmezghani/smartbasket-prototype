import { asyncHandler } from '../utils/asyncHandler.js';
import {
  parseRecommendationListLimit,
  parseRecipeIdParam,
  parseRecipeLanguage,
} from '../services/recipe/recommendation.api.service.js';

// Recommendation endpoints. The customer id comes only from requireCustomer.
export function createRecommendationController(api) {
  if (!api || typeof api.listRecipes !== 'function' || typeof api.getRecipe !== 'function') {
    throw new TypeError('createRecommendationController: recommendation API service is required.');
  }

  return {
    listRecipes: asyncHandler(async (req, res) => {
      const limit = parseRecommendationListLimit(req.query?.limit);
      // Only `en` and `fr` are accepted; anything else falls back to `en`.
      const language = parseRecipeLanguage(req.query?.language);
      const data = await api.listRecipes({
        customerId: req.customerId,
        limit,
        language,
      });
      res.status(200).json({ data, meta: { limit, language } });
    }),

    getRecipe: asyncHandler(async (req, res) => {
      const recipeId = parseRecipeIdParam(req.params?.recipeId);
      const language = parseRecipeLanguage(req.query?.language);
      const data = await api.getRecipe({
        customerId: req.customerId,
        recipeId,
        language,
      });
      res.status(200).json({ data, meta: { language } });
    }),
  };
}
