export class AppError extends Error {
  // safe message for the client
  // `code` is a stable error id; `details` is a small safe payload.
  constructor(message, statusCode = 500, options = {}) {
    super(message);
    const opts = options ?? {};
    this.statusCode = statusCode;
    this.isOperational = opts.isOperational ?? true;
    this.code = typeof opts.code === 'string' && opts.code ? opts.code : undefined;
    this.details =
      opts.details && typeof opts.details === 'object' && !Array.isArray(opts.details)
        ? opts.details
        : undefined;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
