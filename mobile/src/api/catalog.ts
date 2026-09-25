import type { CatalogPagination, CatalogSection, Product } from '../types/catalog';
import { buildCatalogQueryString, type CatalogQuery } from '../lib/catalogQuery';
import { normalizeProduct, normalizeProductList } from '../lib/catalogParse';
import { parseCatalogSectionsResponse } from '../lib/catalogSections';
import { ApiError, apiUrl, handleResponse } from './http';

// Query accepted by GET /api/catalog/products (displayCategory / featured / curated filters).
export type ProductQuery = CatalogQuery;

export function parseCatalogProductsResponse(body: Record<string, unknown>): {
  data: Product[];
  pagination: CatalogPagination;
} {
  const rawList = Array.isArray(body.data)
    ? body.data
    : Array.isArray(body.products)
      ? body.products
      : [];
  const products = normalizeProductList(rawList);

  const pagination =
    body.pagination && typeof body.pagination === 'object'
      ? (body.pagination as Record<string, unknown>)
      : {};
  const total = Number(pagination.total ?? body.total);
  const limit = Number(pagination.limit ?? body.limit);
  const offset = Number(pagination.offset ?? body.offset);
  const hasMore =
    typeof pagination.hasMore === 'boolean'
      ? pagination.hasMore
      : Number.isFinite(total) && Number.isFinite(offset) && products.length > 0
        ? offset + products.length < total
        : false;

  return {
    data: products,
    pagination: {
      limit: Number.isFinite(limit) ? limit : products.length,
      offset: Number.isFinite(offset) ? offset : 0,
      total: Number.isFinite(total) ? total : 0,
      hasMore,
    },
  };
}

export async function fetchProducts(params: ProductQuery = {}): Promise<{
  data: Product[];
  pagination: CatalogPagination;
}> {
  const qs = buildCatalogQueryString(params);
  const url = apiUrl(qs ? `/api/catalog/products?${qs}` : '/api/catalog/products');
  const res = await fetch(url);
  const body = await handleResponse<Record<string, unknown>>(res);
  return parseCatalogProductsResponse(body);
}

// Read-only catalogue landing sections (fixed keys, translation keys, visible-curated counts).
export async function fetchCatalogSections(): Promise<CatalogSection[]> {
  const res = await fetch(apiUrl('/api/catalog/sections'));
  const body = await handleResponse<Record<string, unknown>>(res);
  return parseCatalogSectionsResponse(body);
}

export async function fetchProductById(idArt: string): Promise<Product> {
  const res = await fetch(apiUrl(`/api/catalog/products/${encodeURIComponent(idArt)}`));
  const body = await handleResponse<{ data: unknown }>(res);
  return normalizeProduct(body.data);
}

export type BarcodeLookupMeta = {
  matchedCodBar: string;
  matchCount: number;
};

export type BarcodeLookupResult = {
  product: Product;
  lookup: BarcodeLookupMeta;
};

// Resolve a catalog product by in-store barcode (read-only company tables on server).
export async function fetchProductByBarcode(barcode: string): Promise<BarcodeLookupResult> {
  const trimmed = barcode.trim();
  if (!trimmed) {
    throw new ApiError('Please enter a barcode.', 400);
  }
  const res = await fetch(
    apiUrl(`/api/catalog/products/by-barcode/${encodeURIComponent(trimmed)}`),
  );
  const body = await handleResponse<{ data: unknown; lookup: BarcodeLookupMeta }>(res);
  return {
    product: normalizeProduct(body.data),
    lookup: body.lookup ?? { matchedCodBar: trimmed, matchCount: 1 },
  };
}

export async function fetchPublicSettings(): Promise<Record<string, string>> {
  const res = await fetch(apiUrl('/api/settings/public'));
  const body = await handleResponse<{ data: Array<{ settingKey?: string; settingValue?: unknown }> }>(
    res,
  );
  const map: Record<string, string> = {};
  for (const row of Array.isArray(body.data) ? body.data : []) {
    const key = typeof row.settingKey === 'string' ? row.settingKey.trim() : '';
    if (!key) continue;
    map[key] = row.settingValue == null ? '' : String(row.settingValue);
  }
  return map;
}
