/*
  Read-only verification of a Flyway-installed SmartBasket demonstration
  database. Run in the target database (e.g. sqlcmd -d <database>); the
  flyway-install script runs it automatically after "flyway migrate".

  Derived from server/sql/demo-minimal/040_verify.sql: the same schema,
  index, view, trigger and 91 / 164 / 91 catalogue assertions, except that
  Flyway's own dbo.flyway_schema_history table is not counted as an
  application table, and there is no check of the private SmartBasket
  source (a public install has none).

  SELECT / PRINT only.
*/

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

PRINT N'--- Flyway history ---';
IF OBJECT_ID(N'dbo.flyway_schema_history', N'U') IS NULL
  THROW 51041, 'verify FAIL: dbo.flyway_schema_history missing (database was not installed by Flyway).', 1;
SELECT installed_rank, version, description, success
FROM dbo.flyway_schema_history
ORDER BY installed_rank;
IF EXISTS (SELECT 1 FROM dbo.flyway_schema_history WHERE success = 0)
  THROW 51041, 'verify FAIL: a Flyway migration is recorded as failed.', 1;
GO

PRINT N'--- tables present ---';
SELECT t.name AS TableName
FROM sys.tables t
WHERE t.schema_id = SCHEMA_ID(N'dbo') AND t.name <> N'flyway_schema_history'
ORDER BY t.name;

DECLARE @TableCount INT = (SELECT COUNT(*) FROM sys.tables WHERE schema_id = SCHEMA_ID(N'dbo') AND name <> N'flyway_schema_history');
IF @TableCount <> 10
BEGIN
  THROW 51040, 'verify FAIL: expected exactly 10 user tables.', 1;
END;

IF OBJECT_ID(N'dbo.SB_Families', N'U') IS NOT NULL
  OR OBJECT_ID(N'dbo.SB_Subfamilies', N'U') IS NOT NULL
  OR OBJECT_ID(N'dbo.SB_Brands', N'U') IS NOT NULL
  OR OBJECT_ID(N'dbo.SB_ProductInterpretationOverrides', N'U') IS NOT NULL
  OR OBJECT_ID(N'dbo.SB_ProductInterpretationAudit', N'U') IS NOT NULL
  OR OBJECT_ID(N'dbo.SB_EvaluationGroundTruth', N'U') IS NOT NULL
  OR OBJECT_ID(N'dbo.WEB_Settings', N'U') IS NOT NULL
BEGIN
  THROW 51040, 'verify FAIL: a retired/unnecessary table exists on SmartBasketDemo.', 1;
END;

IF OBJECT_ID(N'dbo.TabStocksaico', N'V') IS NULL
  OR OBJECT_ID(N'dbo.TabStockBarCodesaico', N'V') IS NULL
BEGIN
  THROW 51040, 'verify FAIL: compatibility views missing.', 1;
END;

IF OBJECT_ID(N'dbo.TR_SB_ProductMetadata_SetUpdatedAt', N'TR') IS NULL
BEGIN
  THROW 51040, 'verify FAIL: metadata UpdatedAt trigger missing.', 1;
END;

PRINT N'--- row counts ---';
SELECT 'SB_Products' AS TableName, COUNT(*) AS Rows FROM dbo.SB_Products
UNION ALL SELECT 'SB_ProductBarcodes', COUNT(*) FROM dbo.SB_ProductBarcodes
UNION ALL SELECT 'SB_ProductMetadata', COUNT(*) FROM dbo.SB_ProductMetadata
UNION ALL SELECT 'SB_AppConfig', COUNT(*) FROM dbo.SB_AppConfig
UNION ALL SELECT 'SB_Settings', COUNT(*) FROM dbo.SB_Settings
UNION ALL SELECT 'SB_Customers', COUNT(*) FROM dbo.SB_Customers
UNION ALL SELECT 'SB_CartItems', COUNT(*) FROM dbo.SB_CartItems
UNION ALL SELECT 'SB_SmartBasketSessions', COUNT(*) FROM dbo.SB_SmartBasketSessions
UNION ALL SELECT 'SB_SmartBasketItems', COUNT(*) FROM dbo.SB_SmartBasketItems
UNION ALL SELECT 'SB_CashierValidations', COUNT(*) FROM dbo.SB_CashierValidations;

