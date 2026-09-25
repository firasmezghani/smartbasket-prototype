import type { CatalogSection, CatalogSectionKey } from '../types/catalog';

// Fixed catalogue landing sections, in display order.
export const CATALOG_SECTION_KEYS: readonly CatalogSectionKey[] = [
  'featured',
  'food',
  'drinks',
  'household',
  'personal-care',
  'other',
];

const TITLE_KEY_BY_SECTION: Record<CatalogSectionKey, string> = {
  featured: 'catalog.sectionFeatured',
  food: 'catalog.categoryFood',
  drinks: 'catalog.categoryDrinks',
  household: 'catalog.categoryHousehold',
  'personal-care': 'catalog.categoryPersonalCare',
  other: 'catalog.categoryOther',
};

export function catalogSectionTitleKey(key: CatalogSectionKey): string {
  return TITLE_KEY_BY_SECTION[key] ?? 'catalog.categoryOther';
}

const SECTION_KEY_SET = new Set<string>(CATALOG_SECTION_KEYS);

// Parse the catalogue sections response (always the six sections in order).
export function parseCatalogSectionsResponse(body: unknown): CatalogSection[] {
  const rows =
    body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)
      ? ((body as { data: unknown[] }).data)
      : [];

  const countByKey = new Map<string, number>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const key = String((row as { key?: unknown }).key ?? '');
    if (!SECTION_KEY_SET.has(key)) continue;
    const raw = Number((row as { count?: unknown }).count);
    countByKey.set(key, Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 0);
  }

  return CATALOG_SECTION_KEYS.map((key) => ({
    key,
    titleKey: catalogSectionTitleKey(key),
    count: countByKey.get(key) ?? 0,
  }));
}

// Translation key for "1 product" / "n products".
export function productCountKey(
  count: number,
): 'catalog.productCountOne' | 'catalog.productCountOther' {
  return Math.abs(Math.trunc(Number(count) || 0)) === 1
    ? 'catalog.productCountOne'
    : 'catalog.productCountOther';
}
