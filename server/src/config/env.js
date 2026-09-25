import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: join(__dirname, '../../.env') });

function required(name) {
  const v = process.env[name];
  if (v === undefined || String(v).trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optional(name, fallback) {
  const v = process.env[name];
  if (v === undefined || String(v).trim() === '') return fallback;
  return v;
}

function bool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function int(name, fallback) {
  const v = parseInt(process.env[name], 10);
  if (Number.isNaN(v)) return fallback;
  return v;
}

function devSecret(name, fallback) {
  const v = optional(name, '');
  if (v !== '') return v;
  if (optional('NODE_ENV', 'development') === 'production') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return fallback;
}

export const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  isProd: optional('NODE_ENV', 'development') === 'production',

  PORT: int('PORT', 3001),

  // Network interface to listen on. 0.0.0.0 lets a phone on the same Wi-Fi
  // connect; use 127.0.0.1 to allow this computer only.
  HOST: optional('HOST', '0.0.0.0'),

  // Catalogue shown to customers: 'curated' (default, the 91 products) or 'full'.

  CATALOGUE_MODE: (() => {
    const v = String(optional('CATALOGUE_MODE', 'curated')).trim().toLowerCase();
    return v === 'full' ? 'full' : 'curated';
  })(),

  DB_SERVER: required('DB_SERVER'),
  DB_PORT: int('DB_PORT', 1433),
  DB_USER: required('DB_USER'),
  DB_PASSWORD: required('DB_PASSWORD'),
  DB_NAME: required('DB_NAME'),

  DB_ENCRYPT: bool('DB_ENCRYPT', true),
  DB_TRUST_SERVER_CERTIFICATE: bool('DB_TRUST_SERVER_CERTIFICATE', true),

  DB_CONNECTION_TIMEOUT_MS: int('DB_CONNECTION_TIMEOUT_MS', 15_000),
  DB_REQUEST_TIMEOUT_MS: int('DB_REQUEST_TIMEOUT_MS', 30_000),

  JWT_SECRET: devSecret('JWT_SECRET', 'dev-only-change-me'),
  JWT_EXPIRES_IN: optional('JWT_EXPIRES_IN', '8h'),
  CASHIER_USERNAME: required('CASHIER_USERNAME'),
  CASHIER_PASSWORD_HASH: required('CASHIER_PASSWORD_HASH'),
  CASHIER_DISPLAY_NAME: optional('CASHIER_DISPLAY_NAME', 'Prototype Cashier'),

  // Admin login, separate from the cashier. Required in every environment.
  ADMIN_USERNAME: required('ADMIN_USERNAME'),
  ADMIN_PASSWORD_HASH: required('ADMIN_PASSWORD_HASH'),
  ADMIN_DISPLAY_NAME: optional('ADMIN_DISPLAY_NAME', 'Prototype Admin'),
  CORS_ORIGINS: (optional('CORS_ORIGINS', '') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Folder with the product image files referenced by SB_ProductMetadata.ImagePath.
  PRODUCT_IMAGE_DIR: optional('PRODUCT_IMAGE_DIR', 'product-images'),
  // Public URL prefix for files served from PRODUCT_IMAGE_DIR.
  PRODUCT_IMAGE_PUBLIC_PATH: optional('PRODUCT_IMAGE_PUBLIC_PATH', '/product-images'),

  // Demo only: when true, new QR sessions store simulated item weights for the
  // cashier screen. Off by default.
  SIMULATED_BASKET_WEIGHT: bool('SIMULATED_BASKET_WEIGHT', false),
};
