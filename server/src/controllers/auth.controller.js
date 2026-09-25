import { asyncHandler } from '../utils/asyncHandler.js';
import { signAdminToken } from '../utils/jwtToken.js';
import * as authService from '../services/auth.service.js';

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body ?? {};

  if (isMissing(username) || isMissing(password)) {
    return res.status(400).json({
      message: 'Username and password are required.',
    });
  }

  const user = await authService.loginAdmin(String(username), String(password));
  const token = signAdminToken(user);
  res.status(200).json({
    message: 'Login successful.',
    user,
    token,
  });
});
