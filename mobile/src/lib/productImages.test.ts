import test from 'node:test';
import assert from 'node:assert/strict';

import { API_BASE_URL } from '../config/api';
import type { Product } from '../types/catalog';
import { getProductImageCandidates, getProductImageUri } from './productImages';

const base = (id: string): Product => ({ id });

test('candidates are ordered: metadata -> promo -> remote -> card -> binary -> endpoint -> url', () => {
  const product: Product = {
    id: 'p1',
    metadataImageUrl: '/product-images/p1.jpg',
    hasPromo: true,
    promoImageUrl: 'https://cdn.example/promo.jpg',
    remoteImageUrl: 'https://cdn.example/remote.jpg',
    cardRemoteImageUrl: 'https://cdn.example/card.jpg',
    hasImageBinary: true,
    imageEndpoint: '/api/legacy/endpoint.jpg',
    imageUrl: 'https://cdn.example/legacy.jpg',
  };
  assert.deepEqual(getProductImageCandidates(product), [
    `${API_BASE_URL}/product-images/p1.jpg`,
    'https://cdn.example/promo.jpg',
    'https://cdn.example/remote.jpg',
    'https://cdn.example/card.jpg',
    `${API_BASE_URL}/api/catalog/products/p1/image`,
    `${API_BASE_URL}/api/legacy/endpoint.jpg`,
    'https://cdn.example/legacy.jpg',
  ]);
});

test('the promotional image is only used when the product is on promo', () => {
  const notPromo: Product = {
    id: 'p2',
    promoImageUrl: 'https://cdn.example/promo.jpg',
    remoteImageUrl: 'https://cdn.example/remote.jpg',
  };
  assert.deepEqual(getProductImageCandidates(notPromo), ['https://cdn.example/remote.jpg']);
});

test('unsafe URLs are rejected', () => {
  const product: Product = {
    id: 'p3',
    metadataImageUrl: 'javascript:alert(1)',
    remoteImageUrl: 'data:image/png;base64,AAAA',
    cardRemoteImageUrl: '../../etc/passwd',
    imageEndpoint: 'ftp://cdn.example/x.jpg',
    imageUrl: 'https://cdn.example/ok.jpg',
  };
  assert.deepEqual(getProductImageCandidates(product), ['https://cdn.example/ok.jpg']);
});

test('protocol-relative URLs are upgraded to https and kept', () => {
  assert.deepEqual(getProductImageCandidates({ id: 'p4', remoteImageUrl: '//cdn.example/x.jpg' }), [
    'https://cdn.example/x.jpg',
  ]);
});

test('candidates are de-duplicated after resolution', () => {
  const product: Product = {
    id: 'p5',
    metadataImageUrl: 'https://cdn.example/same.jpg',
    remoteImageUrl: 'https://cdn.example/same.jpg',
    cardRemoteImageUrl: 'https://cdn.example/same.jpg',
    imageUrl: 'https://cdn.example/other.jpg',
  };
  assert.deepEqual(getProductImageCandidates(product), [
    'https://cdn.example/same.jpg',
    'https://cdn.example/other.jpg',
  ]);
});

test('the binary endpoint is only added when hasImageBinary and an id are present', () => {
  assert.deepEqual(getProductImageCandidates({ id: 'p6', hasImageBinary: true }), [
    `${API_BASE_URL}/api/catalog/products/p6/image`,
  ]);
  assert.deepEqual(getProductImageCandidates({ id: 'p6', hasImageBinary: false }), []);
});

test('no product / no usable fields yields an empty list', () => {
  assert.deepEqual(getProductImageCandidates(null), []);
  assert.deepEqual(getProductImageCandidates(undefined), []);
  assert.deepEqual(getProductImageCandidates(base('p7')), []);
});

test('getProductImageUri returns the first candidate or null', () => {
  assert.equal(
    getProductImageUri({ id: 'p8', remoteImageUrl: 'https://cdn.example/a.jpg' }),
    'https://cdn.example/a.jpg',
  );
  assert.equal(getProductImageUri(base('p9')), null);
});
