import { AppError } from '../utils/AppError.js';
import { verifyToken } from '../utils/jwtToken.js';

function getBearerToken(req) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return next(new AppError('Authentication token is required.', 401));

  try {
    const payload = verifyToken(token);
    req.user = {
      ...payload,
      username: payload.username ?? payload.sub,
    };
    return next();
  } catch {
    return next(new AppError('Invalid or expired authentication token.', 401));
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return next(new AppError('Admin access is required.', 403));
  }
  return next();
}
