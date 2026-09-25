# Catalogue audit data dictionary

_19 September 2026. Companion to `catalogue-inventory.csv` and `product-barcodes.csv`._

Files are UTF-8 CSV with a header row. Fields that may contain commas are quoted. Empty cells mean “not stored”, not zero, unless a paired `*_class` column says `zero`.

**Spreadsheet warning:** open these files with “import as text” (or prefix barcodes in the spreadsheet UI). Excel and similar tools otherwise convert barcodes to numbers, drop leading zeros, and round long codes. This export has **4** barcodes that start with `0`. Product IDs are UUID text and must stay text.

No credentials, hosts, customer records, baskets or shopping histories are included. Source connection details are omitted. Images and barcodes were not generated.

## Scope of each row

`catalogue-inventory.csv` — one row per product the **customer** catalogue can show. Membership rule (same as the app in `CATALOGUE_MODE=curated`):

- a metadata row with `CurationVersion` set (live: version 3),
- `IsVisible` is null or 1,
- the imported product is still active.

That is **91** rows: the published products and their barcodes.

`product-barcodes.csv` — one row per barcode of those visible products (**164** rows). A product may appear more than once.

## `catalogue-inventory.csv`

| Column | Source | Empty / unknown |
|---|---|---|
| `product_id` | `SB_Products.ProductId` (imported identity, UUID) | Never empty in this export. Stable key for photo matching and tests. |
| `product_code` | `SB_Products.ProductCode` | Supplier article code; not a barcode. |
| `original_name` | `SB_Products.ProductName` | Imported label. |
| `display_name` | `SB_ProductMetadata.DisplayName`, else original name | Mechanically cleaned source name, not a separately authored translation. |
| `brand` | `SB_Products.Brand` | Empty when the import has no brand. |
| `display_category` | `SB_ProductMetadata.DisplayCategory` | One of `food`, `drinks`, `household`, `personal-care`, `other`. |
| `display_subcategory` | `SB_ProductMetadata.DisplaySubcategory` | Controlled English label. Empty if unset. |
| `source_family` | `SB_Products.FamilyName` | Imported family text; may be empty. |
| `source_subfamily` | `SB_Products.SubfamilyName` | Imported subfamily text; may be empty. |
| `price` | `SB_Products.Price` | Decimal with three places. Empty would mean no price; none in this export. Server price, not a client figure. |
| `currency` | Application display convention (`TND`) | **Not a database column.** Do not treat as an imported ISO field. |
| `package_amount` | `SB_ProductMetadata.PackageAmount` | Empty together with `package_unit` when unset (8 products). Positive labelled size for recipes, not proven scale mass. |
| `package_unit` | `SB_ProductMetadata.PackageUnit` | `g`, `ml`, `piece`, or empty. `ml` is volume. `piece` is a count. |
| `canonical_type` | `SB_ProductMetadata.CanonicalType` | Empty = catalogue-only food/drink (intentional). `non_food` = genuine non-food. Other values are recipe ingredient keys. |
| `recipe_eligible` | `SB_ProductMetadata.IsRecipeEligible` | `true` / `false`. Independent of “is food”. |
| `intelligence_type` | `SB_ProductMetadata.IntelligenceType` | `recipe`, `replenishment`, or `none`. |
| `featured` | `SB_ProductMetadata.IsFeatured` | `true` / `false`. |
| `curation_version` | `SB_ProductMetadata.CurationVersion` | `3` for every visible row. |
| `review_status` | Derived | `automatic_metadata` when no admin interpretation override exists (all 91). Otherwise the override decision. |
| `override_decision` | `SB_ProductInterpretationOverrides.Decision` | Empty = no override row. |
| `override_product_type` | `SB_ProductInterpretationOverrides.ProductTypeOverride` | Empty unless a `corrected` override exists. |
| `raw_weight` | Live read of authorised source column `Poids` (float), **not imported** | `0` here means the source value is numeric zero. It is not missing and it is not a verified mass. |
| `raw_weight_source` | Provenance label | `authorised_source.Poids` when the source column was readable; `none` if it had been absent. |
| `raw_weight_class` | Derived from `raw_weight` | `missing` / `zero` / `negative` / `positive` / `invalid`. This export: all `zero`. |
| `verified_weight_unit` | Auditor conclusion | Always `UNKNOWN`. Source has no unit. |
| `verified_weight_basis` | Auditor conclusion | Always `UNKNOWN` (not net, gross, per-package, or per-case). |
| `weight_kind` | Auditor conclusion | Always `unknown` (not fixed- vs variable-weight). |
| `labelled_name_amount` | Existing name interpreter (`interpretProductName`) | Empty if the name did not yield a quantity. **Inferred**, not a database weight. |
| `labelled_name_unit` | Same interpreter | `g`, `ml`, or `piece` when inferred. |
| `image_path` | `SB_ProductMetadata.ImagePath` | Empty = no application image. |
| `image_status` | Derived | `none` or `metadata_path_set`. Live export: all `none`. Imported URL/binary image columns on the compatibility view are unused. |
| `barcode_count` | Count of rows in `product-barcodes.csv` for this id | `0` would mean none; none in this export. |
| `classification_notes` | Auditor notes | Plain-language caveats (recipe vs shopping, milk/butter/eggs, search aliases). |
| `weight_quality_notes` | Auditor notes | Why the row cannot support a scale reading. |

`SB_Products.Quantity` (imported stock `Qte`) is **intentionally not exported**. It is on-hand quantity, not packaged weight.

## `product-barcodes.csv`

| Column | Source | Empty / unknown |
|---|---|---|
| `product_id` | `SB_ProductBarcodes.ProductId` | Visible-catalogue product only. |
| `product_code` | `SB_ProductBarcodes.ProductCode` | Article code copied with the barcode. |
| `barcode` | `SB_ProductBarcodes.Barcode` | **Text.** Preserve leading zeros. Not generated. |
| `source_barcode_id` | `SB_ProductBarcodes.SourceBarcodeId` | Source row id when imported; empty if unset. |
| `note` | `SB_ProductBarcodes.Note` | Source remark (`Remarq`); usually empty. |
| `relationship` | Derived | `sole_known_code` if the product has one barcode; `alias_among_equals` if it has several. All codes of a multi-code product are aliases of each other. |
| `documented_primary` | — | **Always empty.** The schema has no primary-barcode flag. This audit does not invent one. |
| `barcode_count_for_product` | Derived | How many codes that product has. |

Ambiguous barcodes (one code mapped to several products) were excluded at import time and do not appear.

## Live counts behind the files

See `AUDIT_REPORT.md`.
