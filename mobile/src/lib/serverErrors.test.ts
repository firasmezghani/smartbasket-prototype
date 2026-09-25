import test from 'node:test';
import assert from 'node:assert/strict';

import { ApiError, handleResponse, serverErrorMessage } from '../api/http';
import { setGlobalLanguage } from '../i18n/translations';
import { isSmartBasketLimitError } from './smartBasket';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('known server codes are translated into the current language', () => {
  setGlobalLanguage('fr');
  try {
    assert.equal(serverErrorMessage('BASKET_LOCKED'), 'Le panier est occupé. Veuillez réessayer.');
    assert.match(serverErrorMessage('BASKET_CAPACITY_EXCEEDED', { maxBasketQuantity: 12 }), /12 articles/);
  } finally {
    setGlobalLanguage('en');
  }
});

test('unknown codes use the generic message', () => {
  assert.equal(serverErrorMessage('SOMETHING_NEW'), 'Something went wrong. Please try again.');
});

test('handleResponse uses the translated message but keeps code and details', async () => {
  const res = jsonResponse(409, {
    error: 'This basket is limited to 3 items in total.',
    code: 'BASKET_CAPACITY_EXCEEDED',
    details: { maxBasketQuantity: 3 },
  });
  await assert.rejects(handleResponse(res), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, 'BASKET_CAPACITY_EXCEEDED');
    assert.deepEqual(err.details, { maxBasketQuantity: 3 });
    assert.match(err.message, /limited to 3 items/);
    return true;
  });
});

test('errors without a code keep the server message', async () => {
  const res = jsonResponse(401, { error: 'Invalid email or password.' });
  await assert.rejects(handleResponse(res), /Invalid email or password\./);
});

test('login failures are translated from INVALID_CREDENTIALS', async () => {
  assert.equal(serverErrorMessage('INVALID_CREDENTIALS'), 'Invalid email or password.');
  setGlobalLanguage('fr');
  try {
    const res = jsonResponse(401, { error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
    await assert.rejects(handleResponse(res), /E-mail ou mot de passe incorrect\./);
  } finally {
    setGlobalLanguage('en');
  }
});

test('the 5-product limit is translated and still detected in both languages', async () => {
  for (const lang of ['en', 'fr'] as const) {
    setGlobalLanguage(lang);
    try {
      const res = jsonResponse(400, {
        error: 'Smart basket is limited to 5 different products for cashier validation.',
        code: 'BASKET_PRODUCT_LIMIT',
      });
      await assert.rejects(handleResponse(res), (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.match(err.message, lang === 'fr' ? /5 produits différents/ : /5 different products/);
        assert.equal(isSmartBasketLimitError(err), true);
        return true;
      });
    } finally {
      setGlobalLanguage('en');
    }
  }
});

test('registering with a taken email is translated from EMAIL_ALREADY_REGISTERED', async () => {
  assert.equal(serverErrorMessage('EMAIL_ALREADY_REGISTERED'), 'An account with this email already exists. Sign in instead.');
  setGlobalLanguage('fr');
  try {
    const res = jsonResponse(409, { error: 'A customer with this email already exists.', code: 'EMAIL_ALREADY_REGISTERED' });
    await assert.rejects(handleResponse(res), /Un compte existe déjà avec cet e-mail/);
  } finally {
    setGlobalLanguage('en');
  }
});
