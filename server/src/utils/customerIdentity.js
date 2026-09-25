import { AppError } from './AppError.js';

export function parseCustomerId(req) {
  const raw = req.headers['x-customer-id'];
  const customerId =
    raw === undefined || raw === null || raw === ''
      ? null
      : Number.parseInt(String(raw).trim(), 10);

  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw new AppError('Please sign in to continue.', 401);
  }
  return customerId;
}
