import { parseCustomerId } from '../utils/customerIdentity.js';

export function requireCustomer(req, res, next) {
  try {
    req.customerId = parseCustomerId(req);
    return next();
  } catch (err) {
    return next(err);
  }
}
