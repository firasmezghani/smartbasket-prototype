// Stops the demo launcher if the database name or product count is wrong.

export const DEMO_DB_NAME = 'SmartBasketDemo';
export const DEMO_PORT = 3001;
export const DEMO_PRODUCT_COUNT = 91;

export function demoDatabaseGuardResult({ dbName, productCount }) {
  const name = typeof dbName === 'string' ? dbName.trim() : '';
  const count = Number(productCount);
  if (name !== DEMO_DB_NAME) {
    return {
      ok: false,
      reason: `connected to ${name || '(empty)'}, expected ${DEMO_DB_NAME}`,
    };
  }
  if (!Number.isInteger(count) || count !== DEMO_PRODUCT_COUNT) {
    return {
      ok: false,
      reason: `SB_Products has ${String(productCount)} rows, expected ${DEMO_PRODUCT_COUNT}`,
    };
  }
  return { ok: true };
}
