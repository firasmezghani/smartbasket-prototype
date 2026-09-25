import { test } from 'node:test';
import assert from 'node:assert/strict';

import { databaseErrorResponse, errorHandler } from './errorHandler.js';
import { AppError } from '../utils/AppError.js';

function fakeRes() {
  return {
    headersSent: false,
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const fkCustomer = Object.assign(
  new Error('The INSERT statement conflicted with the FOREIGN KEY constraint "FK_SB_CartItems_Customer". The conflict occurred in database "SmartBasketDemo", table "dbo.SB_Customers", column \'Id\'.'),
  { number: 547 },
);

test('unknown customer foreign-key error becomes 401 CUSTOMER_NOT_FOUND without SQL text', () => {
  const res = fakeRes();
  const original = console.error;
  console.error = () => {};
  try { errorHandler(fkCustomer, {}, res, () => {}); } finally { console.error = original; }
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'CUSTOMER_NOT_FOUND');
  assert.doesNotMatch(JSON.stringify(res.body), /INSERT|FOREIGN KEY|SmartBasketDemo|stack/);
});

test('other SQL errors are hidden behind a generic 500', () => {
  const r = databaseErrorResponse(Object.assign(new Error('Invalid column name X'), { number: 207 }));
  assert.equal(r.statusCode, 500);
  assert.equal(r.code, 'DATABASE_ERROR');
  assert.doesNotMatch(r.message, /column/);
});

test('non-database errors are not treated as database errors', () => {
  assert.equal(databaseErrorResponse(new Error('plain')), null);
});

test('unexpected errors return a generic message and never a stack', () => {
  const res = fakeRes();
  const original = console.error;
  console.error = () => {};
  try {
    errorHandler(new Error('Failed to connect to localhost:1433'), {}, res, () => {});
  } finally {
    console.error = original;
  }
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
});

test('expected app errors keep their message and code', () => {
  const res = fakeRes();
  errorHandler(new AppError('Cart item not found.', 404, { code: 'X' }), {}, res, () => {});
  assert.deepEqual(res.body, { error: 'Cart item not found.', code: 'X' });
});

test('other client errors (e.g. malformed JSON) return a plain message', () => {
  const res = fakeRes();
  const parseError = Object.assign(new SyntaxError('Unexpected token } in JSON at position 9'), { statusCode: 400 });
  errorHandler(parseError, {}, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Invalid request.' });
});
