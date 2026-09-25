import type { Product } from '../types/catalog';
import type { TranslationKey } from '../i18n/translations';
import { subcategoryLabel } from './catalogSubcategory';
import { getPriceInStoreLabel } from './valueDisplay';

export function safeTrim(v: unknown): string {
  return typeof v === 'string' ? v.trim() : String(v ?? '').trim();
}

// True when the catalogue provided a real description, not an empty placeholder.
export function hasCatalogueDescription(value: unknown): boolean {
  return safeTrim(value).length > 0;
}

export function parseSalePrice(product: Product | null | undefined): number | null {
  if (!product) return null;
  if (product.salePrice != null) {
    const n = Number(product.salePrice);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (product.sitePrice != null) {
    const n = Number(product.sitePrice);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function isPriceOnRequest(product: Product | null | undefined): boolean {
  if (!product) return true;
  return String(product.priceDisplayMode ?? '') === 'request' || parseSalePrice(product) == null;
}

export function formatPrice(product: Product | null | undefined): string {
  const n = parseSalePrice(product);
  if (n == null) return getPriceInStoreLabel();
  return n.toFixed(3);
}

export function categoryLabel(product: Product): string {
  const fam = safeTrim(product.familyName) || safeTrim(product.familyCode);
  const sub = safeTrim(product.subFamilyName) || safeTrim(product.subFamilyCode);
  if (fam && sub) return `${fam} · ${sub}`;
  return fam || sub || '';
}

const DISPLAY_CATEGORY_LABEL_KEY: Partial<Record<string, TranslationKey>> = {
  food: 'catalog.categoryFood',
  drinks: 'catalog.categoryDrinks',
  household: 'catalog.categoryHousehold',
  'personal-care': 'catalog.categoryPersonalCare',
  other: 'catalog.categoryOther',
};

// Category text for a product: the subcategory on small cards, "Category ·
// Subcategory" on the detail screen, or the imported family for non-curated items.
export function productCategoryText(
  product: Product,
  t: (key: TranslationKey) => string,
  options: { compact?: boolean } = {},
): string {
  const slug = safeTrim(product.displayCategory);
  const key = slug ? DISPLAY_CATEGORY_LABEL_KEY[slug] : undefined;
  if (key) {
    const label = t(key);
    // Localised curated subcategory (falls back to stored text if unknown).
    const sub = subcategoryLabel(product.displaySubcategory, t);
    if (options.compact) return sub || label;
    return sub ? `${label} · ${sub}` : label;
  }
  return categoryLabel(product);
}
