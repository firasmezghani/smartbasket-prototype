import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findRegistrationProblem,
  isValidEmail,
  type RegistrationInput,
} from './authValidation';

const ok = (over: Partial<RegistrationInput> = {}): RegistrationInput => ({
  fullName: 'Sam Taylor',
  email: 'sam@example.com',
  password: 'secret123',
  confirmPassword: 'secret123',
  ...over,
});

test('isValidEmail accepts a normal address and trims first', () => {
  assert.equal(isValidEmail('sam@example.com'), true);
  assert.equal(isValidEmail('  sam@example.com  '), true);
});

test('isValidEmail rejects malformed addresses', () => {
  for (const bad of ['', 'sam', 'sam@', '@example.com', 'sam@example', 'a b@c.com']) {
    assert.equal(isValidEmail(bad), false, bad);
  }
});

test('findRegistrationProblem returns null for a well-formed input', () => {
  assert.equal(findRegistrationProblem(ok()), null);
});

test('findRegistrationProblem reports the first problem in display order', () => {
  assert.equal(findRegistrationProblem(ok({ fullName: '   ' })), 'nameRequired');
  assert.equal(findRegistrationProblem(ok({ email: '' })), 'emailRequired');
  assert.equal(findRegistrationProblem(ok({ email: 'nope' })), 'emailInvalid');
  assert.equal(findRegistrationProblem(ok({ password: '', confirmPassword: '' })), 'passwordRequired');
  assert.equal(findRegistrationProblem(ok({ confirmPassword: 'different' })), 'passwordMismatch');
});

test('any non-empty password that matches its confirmation is accepted', () => {
  assert.equal(findRegistrationProblem(ok({ password: 'x', confirmPassword: 'x' })), null);
});
