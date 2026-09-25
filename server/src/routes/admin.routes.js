import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.js';
import * as adminCashierController from '../controllers/adminCashier.controller.js';
import * as appConfigController from '../controllers/appConfig.controller.js';

export const adminRoutes = Router();

// Every /api/admin route requires a valid staff JWT (Bearer). Customer identity
// (the x-customer-id header) is never accepted here.
adminRoutes.use(requireAuth);

// --- Cashier validation (ADMIN or CASHIER) ---
adminRoutes.get('/cashier/basket/:token', adminCashierController.getBasketByToken);
adminRoutes.post('/cashier/basket/:token/validate', adminCashierController.validateBasket);
adminRoutes.post('/cashier/basket/:token/reject', adminCashierController.rejectBasket);

// --- Admin area (ADMIN only) ---
// requireAdmin rejects a valid CASHIER token with 403.
adminRoutes.get('/app-config', requireAdmin, appConfigController.getAdminAppConfig);
adminRoutes.put(
  '/app-config/max-basket-quantity',
  requireAdmin,
  appConfigController.putMaxBasketQuantity,
);
