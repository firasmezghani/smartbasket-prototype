import sql from 'mssql';
import { getPool } from '../config/db.js';
import { assertReadOnlySelect } from './readOnlySql.js';

function toPlain(rows) {
  if (!rows) return [];
  if (Array.isArray(rows)) return rows;
  if (rows.recordset) return rows.recordset;
  return rows;
}

// Run a read-only parameterised query.
export async function executeReadOnlyQuery(text, inputs = []) {
  assertReadOnlySelect(text);
  const pool = await getPool();
  const request = pool.request();

  for (const { name, type, value } of inputs) {
    request.input(name, type, value);
  }

  const result = await request.query(text);
  return toPlain(result.recordset);
}

// True when the table exists in the dbo schema.
export async function tableExists(tableName) {
  const pool = await getPool();
  const result = await pool.request().input('tableName', sql.NVarChar(128), tableName).query(`
    SELECT CASE WHEN OBJECT_ID(N'dbo.' + @tableName, N'U') IS NOT NULL THEN 1 ELSE 0 END AS TableExists
  `);
  return Number(result.recordset?.[0]?.TableExists) === 1;
}
