// Sign-up checks: the server's required fields, plus email format and password confirmation.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export type RegistrationInput = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type RegistrationProblem =
  | 'nameRequired'
  | 'emailRequired'
  | 'emailInvalid'
  | 'passwordRequired'
  | 'passwordMismatch';

// The first problem with the input in display order, or null when acceptable.
export function findRegistrationProblem(
  input: RegistrationInput,
): RegistrationProblem | null {
  if (!input.fullName.trim()) return 'nameRequired';
  if (!input.email.trim()) return 'emailRequired';
  if (!isValidEmail(input.email)) return 'emailInvalid';
  if (!input.password) return 'passwordRequired';
  if (input.confirmPassword !== input.password) return 'passwordMismatch';
  return null;
}
