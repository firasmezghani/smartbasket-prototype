import { Router } from 'express';
import * as appConfigController from '../controllers/appConfig.controller.js';

export const appConfigRoutes = Router();

// Public settings the app uses for instant feedback. The server still checks every basket change.
appConfigRoutes.get('/', appConfigController.getPublicAppConfig);
