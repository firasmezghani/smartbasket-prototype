import { Router } from 'express';
import * as customerController from '../controllers/customer.controller.js';

export const customerRoutes = Router();

// Only writes to dbo.SB_Customers.
customerRoutes.post('/register', customerController.register);
customerRoutes.post('/login', customerController.login);
