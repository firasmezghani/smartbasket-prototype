// Test-only database gate. No connection is opened without explicit opt-in.
export const MARKER = 'SmartBasket disposable integration fixtures v1';
export function designatedDatabase(settings = process.env) {
  const name = settings.SB_TEST_DATABASE;
  const consent = settings.SB_TEST_DISPOSABLE;
  if (!name && !consent) return null;
  if (consent !== 'YES') throw new Error('Set SB_TEST_DISPOSABLE=YES explicitly.');
  if (typeof name !== 'string' || /^(smartbasketdemo|smartbasket|saico)$/i.test(name.trim())
      || !/^SmartBasketTest_[A-Za-z0-9_]{1,80}$/.test(name)) {
    throw new Error('Disposable database must be named SmartBasketTest_<unique_suffix>; protected databases are forbidden.');
  }
  return name;
}
export function assertIdentity(expected, row) {
  if (!expected || designatedDatabase({ SB_TEST_DATABASE: expected, SB_TEST_DISPOSABLE: 'YES' }) !== expected
      || row?.dbName !== expected || row?.marker !== MARKER) {
    throw new Error('Refusing database writes: connected database identity/disposable marker mismatch.');
  }
}
export async function verifyPool(pool, expected) {
  const result = await pool.request().query(`
    SELECT DB_NAME() AS dbName,
      CAST((SELECT value FROM sys.extended_properties
        WHERE class = 0 AND name = N'SmartBasketDisposableTest') AS nvarchar(200)) AS marker
  `);
  assertIdentity(expected, result.recordset?.[0]);
}
export async function openDisposableDatabase() {
  const expected = designatedDatabase();
  if (!expected) return null;
  const { env } = await import('../src/config/env.js');
  const { closePool, getPool } = await import('../src/config/db.js');
  await closePool();
  env.DB_NAME = expected; // this test process only; never rewrite .env
  const pool = await getPool();
  try { await verifyPool(pool, expected); }
  catch (error) { await closePool(); throw error; }
  return expected;
}
