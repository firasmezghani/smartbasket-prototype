// Display helpers for product names and brands (the stored values are not changed).

// U+00A0. Keeps a quantity glued to its unit so "500" and "g" never wrap apart.
export const NON_BREAKING_SPACE = '\u00A0';

// Fold case + accents and turn every run of non-alphanumerics into one space.
function normalizeForCompare(value: unknown): string {
  if (typeof value !== 'string') {
    if (value == null) return '';
    value = String(value);
  }
  return (value as string)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics from accented brand names
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // "Coca-Cola" -> "coca cola"
    .trim()
    .replace(/\s+/g, ' ');
}

// True when the brand already appears in the name, e.g. "BARILLA" in "Spaghetti Barilla 500 g".
export function isBrandInName(brand: unknown, name: unknown): boolean {
  const b = normalizeForCompare(brand);
  const n = normalizeForCompare(name);
  if (b === '' || n === '') return false;
  return ` ${n} `.includes(` ${b} `);
}

// Show the brand line only when the brand is not already in the name.
export function shouldShowBrandEyebrow(brand: unknown, name: unknown): boolean {
  const b = typeof brand === 'string' ? brand.trim() : '';
  if (b === '') return false;
  return !isBrandInName(b, name);
}

// Units that must never be orphaned on their own line. Matched case-insensitively
// but the original casing in the text is preserved.
const UNIT_PATTERN =
  '(?:kg|g|mg|cl|dl|ml|l|cm|mm|m|rouleaux|rouleau|rolls|roll|packs|pack|pcs|pc)';
// number: 500 | 1,5 | 1.5 | 0,33
const QTY_UNIT_RE = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s+(${UNIT_PATTERN})\\b`, 'gi');

// Keep a quantity and its unit on the same line ("500 g") with a non-breaking space.
export function keepQuantityUnitTogether(text: unknown): string {
  if (typeof text !== 'string') {
    if (text == null) return '';
    text = String(text);
  }
  return (text as string).replace(
    QTY_UNIT_RE,
    (_m, qty: string, unit: string) => `${qty}${NON_BREAKING_SPACE}${unit}`,
  );
}

// Display form of a product name (quantity/unit kept together). Trimmed.
export function formatProductName(name: unknown): string {
  const raw =
    typeof name === 'string' ? name.trim() : name == null ? '' : String(name).trim();
  if (raw === '') return '';
  return keepQuantityUnitTogether(raw);
}

// Natural (regular-space) product name for screen readers / accessibility labels.
export function plainProductName(name: unknown): string {
  const s = typeof name === 'string' ? name : name == null ? '' : String(name);
  return s.replace(/\u00A0/g, ' ').trim();
}
