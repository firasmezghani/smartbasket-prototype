import { Router } from 'express';
import * as settingsController from '../controllers/settings.controller.js';

export const settingsRoutes = Router();

settingsRoutes.get('/public', settingsController.listPublicSettings);
