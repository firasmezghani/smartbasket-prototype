import type { CatalogDisplayCategory, CatalogSectionKey } from '../types/catalog';
import type { CatalogQuery } from './catalogQuery';
import { catalogSectionTitleKey } from './catalogSections';

// Catalogue browsing state: All products (the default), Featured, a category
// or a search. Selections are kept when the screen regains focus.

export type CatalogSelection =
  | { kind: 'all' }
  | { kind: 'featured' }
  | { kind: 'category'; category: CatalogDisplayCategory };

export type CatalogFilter = CatalogSelection | { kind: 'search'; term: string };

export type CatalogView = { mode: 'landing' } | { mode: 'results'; filter: CatalogFilter };

// A selection from a landing section key, or null for "All products".
export function selectionFromSectionKey(key: CatalogSectionKey): CatalogSelection {
  return key === 'featured' ? { kind: 'featured' } : { kind: 'category', category: key };
}

// Show results when a chip is selected or a search is typed, otherwise the landing view.
export function resolveCatalogView(
  searchTerm: string,
  selection: CatalogSelection | null,
): CatalogView {
  const term = (searchTerm ?? '').trim();
  if (selection) {
    return { mode: 'results', filter: selection };
  }
  if (term !== '') {
    return { mode: 'results', filter: { kind: 'search', term } };
  }
  return { mode: 'landing' };
}

// Map the active filter (+ any search term) to an API query, minus pagination.
export function catalogQueryForFilter(filter: CatalogFilter, searchTerm = ''): CatalogQuery {
  const term = (searchTerm ?? '').trim();
  switch (filter.kind) {
    case 'search':
      return { search: filter.term.trim() };
    case 'all':
      return term ? { search: term } : {};
    case 'featured':
      return term ? { featured: true, search: term } : { featured: true };
    case 'category':
      return term
        ? { displayCategory: filter.category, search: term }
        : { displayCategory: filter.category };
    default:
      return {};
  }
}

export type CatalogFilterLabel = {
  key: string;
  params?: Record<string, string | number>;
};

// Which category chip is highlighted.
export function catalogChipSelection(
  view: CatalogView,
): CatalogSectionKey | 'all' | null {
  if (view.mode === 'landing') return 'featured';
  const filter = view.filter;
  if (filter.kind === 'featured') return 'featured';
  if (filter.kind === 'category') return filter.category;
  if (filter.kind === 'all') return 'all';
  return null;
}

// Number of grid columns for the screen width (fewer with large text).
export function catalogColumnCount(width: number, fontScale = 1): number {
  const w = Number.isFinite(width) && width > 0 ? width : 0;
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  let cols = w >= 900 ? 4 : w >= 600 ? 3 : 2;
  if (scale >= 1.6) cols = 1;
  else if (scale >= 1.3) cols = Math.min(cols, 2);
  return Math.max(1, cols);
}

// i18n descriptor for the "active filter" indicator shown above the results.
export function catalogFilterLabel(filter: CatalogFilter): CatalogFilterLabel {
  switch (filter.kind) {
    case 'search':
      return { key: 'catalog.resultsFor', params: { query: filter.term.trim() } };
    case 'all':
      return { key: 'catalog.allProducts' };
    case 'featured':
      return { key: 'catalog.sectionFeatured' };
    case 'category':
      return { key: catalogSectionTitleKey(filter.category) };
    default:
      return { key: 'catalog.allProducts' };
  }
}
