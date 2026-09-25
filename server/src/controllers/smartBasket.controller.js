import { asyncHandler } from '../utils/asyncHandler.js';
import * as smartBasketService from '../services/smartBasket.service.js';

export const createQrSession = asyncHandler(async (req, res) => {
  const data = await smartBasketService.createQrSessionFromCart(req.customerId);
  res.status(201).json({
    message: 'Smart basket QR created. Show it to the cashier within 10 minutes.',
    data: {
      sessionId: data.sessionId,
      token: data.token,
      expiresAt: data.expiresAt,
      itemCount: data.itemCount,
      uniqueProductCount: data.uniqueProductCount,
      status: data.status,
      qrValue: data.qrValue,
    },
  });
});

export const getCurrentSession = asyncHandler(async (req, res) => {
  const data = await smartBasketService.getCurrentSessionForCustomer(req.customerId);
  res.status(200).json({ data });
});

export const getSession = asyncHandler(async (req, res) => {
  const data = await smartBasketService.getSessionForCustomer(req.customerId, req.params.id);
  res.status(200).json({ data });
});

export const cancelSession = asyncHandler(async (req, res) => {
  const sessionId = req.params.id;
  const data = await smartBasketService.cancelSessionForCustomer(req.customerId, sessionId);
  res.status(200).json({ message: 'Smart basket session cancelled.', data });
});
