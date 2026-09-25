import { Router } from 'express';
import { requireCustomer } from '../middleware/requireCustomer.js';
import * as purchaseHistoryController from '../controllers/purchaseHistory.controller.js';

export const purchaseHistoryRoutes = Router();

purchaseHistoryRoutes.use(requireCustomer);

purchaseHistoryRoutes.get('/', purchaseHistoryController.listPurchaseHistory);
purchaseHistoryRoutes.get('/:recordId', purchaseHistoryController.getPurchaseHistoryRecord);
