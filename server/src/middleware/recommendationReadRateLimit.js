import rateLimit from 'express-rate-limit';

// Limit recommendation requests to 30 per minute per IP.
export function createRecommendationReadRateLimiter(overrides = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many recommendation requests. Please try again shortly.',
    },
    ...overrides,
  });
}

export const recommendationReadRateLimiter = createRecommendationReadRateLimiter();
