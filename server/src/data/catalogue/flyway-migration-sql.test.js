import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkTargetName, FLYWAY_IMAGE } from '../../../scripts/flyway-install.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationDir = join(root, 'db/migration');
const read = (name) => readFileSync(join(migrationDir, name), 'utf8');
const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

function sectionRows(sql, table) {
  const start = sql.indexOf(`INSERT INTO dbo.${table} (`);
  assert.notEqual(start, -1, `${table} insert missing`);
  const end = sql.indexOf('\nGO', start);
  return sql.slice(start, end).split('\n').filter((l) => l.startsWith('  (')).length;
}

describe('Flyway install path (server/db/migration)', () => {
  it('ships exactly V1 schema and V2 public seed', () => {
    assert.deepEqual(readdirSync(migrationDir).sort(), [
      'V1__create_demo_schema.sql',
      'V2__seed_demo_catalogue.sql',
    ]);
  });

  it('never switches database or references SmartBasket / Saico', () => {
    for (const name of readdirSync(migrationDir)) {
      const body = stripComments(read(name));
      assert.doesNotMatch(body, /\bUSE\s+/i, `${name} must not contain USE`);
      assert.doesNotMatch(body, /\bSmartBasket\s*\.|\bSaico\s*\./i, `${name} must not read other databases`);
      assert.doesNotMatch(body, /\$\{/, `${name} must not contain Flyway placeholders`);
    }
  });

  it('V1 creates the ten tables, two views and trigger, and no retired tables', () => {
    const v1 = read('V1__create_demo_schema.sql');
    assert.equal((v1.match(/CREATE TABLE dbo\./g) || []).length, 10);
    assert.match(v1, /CREATE OR ALTER VIEW dbo\.TabStocksaico/);
    assert.match(v1, /CREATE OR ALTER VIEW dbo\.TabStockBarCodesaico/);
    assert.match(v1, /TR_SB_ProductMetadata_SetUpdatedAt/);
    assert.doesNotMatch(v1, /CREATE TABLE dbo\.(SB_Families|SB_Subfamilies|SB_Brands|SB_ProductInterpretation|SB_EvaluationGroundTruth|WEB_)/);
  });

  it('V2 seeds 91 / 164 / 91 and no personal or session data', () => {
    const v2 = read('V2__seed_demo_catalogue.sql');
    assert.equal(sectionRows(v2, 'SB_Products'), 91);
    assert.equal(sectionRows(v2, 'SB_ProductBarcodes'), 164);
    assert.equal(sectionRows(v2, 'SB_ProductMetadata'), 91);
    const body = stripComments(v2);
    assert.doesNotMatch(body, /INSERT INTO dbo\.(SB_Customers|SB_CartItems|SB_SmartBasketSessions|SB_SmartBasketItems|SB_CashierValidations)/);
    assert.doesNotMatch(body, /PasswordHash|TokenHash/);
  });

  it('runner refuses protected or malformed database names and pins Flyway', () => {
    for (const bad of ['SmartBasket', 'smartbasket', 'Saico', 'master', 'tempdb', '', 'x;DROP', '1abc']) {
      assert.ok(checkTargetName(bad), `${bad} should be refused`);
    }
    assert.equal(checkTargetName('SmartBasketFlyway_Verify'), null);
    assert.match(FLYWAY_IMAGE, /^flyway\/flyway@sha256:[0-9a-f]{64}$/);
  });
});
