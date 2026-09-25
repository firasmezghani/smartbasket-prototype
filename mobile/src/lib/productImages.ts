import { API_BASE_URL } from '../config/api';
import type { Product } from '../types/catalog';

function trim(v: unknown): string {
  return typeof v === 'string' ? v.trim() : String(v ?? '').trim();
}

function isSafeUrl(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) return false;
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('//')) return true;
  if (t.startsWith('/') && !t.includes('..')) return true;
  return false;
}

function resolveUrl(path: string): string {
  const t = trim(path);
  if (!t) return '';
  if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('//')) {
    return t.startsWith('//') ? `https:${t}` : t;
  }
  const base = API_BASE_URL.replace(/\/$/, '');
  const rel = t.startsWith('/') ? t : `/${t}`;
  return `${base}${rel}`;
}

// Image URLs to try for a product, best first (unsafe URLs are skipped).
export function getProductImageCandidates(product: Product | null | undefined): string[] {
  if (!product) return [];
  const out: string[] = [];
  const add = (raw: unknown) => {
    const t = trim(raw);
    if (!t || !isSafeUrl(t)) return;
    const resolved = resolveUrl(t);
    if (resolved && !out.includes(resolved)) out.push(resolved);
  };

  add(product.metadataImageUrl);
  if (product.hasPromo) add(product.promoImageUrl);
  add(product.remoteImageUrl);
  add(product.cardRemoteImageUrl);
  if (product.hasImageBinary && product.id) {
    add(`/api/catalog/products/${encodeURIComponent(String(product.id))}/image`);
  }
  add(product.imageEndpoint);
  add(product.imageUrl);

  return out;
}

// Best image URI for React Native Image, or null for the placeholder.
export function getProductImageUri(product: Product | null | undefined): string | null {
  return getProductImageCandidates(product)[0] ?? null;
}
