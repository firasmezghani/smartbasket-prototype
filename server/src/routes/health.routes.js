import { Router } from 'express';
import * as healthController from '../controllers/health.controller.js';

export const healthRoutes = Router();

healthRoutes.get('/', healthController.getHealth);
