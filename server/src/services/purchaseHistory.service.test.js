import test from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../utils/AppError.js';
import {
  CUSTOMER_HISTORY_DETAIL_SESSION_SQL,
  CUSTOMER_HISTORY_LIST_SQL,
  CUSTOMER_HISTORY_VALIDATED_STATUS_SQL,
  PURCHASE_HISTORY_LIMIT,
  getPurchaseHistoryDetail,
  mapCustomerValidatedBasketSummary,
  parseCustomerPurchaseHistoryRecordId,
} from './purchaseHistory.service.js';

function expectAppError(fn) {
  try {
    fn();
    assert.fail('expected AppError');
  } catch (err) {
    assert.ok(err instanceof AppError);
    assert.equal(err.statusCode, 400);
  }
}

test('customer history accepts a valid smart-basket record id', () => {
  assert.deepEqual(parseCustomerPurchaseHistoryRecordId('smart-basket-12'), {
    type: 'smart_basket',
    numericId: 12,
    recordId: 'smart-basket-12',
  });
  assert.equal(parseCustomerPurchaseHistoryRecordId('SMART-BASKET-3').numericId, 3);
});

test('customer history rejects a malformed record id', () => {
  expectAppError(() => parseCustomerPurchaseHistoryRecordId(''));
  expectAppError(() => parseCustomerPurchaseHistoryRecordId('smart-basket'));
  expectAppError(() => parseCustomerPurchaseHistoryRecordId('smart-basket-'));
  expectAppError(() => parseCustomerPurchaseHistoryRecordId('12'));
  expectAppError(() => parseCustomerPurchaseHistoryRecordId('basket-12'));
});

test('customer history rejects zero or negative smart-basket ids', () => {
  expectAppError(() => parseCustomerPurchaseHistoryRecordId('smart-basket-0'));
  expectAppError(() => parseCustomerPurchaseHistoryRecordId('smart-basket-00'));
  expectAppError(() => parseCustomerPurchaseHistoryRecordId('smart-basket--1'));
});

test('customer history rejects order-* record ids', () => {
  expectAppError(() => parseCustomerPurchaseHistoryRecordId('order-1'));
  expectAppError(() => parseCustomerPurchaseHistoryRecordId('ORDER-12'));
  expectAppError(() => parseCustomerPurchaseHistoryRecordId('order-0'));
  expectAppError(() => parseCustomerPurchaseHistoryRecordId('order-abc'));
});

test('detail endpoint rejects order-* ids before any database lookup', async () => {
  await assert.rejects(
    () => getPurchaseHistoryDetail(1, 'order-4'),
    (err) => err instanceof AppError && err.statusCode === 400,
  );
});

test('customer history display limit remains 10', () => {
  assert.equal(PURCHASE_HISTORY_LIMIT, 10);
  assert.match(CUSTOMER_HISTORY_LIST_SQL, /SELECT TOP \(@fetchLimit\)/);
});

test('customer history SQL requires validated status and customer ownership', () => {
  assert.equal(CUSTOMER_HISTORY_VALIDATED_STATUS_SQL, "Status = N'validated'");
  assert.match(CUSTOMER_HISTORY_LIST_SQL, /s\.Status = N'validated'/);
  assert.match(CUSTOMER_HISTORY_LIST_SQL, /s\.CustomerId = @customerId/);
  assert.match(CUSTOMER_HISTORY_DETAIL_SESSION_SQL, /Status = N'validated'/);
  assert.match(CUSTOMER_HISTORY_DETAIL_SESSION_SQL, /Id = @sessionId/);
  assert.match(CUSTOMER_HISTORY_DETAIL_SESSION_SQL, /CustomerId = @customerId/);

  assert.doesNotMatch(CUSTOMER_HISTORY_LIST_SQL, /WEB_Orders/);
  assert.doesNotMatch(CUSTOMER_HISTORY_DETAIL_SESSION_SQL, /WEB_Orders/);
  assert.doesNotMatch(CUSTOMER_HISTORY_LIST_SQL, /Status IN\s*\(/i);
  assert.doesNotMatch(CUSTOMER_HISTORY_DETAIL_SESSION_SQL, /Status IN\s*\(/i);
  assert.doesNotMatch(CUSTOMER_HISTORY_LIST_SQL, /N'rejected'|N'expired'|N'cancelled'|N'active'/);
  assert.doesNotMatch(CUSTOMER_HISTORY_DETAIL_SESSION_SQL, /N'rejected'|N'expired'|N'cancelled'|N'active'/);
});

test('customer-history mapping never produces a website_order type', () => {
  const mapped = mapCustomerValidatedBasketSummary(
    {
      Id: 7,
      ItemCount: 4,
      UniqueProductCount: 2,
      EstimatedSubtotal: 3.5,
      CreatedAt: '2026-01-01T00:00:00.000Z',
      ValidatedAt: '2026-01-02T00:00:00.000Z',
    },
    null,
  );
  assert.equal(mapped.type, 'smart_basket');
  assert.notEqual(mapped.type, 'website_order');
  assert.equal(mapped.id, 'smart-basket-7');
  assert.equal(mapped.status, 'validated');
  assert.equal(mapped.sourceLabel, 'Cashier-validated basket');
  assert.equal(mapped.total, null);
});
