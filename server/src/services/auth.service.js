import bcrypt from 'bcryptjs';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

// Dummy bcrypt hash so an unknown username takes as long to check as a real one.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-account-timing-guard', 10);

// Staff login (ADMIN or CASHIER). Wrong username and wrong password give the
// same error and take the same time, so usernames cannot be guessed.
export async function loginAdmin(username, password) {
  const submittedUsername = String(username ?? '').trim().toLowerCase();
  const submittedPassword = String(password ?? '');

  const accounts = [
    {
      role: 'ADMIN',
      username: env.ADMIN_USERNAME,
      realName: env.ADMIN_DISPLAY_NAME,
      passwordHash: env.ADMIN_PASSWORD_HASH,
    },
    {
      role: 'CASHIER',
      username: env.CASHIER_USERNAME,
      realName: env.CASHIER_DISPLAY_NAME,
      passwordHash: env.CASHIER_PASSWORD_HASH,
    },
  ];

  const matchedAccount =
    accounts.find((account) => submittedUsername === String(account.username).trim().toLowerCase()) ??
    null;

  const passwordMatches = await bcrypt.compare(
    submittedPassword,
    matchedAccount ? matchedAccount.passwordHash : DUMMY_PASSWORD_HASH,
  );

  if (matchedAccount && passwordMatches) {
    return {
      username: matchedAccount.username,
      realName: matchedAccount.realName,
      role: matchedAccount.role,
    };
  }

  throw new AppError('Invalid username or password.', 401);
}
