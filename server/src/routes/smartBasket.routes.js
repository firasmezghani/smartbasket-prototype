import { Router } from 'express';
import { requireCustomer } from '../middleware/requireCustomer.js';
import * as smartBasketController from '../controllers/smartBasket.controller.js';

export const smartBasketRoutes = Router();

smartBasketRoutes.use(requireCustomer);

smartBasketRoutes.post('/session/qr', smartBasketController.createQrSession);
smartBasketRoutes.get('/session/current', smartBasketController.getCurrentSession);
smartBasketRoutes.get('/session/:id', smartBasketController.getSession);
smartBasketRoutes.post('/session/:id/cancel', smartBasketController.cancelSession);
