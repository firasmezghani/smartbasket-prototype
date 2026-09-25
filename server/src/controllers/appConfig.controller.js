import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getMaxBasketQuantityConfig,
  updateMaxBasketQuantity,
} from '../services/appConfig.service.js';

// Public settings for the mobile app (basket limit). The server still checks
// every basket change.
export const getPublicAppConfig = asyncHandler(async (req, res) => {
  const maxBasket = await getMaxBasketQuantityConfig();
  res.status(200).json({
    data: {
      maxBasketQuantity: {
        value: maxBasket.value,
        min: maxBasket.min,
        max: maxBasket.max,
        source: maxBasket.source,
      },
    },
  });
});

// Admin view: same value plus the audit fields.
export const getAdminAppConfig = asyncHandler(async (req, res) => {
  const maxBasket = await getMaxBasketQuantityConfig();
  res.status(200).json({ data: { maxBasketQuantity: maxBasket } });
});

// Admin update for `max_basket_quantity`. Strict integer validation in [1, 500].
export const putMaxBasketQuantity = asyncHandler(async (req, res) => {
  const raw = req.body?.value ?? req.body?.maxBasketQuantity;
  const actor = req.user?.username ?? req.user?.sub ?? 'admin';
  const updated = await updateMaxBasketQuantity(raw, actor);
  res.status(200).json({
    message: 'Basket capacity updated.',
    data: { maxBasketQuantity: updated },
  });
});
