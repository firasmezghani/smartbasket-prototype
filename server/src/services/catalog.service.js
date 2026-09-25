// Read-only catalogue queries (through the TabStocksaico views), with paging.
import sql from 'mssql';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { executeReadOnlyQuery } from './database.service.js';
import { getPublicSettings } from './settings.service.js';
import { buildCatalogSearchFilter } from './catalogSearch.js';

// Hard cap for page size (clients must not request unbounded pages).
export const CATALOG_MAX_LIMIT = 100;
// Default page size when limit is missing or invalid.
export const CATALOG_DEFAULT_LIMIT = 20;
// Cap on `OFFSET`, so huge skip values cannot slow the database.
export const CATALOG_MAX_OFFSET = 2_000_000;
// Cap on search text length (keeps `LIKE` and `NVARCHAR` parameters small).
export const CATALOG_MAX_SEARCH_CHARS = 512;
// Max length for family / subfamily / brand filter params after trim (matches column bind sizes).
export const CATALOG_MAX_FAMILY_CHARS = 100;
export const CATALOG_MAX_SUBFAMILY_CHARS = 50;
export const CATALOG_MAX_BRAND_CHARS = 200;
// Max length for barcode path param after trim (CodBar bind size).
export const CATALOG_MAX_BARCODE_CHARS = 80;

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

// Read-only: products that are not archived and not blocked (flags on the catalogue view).
const TABSTOCK_LISTABLE_SQL = `(s.Archived IS NULL OR s.Archived = 0) AND (s.Blockage IS NULL OR s.Blockage = 0)`;

let _sitePolicyCache = { atMs: 0, showSiteOnlyProducts: false };
const SITE_POLICY_TTL_MS = 5000;

async function getCatalogSitePolicy() {
  const now = Date.now();
  if (now - _sitePolicyCache.atMs < SITE_POLICY_TTL_MS) {
    return { showSiteOnlyProducts: _sitePolicyCache.showSiteOnlyProducts };
  }
  let showSiteOnlyProducts = false;
  try {
    const rows = await getPublicSettings();
    for (const r of rows) {
      if (String(r.settingKey ?? '').toLowerCase() === 'show_site_only_products') {
        const v = String(r.settingValue ?? '').trim().toLowerCase();
        showSiteOnlyProducts = v === 'true' || v === '1';
        break;
      }
    }
  } catch {
    showSiteOnlyProducts = false;
  }
  _sitePolicyCache = { atMs: now, showSiteOnlyProducts };
  return { showSiteOnlyProducts };
}

export function pickFirstHttpUrl(...candidates) {
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const t = String(c).trim();
    if (t === '') continue;
    const lower = t.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:')) continue;
    if (lower.startsWith('http://') || lower.startsWith('https://')) return t;
    if (lower.startsWith('//')) return `https:${t}`;
  }
  return null;
}

function customerDescription(row) {
  const web = row.ExLibArtWeb == null ? '' : String(row.ExLibArtWeb).trim();
  if (web !== '') return web;
  const ex = row.ExLibArt == null ? '' : String(row.ExLibArt).trim();
  return ex === '' ? null : ex;
}

function availabilityHintFromQte(qte) {
  if (qte === undefined || qte === null) return null;
  const n = Number(qte);
  if (!Number.isFinite(n)) return null;
  if (n > 0) return 'Available';
  return 'Contact us';
}

// Promotion fields for customers: discount, sale price, regular price, promo image and
// whether there is a promotion.
export function computeCustomerPromoFields(row) {
  let salePrice = null;
  if (row.PrixSite != null && row.PrixSite !== '') {
    const n = Number(row.PrixSite);
    if (Number.isFinite(n) && n > 0) salePrice = n;
  }

  let discountPercent = null;
  if (row.Remise != null && row.Remise !== '') {
    const r = Number(row.Remise);
    if (Number.isFinite(r) && r > 0) {
      if (r < 1) discountPercent = r * 100;
      else if (r <= 100) discountPercent = r;
    }
  }

  const promoImageUrl = pickFirstHttpUrl(row.UrlPromo);
  const remoteImageUrl = pickFirstHttpUrl(row.UrlImage, row.UrlNormal, row.UrlPromo);

  let oldPrice = null;
  if (
    discountPercent != null &&
    discountPercent >= 1 &&
    discountPercent <= 95 &&
    salePrice != null
  ) {
    oldPrice = salePrice / (1 - discountPercent / 100);
    oldPrice = Math.round(oldPrice * 1000) / 1000;
  }

  const hasDiscountForBadge = discountPercent != null && discountPercent > 0;
  const hasReliableStrike = oldPrice != null && salePrice != null && oldPrice > salePrice;
  const hasPromo = hasDiscountForBadge || promoImageUrl != null || hasReliableStrike;

  let priceDisplayMode = 'request';
  if (salePrice != null) {
    priceDisplayMode = hasPromo ? 'promo' : 'normal';
  }

  const cardRemoteImageUrl =
    hasPromo && promoImageUrl ? promoImageUrl : remoteImageUrl;

  return {
    discountPercent: hasDiscountForBadge ? Math.round(discountPercent * 100) / 100 : null,
    salePrice,
    oldPrice: hasReliableStrike ? oldPrice : null,
    hasPromo,
    promoImageUrl,
    priceDisplayMode,
    cardRemoteImageUrl: cardRemoteImageUrl ?? null,
  };
}

