import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signAdminToken(user) {
  return jwt.sign(
    {
      sub: user.username,
      username: user.username,
      role: user.role,
      realName: user.realName ?? null,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}
