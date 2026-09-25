import sql from 'mssql';
import { getPool } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { executeReadOnlyQuery } from './database.service.js';

// App settings in SB_AppConfig. There is one key, `max_basket_quantity` (total units
// allowed in a basket), with a default if the row is missing.

export const MAX_BASKET_QUANTITY_KEY = 'max_basket_quantity';

// Default basket limit (100 items) when no setting is saved.
export const DEFAULT_MAX_BASKET_QUANTITY = 100;

// Documented allowed range for `max_basket_quantity`.
export const MIN_BASKET_QUANTITY = 1;
export const MAX_BASKET_QUANTITY_LIMIT = 500;

// Validate a new basket limit; throws 400 INVALID_BASKET_CAPACITY if out of range.
export function parseBasketQuantitySetting(raw) {
  let n;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw)) {
    n = Number(raw);
  } else {
    throw invalidCapacity();
  }
  if (!Number.isInteger(n) || n < MIN_BASKET_QUANTITY || n > MAX_BASKET_QUANTITY_LIMIT) {
    throw invalidCapacity();
  }
  return n;
}

function invalidCapacity() {
  return new AppError(
    `max_basket_quantity must be an integer between ${MIN_BASKET_QUANTITY} and ${MAX_BASKET_QUANTITY_LIMIT}.`,
    400,
    { code: 'INVALID_BASKET_CAPACITY' },
  );
}

// Read the stored limit, or null if it is missing or invalid (caller uses the default).
export function coerceStoredBasketQuantity(raw) {
  let n;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw)) n = Number(raw);
  else return null;
  if (!Number.isInteger(n) || n < MIN_BASKET_QUANTITY || n > MAX_BASKET_QUANTITY_LIMIT) {
    return null;
  }
  return n;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// The deterministic default config, used whenever the row is absent/unreadable.
export function defaultMaxBasketQuantityConfig() {
  return {
    key: MAX_BASKET_QUANTITY_KEY,
    value: DEFAULT_MAX_BASKET_QUANTITY,
    min: MIN_BASKET_QUANTITY,
    max: MAX_BASKET_QUANTITY_LIMIT,
    source: 'default',
    updatedAt: null,
    updatedBy: null,
  };
}

// Turn the database row into the config object (default if missing or invalid).
export function resolveMaxBasketQuantityConfig(row) {
  if (!row || typeof row !== 'object') return defaultMaxBasketQuantityConfig();
  const value = coerceStoredBasketQuantity(row.ConfigValue);
  if (value == null) return defaultMaxBasketQuantityConfig();
  return {
    key: MAX_BASKET_QUANTITY_KEY,
    value,
    min: MIN_BASKET_QUANTITY,
    max: MAX_BASKET_QUANTITY_LIMIT,
    source: 'database',
    updatedAt: toIsoOrNull(row.UpdatedAt),
    updatedBy: row.UpdatedBy == null ? null : String(row.UpdatedBy),
  };
}

export async function getMaxBasketQuantityConfig() {
  let rows;
  try {
    rows = await executeReadOnlyQuery(
      `SELECT ConfigValue, MinValue, MaxValue, UpdatedAt, UpdatedBy
       FROM dbo.SB_AppConfig
       WHERE ConfigKey = @key`,
      [{ name: 'key', type: sql.NVarChar(100), value: MAX_BASKET_QUANTITY_KEY }],
    );
  } catch {
    // Table missing / DB unavailable, behave as if unset.
    return defaultMaxBasketQuantityConfig();
  }
  return resolveMaxBasketQuantityConfig(Array.isArray(rows) ? rows[0] : null);
}

// Convenience: just the effective integer limit.
export async function getMaxBasketQuantity() {
  const cfg = await getMaxBasketQuantityConfig();
  return cfg.value;
}

// Check and save `max_basket_quantity` with one parameterised `MERGE`.
export async function updateMaxBasketQuantity(rawValue, updatedBy) {
  const value = parseBasketQuantitySetting(rawValue);
  const actor = String(updatedBy ?? '').trim().slice(0, 120) || 'admin';

  try {
    const pool = await getPool();
    await pool
      .request()
      .input('key', sql.NVarChar(100), MAX_BASKET_QUANTITY_KEY)
      .input('value', sql.NVarChar(400), String(value))
      .input('minValue', sql.Int, MIN_BASKET_QUANTITY)
      .input('maxValue', sql.Int, MAX_BASKET_QUANTITY_LIMIT)
      .input('updatedBy', sql.NVarChar(120), actor)
      .query(`
        MERGE dbo.SB_AppConfig AS target
        USING (SELECT @key AS ConfigKey) AS src
          ON target.ConfigKey = src.ConfigKey
        WHEN MATCHED THEN
          UPDATE SET ConfigValue = @value,
                     ValueType = N'int',
                     MinValue = @minValue,
                     MaxValue = @maxValue,
                     UpdatedAt = SYSUTCDATETIME(),
                     UpdatedBy = @updatedBy
        WHEN NOT MATCHED THEN
          INSERT (ConfigKey, ConfigValue, ValueType, MinValue, MaxValue, Description, UpdatedAt, UpdatedBy)
          VALUES (@key, @value, N'int', @minValue, @maxValue,
                  N'Maximum total quantity of units allowed in one active basket (sum of SB_CartItems.Quantity).',
                  SYSUTCDATETIME(), @updatedBy);
      `);
  } catch {
    throw new AppError('Could not update the basket capacity setting.', 500);
  }

  return getMaxBasketQuantityConfig();
}