export function mapProductRow(row) {
  const promo = computeCustomerPromoFields(row);
  const meta = computeEffectiveMetadata(row);
  return {
    id: row.IDArt,
    code: row.CodArt,
    // Effective display name: metadata DisplayName when set, else the imported name.
    name: meta.effectiveName ?? row.LibArt ?? null,
    sourceName: meta.sourceName,
    familyCode: row.CodFam,
    familyName: row.LibFam,
    subFamilyCode: row.CodSFam,
    subFamilyName: row.DesSFam,
    discount: row.Remise,
    sitePrice: row.PrixSite,
    description: customerDescription(row),
    remoteImageUrl: pickFirstHttpUrl(row.UrlImage, row.UrlNormal, row.UrlPromo),
    hasImageBinary: Boolean(row.HasImageBinary),
    brand: row.Marque,
    availabilityHint: availabilityHintFromQte(row.Qte),
    // Application-managed metadata (safe defaults when the product has no row).
    isCurated: meta.isCurated,
    displayCategory: meta.displayCategory,
    displaySubcategory: meta.displaySubcategory,
    isFeatured: meta.isFeatured,
    intelligenceType: meta.intelligenceType,
    isRecipeEligible: meta.isRecipeEligible,
    isReplenishmentEligible: meta.isReplenishmentEligible,
    expectedRepurchaseDays: meta.expectedRepurchaseDays,
    sortOrder: meta.sortOrder,
    metadataImageUrl: meta.metadataImageUrl,
    canonicalType: meta.canonicalType,
    classificationStatus: meta.classificationStatus,
    packageAmount: meta.packageAmount,
    packageUnit: meta.packageUnit,
    ...promo,
  };
}

function idArtInput(idArt) {
  return {
    name: 'idArt',
    type: sql.UniqueIdentifier,
    value: String(idArt),
  };
}

function barcodeInput(barcode) {
  return {
    name: 'barcode',
    type: sql.NVarChar(CATALOG_MAX_BARCODE_CHARS),
    value: String(barcode),
  };
}

// barcode or null if invalid
export function parseCatalogBarcode(value) {
  if (value === undefined || value === null) return null;
  const t = String(value).trim();
  if (t === '') return null;
  if (t.length > CATALOG_MAX_BARCODE_CHARS) return null;
  if (/[\x00-\x1f\x7f]/.test(t) || /\s/.test(t)) return null;
  return t;
}

// UUID string suitable for UniqueIdentifier bind (canonical hyphenated form, no braces).
const CATALOG_ID_ART_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// canonical UUID or null if malformed
export function parseCatalogProductId(idArt) {
  if (typeof idArt !== 'string') return null;
  const t = idArt.trim();
  return CATALOG_ID_ART_RE.test(t) ? t : null;
}

// Trim and cap filter values before they are bound as SQL parameters.
function normalizeFilterToken(value, maxLen) {
  if (typeof value !== 'string') return '';
  const t = value.trim();
  if (t === '') return '';
  return t.slice(0, maxLen);
}

function parseSiteFilter(value) {
  if (value === undefined || value === null || value === '') return 'all';
  const v = String(value).trim().toLowerCase();
  if (v === 'all') return 'all';
  if (v === 'true' || v === '1') return 'true';
  if (v === 'false' || v === '0') return 'false';
  return 'all';
}

// Supported GET /api/catalog/products sort query values.
export const CATALOG_SORT_VALUES = new Set([
  'recommended',
  'name_asc',
  'name_desc',
  'price_asc',
  'price_desc',
  'promo_first',
]);

export function parseCatalogSort(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === '' || v === 'recommended') return 'recommended';
  if (CATALOG_SORT_VALUES.has(v)) return v;
  return 'recommended';
}

export function parseHasPromoFilter(value) {
  if (value === undefined || value === null || value === '') return false;
  const v = String(value).trim().toLowerCase();
  return v === 'true' || v === '1';
}

// --- Product metadata (SB_ProductMetadata) ---
// Products without metadata use defaults; IsVisible = 0 hides a product.

// The five canonical application display-category slugs.
export const CATALOG_DISPLAY_CATEGORIES = Object.freeze([
  'food',
  'drinks',
  'household',
  'personal-care',
  'other',
]);
const CATALOG_DISPLAY_CATEGORY_SET = new Set(CATALOG_DISPLAY_CATEGORIES);

