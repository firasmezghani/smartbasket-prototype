import type { CatalogDisplayCategory } from '../types/catalog';

// Filters accepted by GET /api/catalog/products.
export type CatalogQuery = {
  limit?: number;
  offset?: number;
  search?: string;
  family?: string;
  brand?: string;
  subfamily?: string;
  site?: string;
  sort?: string;
  hasPromo?: boolean | string;
  displayCategory?: CatalogDisplayCategory | string;
  featured?: boolean;
  curated?: boolean;
};

// Build the product list query string (empty or default values are left out).
export function buildCatalogQueryString(params: CatalogQuery): string {
  const pairs: Array<[string, string]> = [];

  if (params.limit != null && Number.isFinite(params.limit)) {
    pairs.push(['limit', String(params.limit)]);
  }
  if (params.offset != null && Number.isFinite(params.offset)) {
    pairs.push(['offset', String(params.offset)]);
  }
  if (params.search?.trim()) pairs.push(['search', params.search.trim()]);
  if (params.family?.trim()) pairs.push(['family', params.family.trim()]);
  if (params.brand?.trim()) pairs.push(['brand', params.brand.trim()]);
  if (params.subfamily?.trim()) pairs.push(['subfamily', params.subfamily.trim()]);
  if (params.site != null && params.site !== '') pairs.push(['site', String(params.site)]);
  if (params.sort?.trim() && params.sort.trim() !== 'recommended') {
    pairs.push(['sort', params.sort.trim()]);
  }
  if (params.hasPromo === true || params.hasPromo === 'true') pairs.push(['hasPromo', 'true']);

  const displayCategory =
    typeof params.displayCategory === 'string' ? params.displayCategory.trim() : '';
  if (displayCategory) pairs.push(['displayCategory', displayCategory]);
  if (params.featured === true) pairs.push(['featured', 'true']);
  if (params.curated === true) pairs.push(['curated', 'true']);

  return pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}
