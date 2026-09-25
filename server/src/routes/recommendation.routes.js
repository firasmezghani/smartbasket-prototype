import { Router } from 'express';
import { requireCustomer } from '../middleware/requireCustomer.js';
import { recommendationReadRateLimiter } from '../middleware/recommendationReadRateLimit.js';

// Recipe routes. The customer comes from the prototype `x-customer-id` header, not real login.
export function createRecommendationRoutes({ controller, rateLimiter = recommendationReadRateLimiter } = {}) {
  if (!controller || typeof controller.listRecipes !== 'function' || typeof controller.getRecipe !== 'function') {
    throw new TypeError('createRecommendationRoutes: controller is required.');
  }

  const router = Router();
  router.use(requireCustomer);
  router.use(rateLimiter);
  router.get('/recipes', controller.listRecipes);
  router.get('/recipes/:recipeId', controller.getRecipe);
  return router;
}