// Sections of the catalogue landing screen. `titleKey` is translated by the app.
export const CATALOG_SECTION_DEFS = Object.freeze([
  { key: 'featured', titleKey: 'catalog.sectionFeatured' },
  { key: 'food', titleKey: 'catalog.categoryFood' },
  { key: 'drinks', titleKey: 'catalog.categoryDrinks' },
  { key: 'household', titleKey: 'catalog.categoryHousehold' },
  { key: 'personal-care', titleKey: 'catalog.categoryPersonalCare' },
  { key: 'other', titleKey: 'catalog.categoryOther' },
]);

// trim → lower → collapse spaces/underscores to a hyphen.
function slugifyCategory(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

// Convert DisplayCategory to a known category slug, or null.
export function normalizeMetadataDisplayCategory(raw) {
  if (raw === undefined || raw === null) return null;
  const slug = slugifyCategory(raw);
  return CATALOG_DISPLAY_CATEGORY_SET.has(slug) ? slug : null;
}

// Validate the displayCategory filter (400 if unknown).
export function parseCatalogDisplayCategoryFilter(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const slug = slugifyCategory(value);
  if (!CATALOG_DISPLAY_CATEGORY_SET.has(slug)) {
    throw new AppError('Unsupported display category.', 400);
  }
  return slug;
}

export function parseCatalogFlag(value) {
  if (value === undefined || value === null || value === '') return false;
  const v = String(value).trim().toLowerCase();
  return v === 'true' || v === '1';
}

// Allowed relative image path (no `..`, absolute paths or protocols).
const PRODUCT_IMAGE_ASSET_RE =
  /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?(?:\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)*\.[A-Za-z0-9]{1,8}$/;

// Build the public URL for a product image, or null if the path is unsafe.
export function buildProductImageAssetUrl(rawPath) {
  if (rawPath === undefined || rawPath === null) return null;
  let t = String(rawPath).trim();
  if (t === '') return null;
  t = t.replace(/^\.\//, '');
  if (t === '' || t.includes('\\') || t.includes('..') || t.startsWith('/')) return null;
  if (/[\u0000-\u001f\u007f]/.test(t)) return null; // control characters
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null; // protocol-like (http:, file:, c:)
  if (!PRODUCT_IMAGE_ASSET_RE.test(t)) return null;
  const prefix = String(env.PRODUCT_IMAGE_PUBLIC_PATH || '/product-images').replace(/\/+$/, '');
  const encoded = t
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `${prefix}/${encoded}`;
}

// `LEFT JOIN` to the metadata table (one row per product, optional).
const METADATA_JOIN_SQL = `LEFT JOIN dbo.SB_ProductMetadata m ON m.ProductId = s.IDArt`;
// A product is hidden only when its metadata row sets `IsVisible = 0`.
const METADATA_VISIBLE_SQL = `(m.IsVisible IS NULL OR m.IsVisible = 1)`;

// In `curated` mode (default) customers only see curated products; `full`
// shows the whole imported catalogue.
const CURATED_ONLY_SQL = ` AND m.CurationVersion IS NOT NULL`;
function curatedModeWhere() {
  return env.CATALOGUE_MODE === 'curated' ? CURATED_ONLY_SQL : '';
}

// Recipe links may only point to curated, recipe-eligible food products.
// Used by the recommendation adapter, not by the HTTP filters.
const RECIPE_ELIGIBLE_ONLY_SQL =
  ` AND m.CurationVersion IS NOT NULL AND m.IsRecipeEligible = 1` +
  ` AND m.CanonicalType IS NOT NULL AND m.CanonicalType <> N'non_food'`;
// Effective display name: a non-empty metadata DisplayName overrides the imported name.
const EFFECTIVE_NAME_SQL = `COALESCE(NULLIF(LTRIM(RTRIM(m.DisplayName)), N''), s.LibArt)`;
// Normalised display category, for slug matching in `WHERE` and `ORDER BY`.
const METADATA_NORMALIZED_CATEGORY_SQL =
  `LOWER(LTRIM(RTRIM(REPLACE(REPLACE(CAST(m.DisplayCategory AS NVARCHAR(100)), N'_', N'-'), N' ', N'-'))))`;
// Metadata columns added to every product `SELECT` (aliased for mapProductRow).
const METADATA_SELECT_COLUMNS = `      m.ProductId AS MetaProductId,
      m.DisplayName AS MetaDisplayName,
      m.DisplayCategory AS MetaDisplayCategory,
      m.DisplaySubcategory AS MetaDisplaySubcategory,
      m.IntelligenceType AS MetaIntelligenceType,
      m.IsVisible AS MetaIsVisible,
      m.IsFeatured AS MetaIsFeatured,
      m.IsRecipeEligible AS MetaIsRecipeEligible,
      m.IsReplenishmentEligible AS MetaIsReplenishmentEligible,
      m.ExpectedRepurchaseDays AS MetaExpectedRepurchaseDays,
      m.ImagePath AS MetaImagePath,
      m.SortOrder AS MetaSortOrder,
      m.CanonicalType AS MetaCanonicalType,
      m.PackageAmount AS MetaPackageAmount,
      m.PackageUnit AS MetaPackageUnit`;

// Metadata values for one product row, with defaults when there is no metadata.
export function computeEffectiveMetadata(row) {
  const hasMetadata = row.MetaProductId !== undefined && row.MetaProductId !== null;

  const metaName = row.MetaDisplayName == null ? '' : String(row.MetaDisplayName).trim();
  const importedName = row.LibArt == null ? '' : String(row.LibArt).trim();
  const effectiveName = metaName !== '' ? metaName : importedName || null;

  const displayCategory = hasMetadata
    ? normalizeMetadataDisplayCategory(row.MetaDisplayCategory)
    : null;

  const metaSub = row.MetaDisplaySubcategory == null ? '' : String(row.MetaDisplaySubcategory).trim();
  const displaySubcategory = hasMetadata && metaSub !== '' ? metaSub : null;

  const intelRaw = row.MetaIntelligenceType == null ? '' : String(row.MetaIntelligenceType).trim().toLowerCase();
  const intelligenceType = intelRaw === 'recipe' || intelRaw === 'replenishment' ? intelRaw : 'none';

  const truthyBit = (v) => v === true || v === 1;
  const isFeatured = hasMetadata && truthyBit(row.MetaIsFeatured);
  const isRecipeEligible = intelligenceType === 'recipe' && truthyBit(row.MetaIsRecipeEligible);
  const isReplenishmentEligible =
    intelligenceType === 'replenishment' && truthyBit(row.MetaIsReplenishmentEligible);

  let expectedRepurchaseDays = null;
  if (row.MetaExpectedRepurchaseDays != null) {
    const n = Number(row.MetaExpectedRepurchaseDays);
    if (Number.isFinite(n) && n >= 1) expectedRepurchaseDays = Math.trunc(n);
  }

  let sortOrder = 0;
  if (row.MetaSortOrder != null) {
    const n = Number(row.MetaSortOrder);
    if (Number.isFinite(n)) sortOrder = Math.trunc(n);
  }

  return {
    isCurated: hasMetadata,
    effectiveName,
    sourceName: importedName || null,
    displayCategory,
    displaySubcategory,
    isFeatured,
    intelligenceType,
    isRecipeEligible,
    isReplenishmentEligible,
    expectedRepurchaseDays,
    sortOrder,
    metadataImageUrl: hasMetadata ? buildProductImageAssetUrl(row.MetaImagePath) : null,
    ...computeShoppingClassification(row),
  };
}

const CANONICAL_TYPE_SHAPE = /^[a-z][a-z0-9_]{1,59}$/;

// Shopping-list type of a curated product (from CanonicalType). Unknown or
// non-food types never match a generic checklist item.
export function computeShoppingClassification(row = {}) {
  const metaType =
    row.MetaCanonicalType == null ? '' : String(row.MetaCanonicalType).trim().toLowerCase();
  const type = CANONICAL_TYPE_SHAPE.test(metaType) ? metaType : '';

  if (!type) {
    return {
      canonicalType: null,
      classificationStatus: 'unknown',
      packageAmount: parsePackageAmount(row.MetaPackageAmount),
      packageUnit: parsePackageUnit(row.MetaPackageUnit),
    };
  }
  if (type === 'non_food') {
    return {
      canonicalType: null,
      classificationStatus: 'non_food',
      packageAmount: parsePackageAmount(row.MetaPackageAmount),
      packageUnit: parsePackageUnit(row.MetaPackageUnit),
    };
  }
  return {
    canonicalType: type,
    classificationStatus: 'typed',
    packageAmount: parsePackageAmount(row.MetaPackageAmount),
    packageUnit: parsePackageUnit(row.MetaPackageUnit),
  };
}

function parsePackageAmount(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePackageUnit(value) {
  const unit = value == null ? '' : String(value).trim().toLowerCase();
  return unit === 'g' || unit === 'ml' || unit === 'piece' ? unit : null;
}

// Count visible curated products per landing section (empty sections are kept).
export function buildCatalogSectionCounts(rows) {
  const counts = new Map(CATALOG_SECTION_DEFS.map((d) => [d.key, 0]));
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row.IsFeatured === true || row.IsFeatured === 1) {
      counts.set('featured', counts.get('featured') + 1);
    }
    const slug = normalizeMetadataDisplayCategory(row.DisplayCategory);
    if (slug && counts.has(slug)) counts.set(slug, counts.get(slug) + 1);
  }
  return CATALOG_SECTION_DEFS.map((d) => ({
    key: d.key,
    titleKey: d.titleKey,
    count: counts.get(d.key) ?? 0,
  }));
}

// SQL condition for "product has a promotion" (same rule as computeCustomerPromoFields).
export const CATALOG_HAS_PROMO_SQL = `(
  (
    s.Remise IS NOT NULL
    AND TRY_CONVERT(float, s.Remise) > 0
    AND (TRY_CONVERT(float, s.Remise) < 1 OR TRY_CONVERT(float, s.Remise) <= 100)
  )
  OR (
    s.UrlPromo IS NOT NULL
    AND LTRIM(RTRIM(CAST(s.UrlPromo AS NVARCHAR(2000)))) <> N''
    AND (
      LOWER(LEFT(LTRIM(RTRIM(CAST(s.UrlPromo AS NVARCHAR(2000)))), 8)) IN (N'http://', N'https:/')
      OR LEFT(LTRIM(RTRIM(CAST(s.UrlPromo AS NVARCHAR(2000)))), 2) = N'//'
    )
    AND LOWER(LTRIM(RTRIM(CAST(s.UrlPromo AS NVARCHAR(2000))))) NOT LIKE N'javascript:%'
    AND LOWER(LTRIM(RTRIM(CAST(s.UrlPromo AS NVARCHAR(2000))))) NOT LIKE N'data:%'
  )
  OR (
    TRY_CONVERT(float, s.PrixSite) > 0
    AND TRY_CONVERT(float, s.Remise) > 0
    AND (
      (TRY_CONVERT(float, s.Remise) >= 1 AND TRY_CONVERT(float, s.Remise) <= 95)
      OR (
        TRY_CONVERT(float, s.Remise) > 0
        AND TRY_CONVERT(float, s.Remise) < 1
        AND (TRY_CONVERT(float, s.Remise) * 100.0) BETWEEN 1 AND 95
      )
    )
    AND (
      TRY_CONVERT(float, s.PrixSite) / (
        1.0 - CASE
          WHEN TRY_CONVERT(float, s.Remise) > 0 AND TRY_CONVERT(float, s.Remise) < 1 THEN TRY_CONVERT(float, s.Remise)
          ELSE TRY_CONVERT(float, s.Remise) / 100.0
        END
      )
    ) > TRY_CONVERT(float, s.PrixSite)
  )
)`;

// `ORDER BY` for a sort mode. In the curated catalogue the default sort shows
// featured products first.
function buildProductListOrderBy(sortMode, curatedContext = false) {
  if (sortMode === 'recommended' && curatedContext) {
    return `CASE WHEN m.IsFeatured = 1 THEN 0 ELSE 1 END ASC, COALESCE(m.SortOrder, 0) ASC, ${EFFECTIVE_NAME_SQL} ASC, s.IDArt ASC`;
  }
  switch (sortMode) {
    case 'name_desc':
      return 's.LibArt DESC, s.IDArt ASC';
    case 'price_asc':
      return `CASE WHEN TRY_CONVERT(float, s.PrixSite) > 0 THEN 0 ELSE 1 END ASC, TRY_CONVERT(float, s.PrixSite) ASC, s.LibArt ASC, s.IDArt ASC`;
    case 'price_desc':
      return `CASE WHEN TRY_CONVERT(float, s.PrixSite) > 0 THEN 0 ELSE 1 END ASC, TRY_CONVERT(float, s.PrixSite) DESC, s.LibArt ASC, s.IDArt ASC`;
    case 'promo_first':
      return `CASE WHEN ${CATALOG_HAS_PROMO_SQL} THEN 0 ELSE 1 END ASC, s.LibArt ASC, s.IDArt ASC`;
    case 'name_asc':
    case 'recommended':
    default:
      return 's.LibArt ASC, s.IDArt ASC';
  }
}

// Shared `WHERE` clause for the product count and page queries.
function buildProductListWhere(options) {
  const { search, family, brand, subfamily, siteMode, hasPromo, displayCategory, featured, curated } =
    options;
  const conditions = [];
  const filterInputs = [];

  if (search) {
    const searchFilter = buildCatalogSearchFilter(search);
    if (searchFilter.sql) {
      conditions.push(searchFilter.sql);
      for (const bind of searchFilter.binds) {
        filterInputs.push({
          name: bind.name,
          type: bind.name.startsWith('searchCanonical') ? sql.NVarChar(60) : sql.NVarChar(4000),
          value: bind.value,
        });
      }
    }
  }
  if (displayCategory) {
    // Curated products whose normalised metadata category equals the slug.
    conditions.push(`${METADATA_NORMALIZED_CATEGORY_SQL} = @displayCategory`);
    filterInputs.push({
      name: 'displayCategory',
      type: sql.NVarChar(100),
      value: String(displayCategory),
    });
  }
  if (featured) {
    conditions.push('m.IsFeatured = 1');
  }
  if (curated) {
    conditions.push('m.ProductId IS NOT NULL');
  }
  if (family) {
    conditions.push('LTRIM(RTRIM(s.CodFam)) = @family');
    filterInputs.push({
      name: 'family',
      type: sql.VarChar(100),
      value: String(family).trim(),
    });
  }
  if (brand) {
    conditions.push('LTRIM(RTRIM(s.Marque)) = LTRIM(RTRIM(@brand))');
    filterInputs.push({
      name: 'brand',
      type: sql.NVarChar(200),
      value: String(brand).trim(),
    });
  }
  if (subfamily) {
    conditions.push('LTRIM(RTRIM(s.CodSFam)) = @subfamily');
    filterInputs.push({
      name: 'subfamily',
      type: sql.VarChar(50),
      value: String(subfamily).trim(),
    });
  }
  if (siteMode === 'true' || siteMode === 'false') {
    conditions.push('s.Site = @siteFilter');
    filterInputs.push({
      name: 'siteFilter',
      type: sql.Bit,
      value: siteMode === 'true',
    });
  }
  if (hasPromo) {
    conditions.push(CATALOG_HAS_PROMO_SQL);
  }

  const whereSql = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  return { whereSql, filterInputs };
}

// List rows for cards only: no imgArt blob; HasImageBinary drives /image URL.
const PRODUCT_LIST_SELECT = `
    SELECT
      s.IDArt,
      s.CodArt,
      s.LibArt,
      s.CodFam,
      s.LibFam,
      s.CodSFam,
      s.DesSFam,
      s.Remise,
      s.PrixSite,
      s.ExLibArtWeb,
      s.ExLibArt,
      s.UrlImage,
      s.UrlNormal,
      s.UrlPromo,
      s.Qte,
      CASE WHEN s.imgArt IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS HasImageBinary,
      s.Marque,
${METADATA_SELECT_COLUMNS}
    FROM dbo.TabStocksaico s
    ${METADATA_JOIN_SQL}
`;

// Paginated product list with search, category and curation filters.
export async function getProducts(filters = {}) {
  const limit = clampInt(filters.limit, 1, CATALOG_MAX_LIMIT, CATALOG_DEFAULT_LIMIT);
  const offset = Math.max(
    0,
    clampInt(filters.offset, 0, CATALOG_MAX_OFFSET, 0),
  );

  const search =
    typeof filters.search === 'string' && filters.search.trim() !== ''
      ? filters.search.trim().slice(0, CATALOG_MAX_SEARCH_CHARS)
      : '';
  const family = normalizeFilterToken(filters.family, CATALOG_MAX_FAMILY_CHARS);
  const brand = normalizeFilterToken(filters.brand, CATALOG_MAX_BRAND_CHARS);
  const subfamily = normalizeFilterToken(filters.subfamily, CATALOG_MAX_SUBFAMILY_CHARS);

  const { showSiteOnlyProducts } = await getCatalogSitePolicy();
  const siteMode = showSiteOnlyProducts ? 'true' : parseSiteFilter(filters.site);
  const sortMode = parseCatalogSort(filters.sort);
  const hasPromo = parseHasPromoFilter(filters.hasPromo);
  // Throws AppError(400) for an unsupported slug; null when the filter is absent.
  const displayCategory = parseCatalogDisplayCategoryFilter(filters.displayCategory);
  const featured = parseCatalogFlag(filters.featured);
  const curated = parseCatalogFlag(filters.curated);
  const curatedContext = Boolean(displayCategory) || featured || curated;
  // Internal filter for recipe links: curated, recipe-eligible products only.
  const recipeEligibleOnly = filters.recipeEligibleOnly === true;

  const { whereSql, filterInputs } = buildProductListWhere({
    search,
    family,
    brand,
    subfamily,
    siteMode,
    hasPromo,
    displayCategory,
    featured,
    curated,
  });

  // Hide products with IsVisible = 0 and, in curated mode, products that are
  // not curated. recipeEligibleOnly is stricter still.
  const baseWhere =
    ` AND ${TABSTOCK_LISTABLE_SQL} AND ${METADATA_VISIBLE_SQL}` +
    (recipeEligibleOnly ? RECIPE_ELIGIBLE_ONLY_SQL : curatedModeWhere());

  // Total rows for paging: same filters as the page query but no `ORDER BY` (cheaper).
  const countSql = `
    SELECT COUNT(*) AS total
    FROM dbo.TabStocksaico s
    ${METADATA_JOIN_SQL}
    WHERE 1 = 1${baseWhere}${whereSql}
  `;

  const countRows = await executeReadOnlyQuery(countSql, filterInputs);
  const total = Number(countRows[0]?.total ?? 0);

  let listOffset = offset;
  if (total > 0 && listOffset >= total) {
    listOffset = 0;
  }

  const listInputs = [
    ...filterInputs,
    { name: 'offset', type: sql.Int, value: listOffset },
    { name: 'limit', type: sql.Int, value: limit },
  ];

  const orderBySql = buildProductListOrderBy(sortMode, curatedContext);

  const listSql = `${PRODUCT_LIST_SELECT}
    WHERE 1 = 1${baseWhere}${whereSql}
    ORDER BY ${orderBySql}
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `;

  const rows = await executeReadOnlyQuery(listSql, listInputs);
  const products = rows.map(mapProductRow);

  return { products, total, limit, offset: listOffset };
}

async function productListableWhereClause() {
  const { showSiteOnlyProducts } = await getCatalogSitePolicy();
  const siteClause = showSiteOnlyProducts ? ' AND s.Site = 1' : '';
  return ` AND ${TABSTOCK_LISTABLE_SQL}${siteClause}`;
}

// Visibility check against the full imported catalogue (no curated filter).
// Tells an unknown barcode apart from a product that is not curated.
async function productVisibleWhereClause() {
  return `${await productListableWhereClause()} AND ${METADATA_VISIBLE_SQL}`;
}

// Visibility condition used by every customer-facing product query
// (visible, and curated in curated mode).
async function productCuratedVisibleWhereClause() {
  return `${await productVisibleWhereClause()}${curatedModeWhere()}`;
}

// Product detail for the app (without the image bytes).
export async function getProductById(idArt) {
  if (!parseCatalogProductId(idArt)) return null;
  const extraWhere = await productCuratedVisibleWhereClause();
  const text = `
    SELECT TOP 1
      s.IDArt,
      s.CodArt,
      s.LibArt,
      s.CodFam,
      s.LibFam,
      s.CodSFam,
      s.DesSFam,
      s.Remise,
      s.PrixSite,
      s.ExLibArtWeb,
      s.ExLibArt,
      s.UrlImage,
      s.UrlNormal,
      s.UrlPromo,
      s.Qte,
      CASE WHEN s.imgArt IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS HasImageBinary,
      s.Marque,
${METADATA_SELECT_COLUMNS}
    FROM dbo.TabStocksaico s
    ${METADATA_JOIN_SQL}
    WHERE s.IDArt = @idArt${extraWhere}
  `;
  const rows = await executeReadOnlyQuery(text, [idArtInput(idArt)]);
  if (!rows.length) return null;

  const product = mapProductRow(rows[0]);
  product.barcodes = await getProductBarcodes(idArt);
  return product;
}

// Find a product by barcode: null if unknown, 404 if it is not curated,
// 409 if the barcode matches several products.
export async function getProductByBarcode(rawBarcode) {
  const barcode = parseCatalogBarcode(rawBarcode);
  if (!barcode) {
    throw new AppError('Invalid barcode.', 400);
  }

  const extraWhere = await productVisibleWhereClause();
  const text = `
    SELECT DISTINCT s.IDArt
    FROM dbo.TabStockBarCodesaico b
    INNER JOIN dbo.TabStocksaico s ON s.IDArt = b.IDArt
    ${METADATA_JOIN_SQL}
    WHERE LTRIM(RTRIM(b.CodBar)) = @barcode${extraWhere}
  `;
  const rows = await executeReadOnlyQuery(text, [barcodeInput(barcode)]);
  const idArt = rows.length === 1 ? String(rows[0].IDArt) : null;
  const product = idArt ? await getProductById(idArt) : null;
  const decision = decideBarcodeLookupResult({
    hitCount: rows.length,
    curatedProduct: product,
    catalogueMode: env.CATALOGUE_MODE,
  });
  if (decision.kind === 'unknown') return null;
  if (decision.kind === 'ambiguous') {
    throw new AppError(
      'This barcode matches more than one product. Please ask a team member for assistance.',
      409,
    );
  }
  if (decision.kind === 'not_in_curated') {
    throw new AppError(
      'This product is not available in this prototype catalogue.',
      404,
      { code: 'NOT_IN_CURATED_CATALOGUE' },
    );
  }
  return product;
}

// Decide the barcode lookup outcome (pure, so it can be tested with fixtures).
export function decideBarcodeLookupResult({ hitCount, curatedProduct, catalogueMode }) {
  if (!Number.isInteger(hitCount) || hitCount < 1) return { kind: 'unknown' };
  if (hitCount > 1) return { kind: 'ambiguous' };
  if (curatedProduct) return { kind: 'found' };
  if (catalogueMode === 'curated') return { kind: 'not_in_curated' };
  return { kind: 'unknown' };
}

function sniffImageContentType(buf) {
  if (!buf || buf.length < 3) return 'application/octet-stream';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'image/png';
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  return 'image/jpeg';
}

// Image bytes for one product (used by the image route only).
export async function getProductImage(idArt) {
  if (!parseCatalogProductId(idArt)) return null;
  const extraWhere = await productCuratedVisibleWhereClause();
  const text = `
    SELECT TOP 1 s.imgArt
    FROM dbo.TabStocksaico s
    ${METADATA_JOIN_SQL}
    WHERE s.IDArt = @idArt${extraWhere}
  `;
  const rows = await executeReadOnlyQuery(text, [idArtInput(idArt)]);
  const image = rows[0]?.imgArt;
  if (!image) return null;
  const buf = Buffer.isBuffer(image) ? image : Buffer.from(image);
  return { image: buf, contentType: sniffImageContentType(buf) };
}

export async function getProductBarcodes(idArt) {
  if (!parseCatalogProductId(idArt)) return [];
  const text = `
    SELECT b.IDArt, b.CodArt, b.CodBar, b.Remarq
    FROM dbo.TabStockBarCodesaico b
    WHERE b.IDArt = @idArt
    ORDER BY b.CodBar
  `;
  const rows = await executeReadOnlyQuery(text, [idArtInput(idArt)]);
  return rows.map((row) => ({
    idArt: row.IDArt,
    codArt: row.CodArt,
    codBar: row.CodBar,
    remarq: row.Remarq,
  }));
}

// Distinct families from listable stock rows only (no product list fetch; no image columns).
export async function getFamilies() {
  const extraWhere = await productCuratedVisibleWhereClause();
  const text = `
    SELECT DISTINCT
      LTRIM(RTRIM(s.CodFam)) AS CodFam,
      LTRIM(RTRIM(s.LibFam)) AS DesFamille
    FROM dbo.TabStocksaico s
    ${METADATA_JOIN_SQL}
    WHERE s.CodFam IS NOT NULL
      AND LTRIM(RTRIM(s.CodFam)) <> ''
      AND s.LibFam IS NOT NULL
      AND LTRIM(RTRIM(s.LibFam)) <> ''
      ${extraWhere}
    ORDER BY DesFamille
  `;
  const rows = await executeReadOnlyQuery(text, []);
  return rows.map((row) => ({
    codFam: row.CodFam,
    desFamille: row.DesFamille,
  }));
}

// Subfamilies within one family (the family filter is required).
export async function getSubFamilies(familyFromQuery) {
  const fam = normalizeFilterToken(
    typeof familyFromQuery === 'string' ? familyFromQuery : String(familyFromQuery ?? ''),
    CATALOG_MAX_FAMILY_CHARS,
  );
  if (!fam) return [];

  const extraWhere = await productCuratedVisibleWhereClause();
  const text = `
    SELECT DISTINCT
      LTRIM(RTRIM(s.CodFam)) AS CodFam,
      LTRIM(RTRIM(s.CodSFam)) AS CodSFam,
      LTRIM(RTRIM(s.DesSFam)) AS DesSFam
    FROM dbo.TabStocksaico s
    ${METADATA_JOIN_SQL}
    WHERE s.CodSFam IS NOT NULL
      AND LTRIM(RTRIM(s.CodSFam)) <> ''
      AND s.DesSFam IS NOT NULL
      AND LTRIM(RTRIM(s.DesSFam)) <> ''
      AND LTRIM(RTRIM(s.CodFam)) = @family
      ${extraWhere}
    ORDER BY DesSFam
  `;

  const inputs = [{ name: 'family', type: sql.VarChar(100), value: fam }];

  const rows = await executeReadOnlyQuery(text, inputs);
  return rows.map((row) => ({
    codFam: row.CodFam,
    codSFam: row.CodSFam,
    desSFam: row.DesSFam,
  }));
}

// Distinct brand names from listable stock rows only (trimmed; no image columns).
export async function getBrands() {
  const extraWhere = await productCuratedVisibleWhereClause();
  const text = `
    SELECT DISTINCT LTRIM(RTRIM(s.Marque)) AS Marque
    FROM dbo.TabStocksaico s
    ${METADATA_JOIN_SQL}
    WHERE s.Marque IS NOT NULL
      AND LTRIM(RTRIM(s.Marque)) <> N''
      ${extraWhere}
    ORDER BY Marque
  `;
  const rows = await executeReadOnlyQuery(text, []);
  return rows.map((row) => row.Marque);
}

// Used by the cart to refuse products that are hidden from customers.
export async function isProductInCustomerCatalogue(idArt) {
  const extraWhere = await productCuratedVisibleWhereClause();
  const text = `
    SELECT TOP 1 1 AS ok
    FROM dbo.TabStocksaico s
    ${METADATA_JOIN_SQL}
    WHERE s.IDArt = @idArt${extraWhere}
  `;
  const rows = await executeReadOnlyQuery(text, [idArtInput(idArt)]);
  return Boolean(rows[0]?.ok);
}

// Product counts per section for the catalogue landing screen.
export async function getCatalogSections() {
  const extraWhere = await productListableWhereClause();
  const text = `
    SELECT
      m.DisplayCategory AS DisplayCategory,
      m.IsFeatured AS IsFeatured
    FROM dbo.SB_ProductMetadata m
    INNER JOIN dbo.TabStocksaico s ON s.IDArt = m.ProductId
    WHERE m.IsVisible = 1${extraWhere}${curatedModeWhere()}
  `;
  const rows = await executeReadOnlyQuery(text, []);
  return buildCatalogSectionCounts(rows);
}
