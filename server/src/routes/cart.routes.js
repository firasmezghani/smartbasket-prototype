import { Router } from 'express';
import * as cartController from '../controllers/cart.controller.js';

export const cartRoutes = Router();

// Cart writes only touch dbo.SB_CartItems; product data is read through the TabStocksaico view.
cartRoutes.get('/', cartController.getCart);
cartRoutes.post('/merge-from-session', cartController.mergeFromSession);
cartRoutes.post('/items', cartController.addItem);
cartRoutes.patch('/items/:id', cartController.updateItem);
cartRoutes.delete('/items/:id', cartController.removeItem);
cartRoutes.delete('/', cartController.clearCart);
