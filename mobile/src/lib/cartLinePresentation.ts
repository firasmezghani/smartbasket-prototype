// Display helpers for basket rows (catalogue data is matched by product id).

import type { CartItem } from '../types/cart';
import type { Product } from '../types/catalog';
import { formatProductName } from './productName';
import { normaliseProductIdForMatch } from './shoppingListBatch';

export function indexCatalogProductsById(
  products: readonly Product[] | null | undefined,
): Map<string, Product> {
  const map = new Map<string, Product>();
  if (!Array.isArray(products)) return map;
  for (const product of products) {
    const key = normaliseProductIdForMatch(product?.id);
    if (!key || map.has(key)) continue;
    map.set(key, product);
  }
  return map;
}

export function catalogProductForCartLine(
  catalogById: ReadonlyMap<string, Product> | null | undefined,
  productId: unknown,
): Product | null {
  const key = normaliseProductIdForMatch(productId);
  if (!key || !catalogById) return null;
  return catalogById.get(key) ?? null;
}

export function cartLineDisplayName(
  item: Pick<CartItem, 'productName' | 'productCode' | 'productId'>,
  catalog: Product | null | undefined,
  fallback = '',
): string {
  const catalogName =
    (typeof catalog?.name === 'string' && catalog.name.trim()) ||
    (typeof catalog?.sourceName === 'string' && catalog.sourceName.trim()) ||
    '';
  const sourceName =
    (typeof item.productName === 'string' && item.productName.trim()) ||
    (typeof item.productCode === 'string' && item.productCode.trim()) ||
    '';
  const raw = catalogName || sourceName || fallback;
  return formatProductName(raw);
}

export function cartLineImageProduct(
  item: CartItem,
  catalog: Product | null | undefined,
): Product {
  if (catalog) return catalog;
  return {
    id: item.productId,
    name: item.productName,
    imageUrl: item.imageUrl,
    imageEndpoint: item.imageEndpoint,
    hasImageBinary: item.hasImageBinary,
  };
}

export function cartLinePackageDetail(catalog: Product | null | undefined): string {
  if (!catalog) return '';
  const amount =
    catalog.packageAmount != null && Number.isFinite(Number(catalog.packageAmount))
      ? String(catalog.packageAmount)
      : '';
  const unit = typeof catalog.packageUnit === 'string' ? catalog.packageUnit.trim() : '';
  return amount && unit ? `${amount} ${unit}` : '';
}
