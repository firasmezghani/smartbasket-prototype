import { asyncHandler } from '../utils/asyncHandler.js';
import * as healthService from '../services/health.service.js';

export const getHealth = asyncHandler(async (req, res) => {
  const payload = healthService.getHealthPayload();
  res.status(200).json(payload);
});
