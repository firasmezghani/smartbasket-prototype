import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import * as cartService from '../services/cart.service.js';

export const getCart = asyncHandler(async (req, res) => {
  const identity = cartService.parseCartIdentity(req);
  const data = await cartService.getCart(identity);
  res.status(200).json({ data });
});

export const addItem = asyncHandler(async (req, res) => {
  const identity = cartService.parseCartIdentity(req);
  const body = req.body ?? {};
  const productId = body.productId ?? body.product_id;
  const quantity = body.quantity;
  const data = await cartService.addCartItem(identity, productId, quantity);
  res.status(200).json({ message: 'Item added to cart.', data });
});

export const updateItem = asyncHandler(async (req, res) => {
  const identity = cartService.parseCartIdentity(req);
  const { id } = req.params;
  const quantity = req.body?.quantity;
  const data = await cartService.updateCartItemQuantity(identity, id, quantity);
  res.status(200).json({ message: 'Cart updated.', data });
});

export const removeItem = asyncHandler(async (req, res) => {
  const identity = cartService.parseCartIdentity(req);
  const { id } = req.params;
  const data = await cartService.removeCartItem(identity, id);
  res.status(200).json({ message: 'Item removed.', data });
});

export const clearCart = asyncHandler(async (req, res) => {
  const identity = cartService.parseCartIdentity(req);
  const data = await cartService.clearCart(identity);
  res.status(200).json({ message: 'Cart cleared.', data });
});

export const mergeFromSession = asyncHandler(async (req, res) => {
  const identity = cartService.parseCartIdentity(req);
  if (!identity.customerId) {
    throw new AppError('Please sign in to merge your cart.', 401);
  }
  const body = req.body ?? {};
  const sessionId = body.sessionId ?? body.guestSessionId;
  await cartService.mergeGuestSessionIntoCustomer(identity.customerId, String(sessionId ?? ''));
  const data = await cartService.getCart(identity);
  res.status(200).json({ message: 'Guest cart merged into your account.', data });
});
