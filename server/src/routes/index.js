import { Router } from 'express';
import { healthRoutes } from './health.routes.js';
import { catalogRoutes } from './catalog.routes.js';
import { authRoutes } from './auth.routes.js';
import { settingsRoutes } from './settings.routes.js';
import { customerRoutes } from './customer.routes.js';
import { cartRoutes } from './cart.routes.js';
import { adminRoutes } from './admin.routes.js';
import { appConfigRoutes } from './appConfig.routes.js';
import { smartBasketRoutes } from './smartBasket.routes.js';
import { purchaseHistoryRoutes } from './purchaseHistory.routes.js';
import { createRecommendationRoutes } from './recommendation.routes.js';
import { createRecommendationController } from '../controllers/recommendation.controller.js';
import { createRecommendationApiService } from '../services/recipe/recommendation.api.service.js';
import { createRecommendationEvidenceAdapter } from '../services/recipe/recommendationEvidence.adapter.js';
import { executeReadOnlyQuery } from '../services/database.service.js';
import { getProducts } from '../services/catalog.service.js';
import { loadRecipeDataset } from '../services/recipe/recipeDataset.js';
import { createIngredientMapper } from '../services/recipe/ingredientMapping.service.js';
import { interpretProductName } from '../services/productInterpretation.service.js';

const router = Router();

// One ingredient mapper shared by the recommender and the name interpreter.
const recommendationMapProduct = createIngredientMapper();

router.get('/', (req, res) => {
  res.json({
    name: 'SmartBasket API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      catalogProducts:
        'GET /api/catalog/products?search=&family=&brand=&subfamily=&site=all|true|false&sort=recommended|name_asc|name_desc|price_asc|price_desc|promo_first&hasPromo=true&displayCategory=food|drinks|household|personal-care|other&featured=true&curated=true&limit=1-100&offset<=2000000 (paginated; never returns full catalog; invalid displayCategory => 400)',
      catalogSections:
        'GET /api/catalog/sections (read-only; fixed keys featured|food|drinks|household|personal-care|other with translation keys and visible-curated counts)',
      catalogProductById: 'GET /api/catalog/products/:idArt',
      catalogProductImage: 'GET /api/catalog/products/:idArt/image',
      catalogProductByBarcode:
        'GET /api/catalog/products/by-barcode/:barcode (read-only CodBar lookup; 404 not found; 404 code=NOT_IN_CURATED_CATALOGUE when the product exists but is outside the curated prototype set; 409 ambiguous)',
      catalogFamilies: 'GET /api/catalog/families',
      catalogSubfamilies: 'GET /api/catalog/subfamilies?family= (family required)',
      catalogBrands: 'GET /api/catalog/brands',
      authLogin: 'POST /api/auth/login (staff JWT for cashier terminal)',
      customerRegister: 'POST /api/customers/register',
      customerLogin: 'POST /api/customers/login',
      cart: 'GET /api/cart',
      cartAddItem: 'POST /api/cart/items',
      cartUpdateItem: 'PATCH /api/cart/items/:id',
      cartRemoveItem: 'DELETE /api/cart/items/:id',
      cartClear: 'DELETE /api/cart',
      cartMerge: 'POST /api/cart/merge-from-session',
      purchaseHistory:
        'GET /api/purchase-history (x-customer-id; latest 10 cashier-validated smart baskets; display limit only)',
      purchaseHistoryDetail:
        'GET /api/purchase-history/:recordId (smart-basket-{positiveInteger} only; validated + owned)',
      recommendationRecipes:
        'GET /api/recommendations/recipes?limit=1-20 (x-customer-id; prototype customer header, not JWT)',
      recommendationRecipeDetail:
        'GET /api/recommendations/recipes/:recipeId (x-customer-id; full ranking, not truncated list search)',
      smartBasketQr: 'POST /api/smart-basket/session/qr (x-customer-id)',
      smartBasketCurrent: 'GET /api/smart-basket/session/current (x-customer-id)',
      smartBasketSession:
        'GET /api/smart-basket/session/:id (x-customer-id; owned session including terminal states; no token)',
      smartBasketCancel: 'POST /api/smart-basket/session/:id/cancel (x-customer-id)',
      adminCashierBasket: 'GET /api/admin/cashier/basket/:token (staff auth)',
      adminCashierValidate: 'POST /api/admin/cashier/basket/:token/validate (staff auth)',
      adminCashierReject: 'POST /api/admin/cashier/basket/:token/reject (staff auth)',
      adminAppConfig: 'GET /api/admin/app-config (ADMIN role)',
      adminUpdateBasketCapacity:
        'PUT /api/admin/app-config/max-basket-quantity (ADMIN role; body { value: 1-500 })',
      appConfigPublic:
        'GET /api/app-config (public; { maxBasketQuantity: { value, min, max, source } })',
      settingsPublic: 'GET /api/settings/public',
    },
  });
});

router.use('/health', healthRoutes);
router.use('/catalog', catalogRoutes);
router.use('/auth', authRoutes);
router.use('/customers', customerRoutes);
router.use('/cart', cartRoutes);
router.use('/purchase-history', purchaseHistoryRoutes);
router.use(
  '/recommendations',
  createRecommendationRoutes({
    controller: createRecommendationController(
      createRecommendationApiService({
        evidenceAdapter: createRecommendationEvidenceAdapter({
          executeReadOnlyQuery,
          getProducts,
        }),
        recipes: loadRecipeDataset(),
        mapProduct: recommendationMapProduct,
        interpretProduct: (product) =>
          interpretProductName(product, { mapProduct: recommendationMapProduct }),
      }),
    ),
  }),
);
router.use('/smart-basket', smartBasketRoutes);
router.use('/admin', adminRoutes);
router.use('/app-config', appConfigRoutes);
router.use('/settings', settingsRoutes);

export default router;