DECLARE @Products INT = (SELECT COUNT(*) FROM dbo.SB_Products);
DECLARE @Barcodes INT = (SELECT COUNT(*) FROM dbo.SB_ProductBarcodes);
DECLARE @Meta INT = (SELECT COUNT(*) FROM dbo.SB_ProductMetadata);
DECLARE @V3 INT = (SELECT COUNT(*) FROM dbo.SB_ProductMetadata WHERE CurationVersion = 3);
DECLARE @Recipe INT = (SELECT COUNT(*) FROM dbo.SB_ProductMetadata WHERE CurationVersion = 3 AND IsRecipeEligible = 1);
DECLARE @Hidden INT = (SELECT COUNT(*) FROM dbo.SB_ProductMetadata WHERE IsVisible = 0);
DECLARE @OrphanMeta INT = (
  SELECT COUNT(*) FROM dbo.SB_ProductMetadata m
  WHERE NOT EXISTS (SELECT 1 FROM dbo.SB_Products p WHERE p.ProductId = m.ProductId)
);
DECLARE @V3WithBarcode INT = (
  SELECT COUNT(*) FROM dbo.SB_ProductMetadata m
  WHERE m.CurationVersion = 3
    AND EXISTS (SELECT 1 FROM dbo.SB_ProductBarcodes b WHERE b.ProductId = m.ProductId)
);
DECLARE @AppConfig INT = (SELECT COUNT(*) FROM dbo.SB_AppConfig WHERE ConfigKey = N'max_basket_quantity');
DECLARE @StoreName INT = (SELECT COUNT(*) FROM dbo.SB_Settings WHERE SettingKey = N'store_name');
DECLARE @SiteOnly INT = (SELECT COUNT(*) FROM dbo.SB_Settings WHERE SettingKey = N'show_site_only_products');
DECLARE @ViewsMatch INT = (
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM dbo.TabStocksaico) = @Products
     AND (SELECT COUNT(*) FROM dbo.TabStockBarCodesaico) = @Barcodes
    THEN 1 ELSE 0 END
);

IF @Products <> 91 OR @Barcodes <> 164 OR @Meta <> 91 OR @V3 <> 91
  THROW 51040, 'verify FAIL: curated subset is not 91 products / 164 barcodes / 91 metadata.', 1;
IF @Recipe <> 35
  THROW 51040, 'verify FAIL: recipe-eligible count is not 35.', 1;
IF @Hidden <> 0 OR @OrphanMeta <> 0 OR @V3WithBarcode <> 91
  THROW 51040, 'verify FAIL: hidden, orphan, or barcode coverage failed.', 1;
IF @AppConfig <> 1 OR @StoreName <> 1 OR @SiteOnly <> 1
  THROW 51040, 'verify FAIL: AppConfig/Settings keys missing.', 1;
IF @ViewsMatch <> 1
  THROW 51040, 'verify FAIL: Tab* view row counts do not match stored tables.', 1;

PRINT N'--- required indexes ---';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SB_ProductMetadata_Curated' AND object_id = OBJECT_ID(N'dbo.SB_ProductMetadata'))
  THROW 51040, 'verify FAIL: IX_SB_ProductMetadata_Curated missing.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_SB_CartItems_Customer_Product' AND object_id = OBJECT_ID(N'dbo.SB_CartItems'))
  THROW 51040, 'verify FAIL: UQ_SB_CartItems_Customer_Product missing.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_SB_SmartBasketSessions_TokenHash' AND object_id = OBJECT_ID(N'dbo.SB_SmartBasketSessions'))
  THROW 51040, 'verify FAIL: UQ_SB_SmartBasketSessions_TokenHash missing.', 1;

PRINT N'[verify] PASS - ten-table schema, two views, trigger and 91 / 164 / 91 catalogue present.';
GO
