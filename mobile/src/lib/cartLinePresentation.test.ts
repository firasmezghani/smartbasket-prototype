import test from 'node:test';
import assert from 'node:assert/strict';

import type { CartItem } from '../types/cart';
import type { Product } from '../types/catalog';
import {
  cartLineDisplayName,
  cartLineImageProduct,
  cartLinePackageDetail,
  catalogProductForCartLine,
  indexCatalogProductsById,
} from './cartLinePresentation';

function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 1,
    productId: 'sku-milk',
    productName: 'LAIT DELICE UHT ENTIER 1L',
    quantity: 1,
    ...overrides,
  };
}

test('catalogue lookup is by product id only and never by name', () => {
  const catalog: Product[] = [
    { id: 'SKU-MILK', name: 'Lait Délice UHT entier', sourceName: 'LAIT DELICE UHT ENTIER 1L', packageAmount: 1, packageUnit: 'L' },
    { id: 'sku-other', name: 'LAIT DELICE UHT ENTIER 1L' },
  ];
  const map = indexCatalogProductsById(catalog);
  assert.equal(catalogProductForCartLine(map, 'sku-milk')?.name, 'Lait Délice UHT entier');
  assert.equal(catalogProductForCartLine(map, 'SKU-MILK')?.id, 'SKU-MILK');
  assert.equal(catalogProductForCartLine(map, 'missing')?.name, undefined);
  assert.equal(
    cartLineDisplayName(item({ productId: 'missing', productName: 'LAIT DELICE UHT ENTIER 1L' }), catalogProductForCartLine(map, 'missing')),
    'LAIT DELICE UHT ENTIER 1L',
  );
});

test('display name prefers the customer-facing catalogue name for that id', () => {
  const catalog: Product = {
    id: 'sku-milk',
    name: 'Lait Délice UHT entier',
    sourceName: 'LAIT DELICE UHT ENTIER 1L',
  };
  assert.equal(cartLineDisplayName(item(), catalog), 'Lait Délice UHT entier');
  assert.equal(
    cartLineDisplayName(item(), { id: 'sku-milk', name: '  ', sourceName: 'LAIT DELICE UHT ENTIER 1L' }),
    'LAIT DELICE UHT ENTIER 1L',
  );
  assert.equal(cartLineDisplayName(item(), null, 'Product'), 'LAIT DELICE UHT ENTIER 1L');
  assert.equal(
    cartLineDisplayName(item({ productName: '  ', productCode: 'D-1' }), null),
    'D-1',
  );
});

test('image source uses the catalogue product when the id matches, else basket image fields', () => {
  const catalog: Product = {
    id: 'sku-milk',
    name: 'Lait Délice UHT entier',
    metadataImageUrl: 'https://cdn.example/milk.jpg',
  };
  assert.equal(cartLineImageProduct(item(), catalog), catalog);
  const fallback = cartLineImageProduct(
    item({ imageUrl: 'https://cdn.example/cart.jpg', hasImageBinary: true, imageEndpoint: '/api/catalog/products/sku-milk/image' }),
    null,
  );
  assert.equal(fallback.id, 'sku-milk');
  assert.equal(fallback.imageUrl, 'https://cdn.example/cart.jpg');
  assert.equal(fallback.hasImageBinary, true);
  assert.equal(cartLinePackageDetail(catalog), '');
  assert.equal(
    cartLinePackageDetail({ id: 'sku-milk', packageAmount: 1, packageUnit: 'L' }),
    '1 L',
  );
});
