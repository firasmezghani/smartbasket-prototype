# Barcode testing reference — 21 September 2026

Lists the 91 published products and their barcodes. See
`docs/evaluation/README.md`.

Read-only list of **currently visible customer-catalogue products** joined to
their **existing barcode records**. For scanner testing in the app. Printable
barcode images are out of this pass.

This is not the 19 September 2026 catalogue audit. That export is historical.
Do not treat its product or barcode counts as current.

## Visibility

Same scope as the customer catalogue in the default `CATALOGUE_MODE=curated`
setting:

- `dbo.TabStocksaico` listable (`Archived` and `Blockage` not set)
- metadata visible (`IsVisible` is null or 1)
- curated (`CurationVersion` is set)

Barcodes are read from `dbo.TabStockBarCodesaico.CodBar` (the table in-app
lookup uses). They are not copied onto a product column. No primary barcode is
invented. A visible product with no barcode is included once, with
`barcode_status = missing`.

## How to see the combined table in the database client

1. Open `visible-catalogue-barcodes.sql` in Azure Data Studio or SQL Server
   Management Studio.
2. Connect to the prototype database the API uses.
3. Execute the batch. The result grid is one row per product–barcode pair.

Barcodes are `NVARCHAR`. Keep them as text, including leading zeros.

Optional clauses are documented in the SQL file (site-only products, full
catalogue mode).

## Live spreadsheet export

From the repository root (uses the server `.env`, never prints it):

```bash
node docs/evaluation/barcode-testing-reference-2026-09-21/export-barcode-testing-reference.mjs
```

If the database is reachable, the script writes:

- `visible-catalogue-barcodes.xls` — Excel SpreadsheetML; barcode cells are
  explicit text (`ss:Type="String"` and `@` format)
- `visible-catalogue-barcodes.csv` — UTF-8 CSV

**CSV warning:** Excel often converts barcode columns to numbers and drops
leading zeros. Prefer the `.xls` file, or import the CSV with that column
forced to Text.

If the database is not reachable, the script leaves those files unwritten and
records `EXPORT_STATUS.md` as pending. Do not substitute a stale CSV.

## What this is not

- Not a schema change
- Not a new product barcode column
- Not a claim about physical-camera scanning
- Not a current count of products or barcodes in this README
