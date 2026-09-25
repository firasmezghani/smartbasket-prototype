import {
  CATALOG_DISPLAY_CATEGORIES,
  type CatalogDisplayCategory,
  type CatalogIntelligenceType,
  type Product,
} from '../types/catalog';

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const DISPLAY_CATEGORY_SET = new Set<string>(CATALOG_DISPLAY_CATEGORIES);

export function normalizeDisplayCategory(v: unknown): CatalogDisplayCategory | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  return DISPLAY_CATEGORY_SET.has(t) ? (t as CatalogDisplayCategory) : null;
}

function normalizeIntelligence(v: unknown): CatalogIntelligenceType {
  return v === 'recipe' || v === 'replenishment' ? v : 'none';
}

// Parse one product from the API and fill safe defaults.
export function normalizeProduct(raw: unknown): Product {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const base = r as Product;

  const name =
    strOrNull(r.name) ?? (typeof base.name === 'string' ? base.name : base.name ?? null);

  return {
    ...base,
    id: String(r.id ?? ''),
    name,
    sourceName: strOrNull(r.sourceName),
    isCurated: r.isCurated === true,
    displayCategory: normalizeDisplayCategory(r.displayCategory),
    displaySubcategory: strOrNull(r.displaySubcategory),
    isFeatured: r.isFeatured === true,
    intelligenceType: normalizeIntelligence(r.intelligenceType),
    isRecipeEligible: r.isRecipeEligible === true,
    isReplenishmentEligible: r.isReplenishmentEligible === true,
    expectedRepurchaseDays: numOrNull(r.expectedRepurchaseDays),
    sortOrder: numOrNull(r.sortOrder) ?? 0,
    metadataImageUrl: strOrNull(r.metadataImageUrl),
    canonicalType: strOrNull(r.canonicalType),
    classificationStatus: normalizeClassificationStatus(r.classificationStatus),
    packageAmount: numOrNull(r.packageAmount),
    packageUnit: strOrNull(r.packageUnit),
  };
}

function normalizeClassificationStatus(
  v: unknown,
): Product['classificationStatus'] {
  return v === 'typed' || v === 'excluded' || v === 'unknown' || v === 'non_food' ? v : 'unknown';
}

// Parse an array of product objects, dropping anything that has no id.
export function normalizeProductList(raw: unknown): Product[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeProduct).filter((p) => p.id !== '');
}
