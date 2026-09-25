import { asyncHandler } from '../utils/asyncHandler.js';
import * as customerService from '../services/customer.service.js';

export const register = asyncHandler(async (req, res) => {
  const customer = await customerService.registerCustomer(req.body ?? {});
  res.status(201).json({
    message: 'Customer registered successfully.',
    data: { customer },
  });
});

export const login = asyncHandler(async (req, res) => {
  const customer = await customerService.loginCustomer(req.body ?? {});
  res.status(200).json({
    message: 'Customer login successful.',
    data: { customer },
  });
});

export const me = asyncHandler(async (req, res) => {
  const customer = await customerService.getCustomerById(req.params.id);
  res.status(200).json({ data: { customer } });
});
