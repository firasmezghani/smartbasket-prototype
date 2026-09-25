import { asyncHandler } from '../utils/asyncHandler.js';
import * as settingsService from '../services/settings.service.js';

export const listPublicSettings = asyncHandler(async (req, res) => {
  const rows = await settingsService.getPublicSettings();
  res.status(200).json({ data: rows });
});
