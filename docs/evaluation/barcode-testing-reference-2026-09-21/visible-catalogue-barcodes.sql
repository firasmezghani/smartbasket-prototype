/*
  Visible customer-catalogue products × existing barcode records.
  21 September 2026 — read-only testing reference.

  HISTORICAL DATASET ASSUMPTION (22 September 2026): LEFT JOIN
  dbo.SB_ProductInterpretationOverrides. That table exists on the full
  SmartBasket database and is unused at runtime. SmartBasketDemo does not
  contain it. Do not run this file against the isolated demonstration
  database; use the live curated catalogue endpoints instead.

  Visibility matches the customer catalogue in the default curated mode:

  Visibility matches the customer catalogue in the default curated mode:
    - dbo.TabStocksaico listable: not archived, not blocked
    - metadata visible: IsVisible IS NULL OR IsVisible = 1
    - curated: CurationVersion IS NOT NULL

  Barcodes come from the live company table dbo.TabStockBarCodesaico (CodBar),
  which is what in-app barcode lookup uses. This is not a copy into a product
  column and it does not invent a primary barcode.

  One row per product–barcode pair. A product with several barcodes appears
  several times. A visible product with no barcode appears once with
  barcode_status = 'missing'. Empty CodBar values are treated as missing.

  Barcodes are CONVERT(NVARCHAR) so leading zeros stay as text. Do not let a
  client coerce them to numbers.

  How to run (see the combined table in the database client):
    1. Open this file in Azure Data Studio or SQL Server Management Studio.
    2. Connect to the configured prototype database (same as the API).
    3. Execute the batch. The result grid is the combined table.

  Optional:
    - If public setting show_site_only_products is true, add:
        AND s.Site = 1
    - If CATALOGUE_MODE=full, omit:
        AND m.CurationVersion IS NOT NULL

  Do not CREATE/ALTER/DROP tables. Do not UPDATE/INSERT/DELETE.
  Do not hard-code historical product or barcode counts as current facts.
*/

SELECT
  CONVERT(NVARCHAR(36), s.IDArt) AS product_id,
  COALESCE(NULLIF(LTRIM(RTRIM(m.DisplayName)), N''), s.LibArt) AS display_name,
  s.LibArt AS source_name,
  NULLIF(LTRIM(RTRIM(s.Marque)), N'') AS brand,
  m.PackageAmount AS package_amount,
  m.PackageUnit AS package_unit,
  s.PrixSite AS site_price,
  m.DisplayCategory AS display_category,
  COALESCE(
    NULLIF(LTRIM(RTRIM(o.ProductTypeOverride)), N''),
    m.CanonicalType
  ) AS canonical_type,
  o.Decision AS override_decision,
  CASE
    WHEN LOWER(LTRIM(RTRIM(o.Decision))) = N'excluded' THEN N'excluded'
    WHEN LOWER(LTRIM(RTRIM(COALESCE(
      NULLIF(LTRIM(RTRIM(o.ProductTypeOverride)), N''),
      m.CanonicalType
    )))) = N'non_food' THEN N'non_food'
    WHEN NULLIF(LTRIM(RTRIM(COALESCE(
      NULLIF(LTRIM(RTRIM(o.ProductTypeOverride)), N''),
      m.CanonicalType
    ))), N'') IS NOT NULL THEN N'typed'
    ELSE N'unknown'
  END AS classification_status,
  CASE
    WHEN NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(80), b.CodBar))), N'') IS NULL
      THEN N'missing'
    ELSE N'present'
  END AS barcode_status,
  CONVERT(NVARCHAR(80), b.CodBar) AS barcode
FROM dbo.TabStocksaico s
LEFT JOIN dbo.SB_ProductMetadata m
  ON m.ProductId = s.IDArt
LEFT JOIN dbo.SB_ProductInterpretationOverrides o
  ON o.ProductId = s.IDArt
LEFT JOIN dbo.TabStockBarCodesaico b
  ON b.IDArt = s.IDArt
 AND NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(80), b.CodBar))), N'') IS NOT NULL
WHERE (s.Archived IS NULL OR s.Archived = 0)
  AND (s.Blockage IS NULL OR s.Blockage = 0)
  AND (m.IsVisible IS NULL OR m.IsVisible = 1)
  AND m.CurationVersion IS NOT NULL
ORDER BY
  display_name,
  product_id,
  barcode;
