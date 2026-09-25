// Creates a new throwaway test database. Never replaces or drops an existing one.
import sql from 'mssql';
import { readFileSync } from 'node:fs';
import { env } from '../src/config/env.js';
import { designatedDatabase, verifyPool, MARKER } from '../test-support/disposableDatabase.js';
const target = designatedDatabase();
if (!target) throw new Error('Explicit SB_TEST_DATABASE and SB_TEST_DISPOSABLE=YES required.');
const config = {
  server: env.DB_SERVER, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD,
  options: { encrypt: env.DB_ENCRYPT, trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE },
  connectionTimeout: 10000, requestTimeout: 30000,
};
let master; let pool;
try {
  master = await new sql.ConnectionPool({...config,database:'master'}).connect();
  const exists = await master.request().input('name',sql.NVarChar,target)
    .query('SELECT DB_ID(@name) AS id, DB_NAME() AS dbName');
  if (exists.recordset[0].dbName !== 'master' || exists.recordset[0].id !== null)
    throw new Error('Refusing provisioning: target exists or provisioning context is wrong. Choose a new name.');
  // `target` only has safe identifier characters, and `CREATE` cannot overwrite a database.
  await master.request().query(`CREATE DATABASE [${target}] COLLATE SQL_Latin1_General_CP1_CI_AS`);
  await master.close(); master = null;
  pool = await new sql.ConnectionPool({...config,database:target}).connect();
  const actual = await pool.request().query('SELECT DB_NAME() AS dbName');
  if (actual.recordset[0].dbName !== target) throw new Error('Wrong newly created database.');
  await pool.request().input('marker',sql.NVarChar,MARKER).query(`
    EXEC sys.sp_addextendedproperty @name=N'SmartBasketDisposableTest', @value=@marker;
  `);
  await verifyPool(pool,target);
  // Reuse the Flyway demo schema; never copy private data or run older migrations.
  const schema = readFileSync(new URL('../db/migration/V1__create_demo_schema.sql',import.meta.url),'utf8');
  if (!schema.includes('CREATE TABLE dbo.SB_Products') || /\bUSE\s+(SmartBasket|Saico|SmartBasketDemo)\b/i.test(schema))
    throw new Error('Schema preamble changed; review provisioning adapter.');
  for (const batch of schema.split(/^\s*GO\s*$/mi).filter(s=>s.trim())) {
    await verifyPool(pool,target);
    await pool.request().batch(batch);
  }
  await verifyPool(pool,target);
  await pool.request().batch(`
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    INSERT dbo.SB_Products (ProductId,ProductCode,ProductName,Price,Quantity,IsActive)
    VALUES ('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEE0001','TEST001',N'Synthetic Test Milk 1 l',1.250,100,1),
           ('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEE0002','TEST002',N'Synthetic Test Rice 1 kg',2.000,100,1);
    INSERT dbo.SB_ProductBarcodes (Barcode,ProductId,ProductCode)
    VALUES ('TEST-MILK-001','AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEE0001','TEST001'),
           ('TEST-RICE-002','AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEE0002','TEST002');
    INSERT dbo.SB_ProductMetadata (ProductId,DisplayName,DisplayCategory,IntelligenceType,IsRecipeEligible,CanonicalType,PackageAmount,PackageUnit,CurationVersion)
    VALUES ('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEE0001',N'Synthetic Test Milk 1 l','food','recipe',1,'milk',1000,'ml',1),
           ('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEE0002',N'Synthetic Test Rice 1 kg','food','recipe',1,'rice',1000,'g',1);
    INSERT dbo.SB_AppConfig (ConfigKey,ConfigValue,ValueType,MinValue,MaxValue)
    VALUES ('max_basket_quantity','100','int',1,500);
    INSERT dbo.SB_Settings (SettingKey,SettingValue,SettingType)
    VALUES ('store_name','Synthetic integration test','text'),('show_site_only_products','false','bool');
    INSERT dbo.SB_Customers (FullName,Email,PasswordHash)
    VALUES ('Synthetic Cashier Fixture','fixture@example.invalid','not-a-login-hash');
    COMMIT;
  `);
  const result=await pool.request().query(`SELECT DB_NAME() AS databaseName,
    (SELECT COUNT(*) FROM sys.tables WHERE schema_id=SCHEMA_ID('dbo')) AS applicationTables,
    (SELECT COUNT(*) FROM dbo.SB_Products) AS syntheticProducts`);
  console.log(JSON.stringify(result.recordset[0]));
} finally {
  if (pool) await pool.close();
  if (master) await master.close();
}
