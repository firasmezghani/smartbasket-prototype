import { AppError } from '../utils/AppError.js';

// Hides raw SQL Server errors. A missing customer (foreign key on SB_Customers)
// returns 401 so the user signs in again.
export function databaseErrorResponse(err) {
  if (typeof err?.number !== 'number') return null;
  if (err.number === 547 && /SB_Customers/i.test(String(err.message))) {
    return {
      statusCode: 401,
      code: 'CUSTOMER_NOT_FOUND',
      message: 'Your account was not found. Please sign out and sign in again.',
    };
  }
  return {
    statusCode: 500,
    code: 'DATABASE_ERROR',
    message: 'A database error occurred. Please try again.',
  };
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const dbError = err instanceof AppError ? null : databaseErrorResponse(err);
  if (dbError) {
    console.error(err);
    return res.status(dbError.statusCode).json({ error: dbError.message, code: dbError.code });
  }

  const statusCode = err.statusCode ?? 500;
  const isOperational = err instanceof AppError && err.isOperational;

  if (!isOperational && statusCode >= 500) {
    console.error(err);
  }

  // Only our own AppError messages reach the client; the details stay in the log.
  let message = 'Internal server error';
  if (isOperational) message = err.message;
  else if (statusCode < 500) message = 'Invalid request.';

  res.status(statusCode).json({
    error: message,
    ...(err instanceof AppError && err.code ? { code: err.code } : {}),
    ...(err instanceof AppError && err.details ? { details: err.details } : {}),
  });
}
