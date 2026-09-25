import { env } from '../config/env.js';

export function getHealthPayload() {
  return {
    status: 'ok',
    uptime: process.uptime(),
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  };
}
