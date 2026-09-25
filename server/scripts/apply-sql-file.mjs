// Applies a SQL script that may contain `GO` batches (run: node scripts/apply-sql-file.mjs <file>).

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPool, closePool } from '../src/config/db.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const rel = process.argv[2];
if (!rel) {
  console.error('Usage: node scripts/apply-sql-file.mjs <sql-file>');
  process.exitCode = 1;
  process.exit();
}
const filePath = isAbsolute(rel) ? rel : resolve(moduleDir, '..', rel);

function splitGo(sql) {
  return sql
    .split(/^\s*GO\s*(?:--.*)?$/gim)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

async function main() {
  const sql = readFileSync(filePath, 'utf8');
  const batches = splitGo(sql);
  const pool = await getPool();
  for (const batch of batches) {
    const request = pool.request();
    request.on('info', (info) => {
      const msg = String(info?.message ?? info ?? '').trim();
      if (msg) console.log(msg);
    });
    const result = await request.batch(batch);
    const sets = Array.isArray(result.recordsets) ? result.recordsets : result.recordset ? [result.recordset] : [];
    for (const rs of sets) {
      if (rs?.length) console.log(JSON.stringify(rs, null, 2));
    }
  }
  console.log(`OK ${filePath} (${batches.length} batches)`);
}

main()
  .catch((err) => {
    console.error(`apply-sql-file failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => closePool().catch(() => {}));
