import { asyncHandler } from '../utils/asyncHandler.js';
import * as smartBasketService from '../services/smartBasket.service.js';

export const getBasketByToken = asyncHandler(async (req, res) => {
  const data = await smartBasketService.getCashierBasketByToken(req.params.token);
  res.status(200).json({ data });
});

export const validateBasket = asyncHandler(async (req, res) => {
  const staffUsername = req.user?.username ?? req.user?.sub ?? 'staff';
  const data = await smartBasketService.validateBasketByToken(req.params.token, staffUsername);
  res.status(200).json({
    message: 'Basket approved successfully.',
    data: {
      ...data,
      trace: {
        sessionId: data.session?.id,
        status: data.session?.status,
        validatedAt: data.session?.validatedAt ?? null,
        staff: data.latestValidation?.validatedBy ?? staffUsername,
        validationSaved: Boolean(data.latestValidation),
      },
    },
  });
});

export const rejectBasket = asyncHandler(async (req, res) => {
  const staffUsername = req.user?.username ?? req.user?.sub ?? 'staff';
  const notes = req.body?.notes ?? req.body?.note ?? null;
  const data = await smartBasketService.rejectBasketByToken(
    req.params.token,
    staffUsername,
    notes,
  );
  res.status(200).json({
    message: 'Smart basket rejected.',
    data: {
      ...data,
      trace: {
        sessionId: data.session?.id,
        status: data.session?.status,
        rejectedAt: data.session?.rejectedAt ?? null,
        staff: data.latestValidation?.validatedBy ?? staffUsername,
        validationSaved: Boolean(data.latestValidation),
        notes: data.latestValidation?.notes ?? notes,
      },
    },
  });
});
