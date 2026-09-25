// Reads the package quantity (pieces, g or ml) from a product name, without guessing.

import {
  createIngredientMapper,
  loadIngredientMappingConfig,
} from './recipe/ingredientMapping.service.js';

// --- Limits ---

// Maximum accepted values. Anything larger is ignored with a warning.
export const INTERPRETATION_LIMITS = Object.freeze({
  // Max countable pieces in one retail unit (e.g. a catering tray of eggs).
  MAX_PIECES_PER_UNIT: 360,
  // Max sub-units in a multipack (`<n> x <amount> <unit>`).
  MAX_MULTIPACK_COUNT: 240,
  // Max mass for one retail unit, in grams (100 kg).
  MAX_MASS_G: 100_000,
  // Max volume for one retail unit, in millilitres (100 L).
  MAX_VOLUME_ML: 100_000,
  // Max per-sub-unit numeric amount before canonicalisation.
  MAX_RAW_AMOUNT: 100_000,
  // Basket quantity accepted by `calculateBasketAvailability`.
  MAX_BASKET_QUANTITY: 100_000,
  // Safe ceiling for a basket-scaled total, per canonical unit.
  MAX_SCALED_TOTAL: Object.freeze({ piece: 5_000_000, g: 50_000_000, ml: 50_000_000 }),
});

// Round to 3 dp first (kills e.g. 0.33*1000 = 330.00000000000006), then to an integer.
function toInteger(value) {
  return Math.round(Math.round(value * 1000) / 1000);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseNumericToken(token) {
  if (typeof token !== 'string' || token.trim() === '') return null;
  const n = Number(token);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// --- Units ---

// Raw unit token -> canonical "as printed" unit.
export const UNIT_SYNONYMS = Object.freeze({
  g: 'g', gr: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
  kilogram: 'kg', kilograms: 'kg', kilogramme: 'kg', kilogrammes: 'kg',
  mg: 'mg',
  ml: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml',
  cl: 'cl', centilitre: 'cl', centilitres: 'cl',
  l: 'l', lt: 'l', ltr: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
});

// Printed unit -> factor to the total unit (g or ml).
const MASS_TO_G = Object.freeze({ g: 1, kg: 1000, mg: 0.001 });
const VOLUME_TO_ML = Object.freeze({ ml: 1, cl: 10, l: 1000 });

// Regex-safe alternation of every unit synonym, longest first so `ml` beats `l`.
const UNIT_ALTERNATION = Object.keys(UNIT_SYNONYMS)
  .sort((a, b) => b.length - a.length)
  .join('|');

// Convert an amount and unit to pieces, grams or millilitres (null if unknown).
function canonicaliseTotal(amount, printedUnit) {
  if (!isFiniteNumber(amount) || amount <= 0) return null;
  if (printedUnit === 'piece') {
    const pieces = toInteger(amount);
    return pieces >= 1 ? { totalAmount: pieces, totalUnit: 'piece' } : null;
  }
  if (Object.prototype.hasOwnProperty.call(MASS_TO_G, printedUnit)) {
    return { totalAmount: toInteger(amount * MASS_TO_G[printedUnit]), totalUnit: 'g' };
  }
  if (Object.prototype.hasOwnProperty.call(VOLUME_TO_ML, printedUnit)) {
    return { totalAmount: toInteger(amount * VOLUME_TO_ML[printedUnit]), totalUnit: 'ml' };
  }
  return null;
}

function exceedsTotalBound(totalAmount, totalUnit) {
  if (totalUnit === 'g') return totalAmount > INTERPRETATION_LIMITS.MAX_MASS_G;
  if (totalUnit === 'ml') return totalAmount > INTERPRETATION_LIMITS.MAX_VOLUME_ML;
  if (totalUnit === 'piece') return totalAmount > INTERPRETATION_LIMITS.MAX_PIECES_PER_UNIT;
  return true;
}

// --- Word lists ---

// Package nouns -> canonical packageType. Package words alone imply no quantity.
export const PACKAGE_WORDS = Object.freeze({
  box: ['boite', 'boites', 'box', 'boxes'],
  pack: ['pack', 'packs', 'paquet', 'paquets', 'multipack'],
  bottle: ['bouteille', 'bouteilles', 'bottle', 'bottles', 'flacon', 'flacons'],
  bag: ['sac', 'sacs', 'sachet', 'sachets', 'bag', 'bags'],
  carton: ['brique', 'briques', 'carton', 'cartons'],
  lot: ['lot', 'lots'],
});

// Words that mean "one piece" for countable products (e.g. eggs).
export const COUNTABLE_NOUNS = Object.freeze({
  egg: ['oeuf', 'oeufs', 'egg', 'eggs'],
});

// Words that assert a fixed count of twelve.
const DOZEN_WORDS = Object.freeze(['douzaine', 'douzaines', 'dozen', 'dozens']);
const DOZEN_COUNT = 12;

// Build the countable-noun alternation once, from the frozen constant above.
const COUNTABLE_NOUN_ALTERNATION = Object.values(COUNTABLE_NOUNS)
  .flat()
  .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .sort((a, b) => b.length - a.length)
  .join('|');

// productType -> countable? (lexically).
function countableNounFor(text) {
  for (const [key, nouns] of Object.entries(COUNTABLE_NOUNS)) {
    for (const noun of nouns) {
      const re = new RegExp(`(?:^|[^a-z])${noun}(?:[^a-z]|$)`);
      if (re.test(text)) return key;
    }
  }
  return null;
}

// --- Normalisation (keeps numbers and units) ---

const LIGATURES = Object.freeze({ '\u0153': 'oe', '\u0152': 'oe', '\u00e6': 'ae', '\u00c6': 'ae' });

export function normaliseForInterpretation(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.replace(/[ŒœÆæ]/g, (ch) => LIGATURES[ch] ?? ch);
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); // strip accents
  s = s.toLowerCase();
  s = s.replace(/\u00d7/g, 'x'); // × -> x
  s = s.replace(/(\d)[.,](\d)/g, '$1.$2'); // decimal comma/point -> point (between digits only)
  s = s.replace(/[^a-z0-9/%. ]+/g, ' '); // keep letters, digits, / % . space
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function shortFragment(text) {
  const t = String(text ?? '');
  return t.length > 60 ? `${t.slice(0, 57)}...` : t;
}

// --- Numbers that are not quantities ---

// All use zero-width look-arounds for boundaries so that two adjacent "not a
// quantity" tokens (e.g. `cr2032 bp1`) are both detected.
const RE_FRACTION = /(?<!\d)(\d{1,4})\s*\/\s*(\d{1,4})(?!\d)/g;
const RE_PERCENT = /(?<!\d)(\d{1,3}(?:\.\d{1,3})?)\s*%/g;
const RE_DATE = /(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?!\d)/g;
const RE_YEAR = /(?<!\d)((?:19|20)\d{2})(?!\d)/g;
const RE_PRICE = /(?<!\d)(\d{1,4}\.\d{2,3})\s*(?:dt|tnd|eur|usd|mad|xof|gbp)(?![a-z])/g;
const RE_REF_TOKEN = /(?<![a-z0-9])((?=[a-z0-9]*[a-z])(?=[a-z0-9]*\d)[a-z0-9]{2,})(?![a-z0-9])/g;
const RE_N_IN_ONE = /(?<!\d)(\d{1,2})\s*(?:en|in)\s*(\d{1,2})(?!\d)/g;

// Quantity patterns (1kg, x6, 4x1.5l) hidden first so they are not taken
// for reference codes.
const RE_QUANTITY_SHAPE = new RegExp(
  `\\d+\\s*x\\s*\\d+(?:\\.\\d+)?\\s*(?:${UNIT_ALTERNATION})?(?![a-z])`
  + `|\\d+(?:\\.\\d+)?\\s*(?:${UNIT_ALTERNATION})\\s*x\\s*\\d+(?![a-z])`
  + `|\\d+(?:\\.\\d+)?\\s*(?:${UNIT_ALTERNATION})(?![a-z])`
  + `|x\\s*\\d+`,
  'gi',
);

// Blank out numbers that are not quantities (codes, percentages, dates) and
// collect warnings.
function scanDangerSignals(norm) {
  const warnings = [];
  let working = ` ${norm} `;

  // Silently mask quantity-shaped spans first (no warning): they are handled by
  // the structured matchers and must not trip the reference-token detector.
  working = working.replace(RE_QUANTITY_SHAPE, (match) => match.replace(/[0-9]/g, '#'));

  const sweep = (re, makeWarning) => {
    working = working.replace(re, (match, ...groups) => {
      const w = makeWarning(groups);
      if (w && !warnings.includes(w)) warnings.push(w);
      return match.replace(/[0-9]/g, '#'); // keep length + word boundaries, kill digits
    });
  };

  // Reference / model tokens first: a code like `cr2032` must be recognised as
  // a code, not later mis-labelled a "year".
  sweep(RE_REF_TOKEN, (g) => `reference/model token "${g[0]}" is not treated as a quantity`);
  sweep(RE_FRACTION, (g) => `ratio/fraction "${g[0]}/${g[1]}" is not treated as a quantity`);
  sweep(RE_N_IN_ONE, (g) => `an "${g[0]}-in-${g[1]}" marketing token is not treated as a quantity`);
  sweep(RE_PERCENT, (g) => `percentage "${g[0]}%" is not treated as a quantity`);
  sweep(RE_DATE, () => 'a date-like token is not treated as a quantity');
  sweep(RE_YEAR, (g) => `year-like token "${g[0]}" is not treated as a quantity`);
  sweep(RE_PRICE, () => 'a price-like token is not treated as a quantity');

  return { warnings, working: working.trim() };
}

// --- Quantity patterns ---

const RE_MULTIPACK = new RegExp(
  `(?:^|[^a-z0-9])(\\d{1,4})\\s*x\\s*(\\d{1,6}(?:\\.\\d{1,6})?)\\s*(${UNIT_ALTERNATION})(?![a-z])`,
  'i',
);
const RE_MULTIPACK_REVERSED = new RegExp(
  `(?:^|[^a-z0-9])(\\d{1,6}(?:\\.\\d{1,6})?)\\s*(${UNIT_ALTERNATION})\\s*x\\s*(\\d{1,4})(?![a-z])`,
  'i',
);
const RE_AMOUNT_UNIT = new RegExp(
  `(?:^|[^a-z0-9])(\\d{1,6}(?:\\.\\d{1,6})?)\\s*(${UNIT_ALTERNATION})(?![a-z])`,
  'gi',
);

// Countable grammar (egg-style), most specific first.
const RE_N_PACKS_OF_M = new RegExp(
  `(?:^|[^a-z0-9])(\\d{1,6})\\s+(boites?|paquets?|packs?)\\s+(?:de\\s+)?(\\d{1,6})\\s+(${COUNTABLE_NOUN_ALTERNATION})(?:[^a-z]|$)`,
  'i',
);
const RE_PACK_OF_M = new RegExp(
  `(?:^|[^a-z0-9])(boites?|paquets?|packs?)\\s+(?:de\\s+)?(\\d{1,6})\\s+(${COUNTABLE_NOUN_ALTERNATION})(?:[^a-z]|$)`,
  'i',
);
const RE_DOZEN = new RegExp(
  `(?:^|[^a-z0-9])(?:(\\d{1,2})\\s+)?(${DOZEN_WORDS.join('|')})\\s+(?:d[e']?\\s*)?(${COUNTABLE_NOUN_ALTERNATION})(?:[^a-z]|$)`,
  'i',
);
const RE_NOUN_X_N = new RegExp(
  `(?:^|[^a-z0-9])(${COUNTABLE_NOUN_ALTERNATION})\\s*x\\s*(\\d{1,6})(?:[^0-9]|$)`,
  'i',
);
const RE_N_NOUN = new RegExp(
  `(?:^|[^a-z0-9])x?\\s*(\\d{1,6})\\s+(${COUNTABLE_NOUN_ALTERNATION})(?:[^a-z]|$)`,
  'i',
);
const RE_BARE_NUMBER = /(?:^|[^0-9.])(\d{1,7})(?:\.\d{1,3})?(?![0-9])/g;

const CONFIDENCE_ORDER = ['none', 'low', 'medium', 'high'];
function minConfidence(a, b) {
  return CONFIDENCE_ORDER[Math.min(CONFIDENCE_ORDER.indexOf(a), CONFIDENCE_ORDER.indexOf(b))];
}

function detectPackageType(norm) {
  for (const [type, words] of Object.entries(PACKAGE_WORDS)) {
    for (const w of words) {
      if (new RegExp(`(?:^|[^a-z])${w}(?:[^a-z]|$)`).test(norm)) return type;
    }
  }
  return null;
}

// Extract the package quantity from the normalised name.
function interpretQuantity(norm) {
  const out = {
    packageType: null,
    packageCount: null,
    perPackageAmount: null,
    perPackageUnit: null,
    totalAmount: null,
    totalUnit: null,
    quantityStatus: 'none', // 'ok' | 'none' | 'ambiguous'
    confidence: 'none',
    warnings: [],
    matched: [],
  };
  if (norm === '') return out;

  out.packageType = detectPackageType(norm);
  const { warnings: dangerWarnings, working } = scanDangerSignals(norm);
  out.warnings.push(...dangerWarnings);

  const lexicalCountable = countableNounFor(norm);

  const setTotal = (amount, printedUnit, { count = null, confidence } = {}) => {
    const canonical = canonicaliseTotal(amount, printedUnit);
    if (!canonical) return false;
    const totalWithPacks = count && count > 1
      ? canonicaliseTotal(amount * count, printedUnit)
      : canonical;
    if (!totalWithPacks) return false;
    if (amount > INTERPRETATION_LIMITS.MAX_RAW_AMOUNT
      || (count && count > INTERPRETATION_LIMITS.MAX_MULTIPACK_COUNT)
      || exceedsTotalBound(totalWithPacks.totalAmount, totalWithPacks.totalUnit)) {
      out.warnings.push('a parsed quantity exceeded the documented safe bounds and was discarded');
      return false;
    }
    out.perPackageAmount = printedUnit === 'piece' ? toInteger(amount) : Math.round(amount * 1000) / 1000;
    out.perPackageUnit = printedUnit;
    out.packageCount = count && count >= 1 ? count : (count === null ? null : 1);
    out.totalAmount = totalWithPacks.totalAmount;
    out.totalUnit = totalWithPacks.totalUnit;
    out.quantityStatus = 'ok';
    out.confidence = confidence;
    out.matched.push('perPackageAmount', 'perPackageUnit', 'totalAmount', 'totalUnit');
    if (out.packageCount != null) out.matched.push('packageCount');
    return true;
  };

  // Multipack: <n> x <amount> <unit> (or the reverse order).
  const mp = norm.match(RE_MULTIPACK) || null;
  const mpRev = mp ? null : (norm.match(RE_MULTIPACK_REVERSED) || null);
  if (mp || mpRev) {
    const count = parseNumericToken(mp ? mp[1] : mpRev[3]);
    const amount = parseNumericToken(mp ? mp[2] : mpRev[1]);
    const printedUnit = UNIT_SYNONYMS[(mp ? mp[3] : mpRev[2]).toLowerCase()] ?? null;
    if (count && count >= 1 && amount && printedUnit) {
      if (setTotal(amount, printedUnit, { count: Math.trunc(count), confidence: 'high' })) {
        out.reasonHint = `multipack ${Math.trunc(count)} x ${amount} ${printedUnit}`;
        return out;
      }
    }
  }

  // Countable words (egg-style). Only clear package or count words.
  const nPacksOfM = norm.match(RE_N_PACKS_OF_M);
  if (nPacksOfM) {
    const count = parseNumericToken(nPacksOfM[1]);
    const per = parseNumericToken(nPacksOfM[3]);
    if (count && per && per <= INTERPRETATION_LIMITS.MAX_PIECES_PER_UNIT) {
      out.packageType = out.packageType ?? 'box';
      if (setTotal(per, 'piece', { count: Math.trunc(count), confidence: 'high' })) {
        out.reasonHint = `${Math.trunc(count)} packs of ${Math.trunc(per)} pieces`;
        return out;
      }
    }
  }
  const packOfM = norm.match(RE_PACK_OF_M);
  if (packOfM) {
    const per = parseNumericToken(packOfM[2]);
    if (per && per <= INTERPRETATION_LIMITS.MAX_PIECES_PER_UNIT) {
      out.packageType = out.packageType ?? 'box';
      if (setTotal(per, 'piece', { count: 1, confidence: 'high' })) {
        out.reasonHint = `pack of ${Math.trunc(per)} pieces`;
        return out;
      }
    }
  }
  const dozen = norm.match(RE_DOZEN);
  if (dozen) {
    const packs = dozen[1] ? Math.trunc(parseNumericToken(dozen[1])) : 1;
    if (packs && packs >= 1) {
      if (setTotal(DOZEN_COUNT, 'piece', { count: packs, confidence: 'high' })) {
        out.reasonHint = `${packs} dozen`;
        return out;
      }
    }
  }
  const nounXn = norm.match(RE_NOUN_X_N);
  if (nounXn) {
    const per = parseNumericToken(nounXn[2]);
    if (per && per <= INTERPRETATION_LIMITS.MAX_PIECES_PER_UNIT) {
      if (setTotal(per, 'piece', { count: 1, confidence: 'high' })) {
        out.reasonHint = `${Math.trunc(per)} pieces`;
        return out;
      }
    } else if (per) {
      out.warnings.push(`piece count "${Math.trunc(per)}" exceeds the safe per-unit bound; quantity not extracted`);
    }
  }
  const nNoun = lexicalCountable ? norm.match(RE_N_NOUN) : null;
  if (nNoun) {
    const per = parseNumericToken(nNoun[1]);
    if (per && per <= INTERPRETATION_LIMITS.MAX_PIECES_PER_UNIT) {
      if (setTotal(per, 'piece', { count: 1, confidence: 'high' })) {
        out.reasonHint = `${Math.trunc(per)} pieces`;
        return out;
      }
    } else if (per) {
      out.warnings.push(`piece count "${Math.trunc(per)}" exceeds the safe per-unit bound; quantity not extracted`);
    }
  }

  // Single <amount> <unit> (mass or volume). Collect all; if they disagree, ambiguous.
  const amountUnitMatches = [];
  RE_AMOUNT_UNIT.lastIndex = 0;
  let m;
  while ((m = RE_AMOUNT_UNIT.exec(norm)) !== null) {
    const amount = parseNumericToken(m[1]);
    const printedUnit = UNIT_SYNONYMS[m[2].toLowerCase()] ?? null;
    const canonical = printedUnit && amount != null ? canonicaliseTotal(amount, printedUnit) : null;
    if (canonical) amountUnitMatches.push({ amount, printedUnit, canonical });
  }
  const distinctTotals = new Set(amountUnitMatches.map((x) => `${x.canonical.totalAmount}${x.canonical.totalUnit}`));
  if (distinctTotals.size > 1) {
    out.quantityStatus = 'ambiguous';
    out.confidence = 'none';
    out.warnings.push('the name contains more than one mass/volume reading; quantity left ambiguous');
    return out;
  }
  let amountUnitRejectedForBounds = false;
  if (amountUnitMatches.length >= 1) {
    const { amount, printedUnit } = amountUnitMatches[0];
    if (setTotal(amount, printedUnit, { count: null, confidence: 'high' })) {
      out.reasonHint = `${amount} ${printedUnit}`;
      // Extra unexplained numbers (not consumed, not danger tokens) -> downgrade.
      const leftover = countTrustworthyBareNumbers(working, [String(amount)]);
      if (leftover > 0) {
        out.confidence = 'medium';
        out.warnings.push('additional unexplained numeric token(s) present; used only the unit-attached amount');
      }
      return out;
    }
    // This amount failed the safety limits, so its number is not reported again
    // as an "isolated number".
    amountUnitRejectedForBounds = true;
  }

  if (amountUnitRejectedForBounds) return out;

  // Nothing structured found, so judge any single bare number.
  const bareNumbers = extractBareNumbers(working);
  if (bareNumbers.length === 0) {
    if (out.packageType) {
      out.warnings.push(`package word "${out.packageType}" present with no reliable count`);
      out.matched.push('packageType');
      out.confidence = 'low';
    }
    return out;
  }
  if (bareNumbers.length >= 2) {
    out.quantityStatus = 'ambiguous';
    out.confidence = 'none';
    out.warnings.push('several numeric tokens with no unit or countable item; quantity left ambiguous');
    return out;
  }
  // Exactly one bare number.
  if (lexicalCountable) {
    const per = bareNumbers[0];
    if (per >= 1 && per <= INTERPRETATION_LIMITS.MAX_PIECES_PER_UNIT) {
      if (setTotal(per, 'piece', { count: 1, confidence: 'medium' })) {
        out.reasonHint = `${Math.trunc(per)} pieces (loose count near a countable noun)`;
        return out;
      }
    }
    out.warnings.push(`piece count "${bareNumbers[0]}" is outside the safe per-unit bound; quantity not extracted`);
    if (out.packageType) { out.matched.push('packageType'); out.confidence = 'low'; }
    return out;
  }
  out.warnings.push(`isolated number "${bareNumbers[0]}" with no unit or countable item; quantity not extracted`);
  if (out.packageType) {
    out.matched.push('packageType');
    out.confidence = 'low';
  }
  return out;
}

function extractBareNumbers(working) {
  const found = [];
  RE_BARE_NUMBER.lastIndex = 0;
  let m;
  while ((m = RE_BARE_NUMBER.exec(working)) !== null) {
    if (m[1].includes('#')) continue;
    const n = parseNumericToken(m[1]);
    if (n != null) found.push(n);
  }
  return found;
}

function countTrustworthyBareNumbers(working, exclude) {
  const excludeSet = new Set(exclude.map(String));
  return extractBareNumbers(working).filter((n) => !excludeSet.has(String(n))).length;
}

// --- Product type (from the ingredient mapper) ---

function resolveProductType(product, mapProduct) {
  if (typeof mapProduct !== 'function') {
    return { productType: null, productTypeStatus: 'unknown', typeConfidence: 'none', warning: null };
  }
  let mapping;
  try {
    mapping = mapProduct({
      name: product.name,
      family: product.family,
      category: product.family,
      familyName: product.family,
      description: product.description,
      brand: product.brand || undefined,
    });
  } catch {
    return { productType: null, productTypeStatus: 'unknown', typeConfidence: 'none', warning: 'ingredient mapper threw; product type skipped' };
  }
  if (!mapping || typeof mapping !== 'object') {
    return { productType: null, productTypeStatus: 'unknown', typeConfidence: 'none', warning: null };
  }
  if (mapping.status === 'mapped' && typeof mapping.ingredientKey === 'string' && mapping.ingredientKey) {
    return {
      productType: mapping.ingredientKey,
      productTypeStatus: 'mapped',
      typeConfidence: ['exact', 'high'].includes(mapping.confidence) ? 'high'
        : mapping.confidence === 'medium' ? 'medium' : 'low',
      warning: null,
    };
  }
  if (mapping.status === 'ambiguous') {
    return { productType: null, productTypeStatus: 'ambiguous', typeConfidence: 'none', warning: 'ingredient classification is ambiguous (multi-ingredient product)' };
  }
  return { productType: null, productTypeStatus: 'unresolved', typeConfidence: 'none', warning: null };
}

// --- interpretProductName ---

const EMPTY_RESULT = Object.freeze({
  status: 'unresolved',
  productType: null,
  productTypeStatus: 'unknown',
  packageType: null,
  packageCount: null,
  perPackageAmount: null,
  perPackageUnit: null,
  totalAmount: null,
  totalUnit: null,
  amount: null,
  unit: null,
  confidence: 'none',
  matchedFields: [],
  warnings: [],
  reason: 'no usable product name',
});

export function interpretProductName(input, options = {}) {
  const product = typeof input === 'string'
    ? { name: input }
    : (input && typeof input === 'object' && !Array.isArray(input) ? input : {});
  const rawName = typeof product.name === 'string' ? product.name : '';
  const norm = normaliseForInterpretation(rawName);

  if (norm === '') return { ...EMPTY_RESULT };

  const qty = interpretQuantity(norm);
  const type = resolveProductType(product, options.mapProduct);

  const warnings = [...qty.warnings];
  if (type.warning) warnings.push(type.warning);

  const matchedSet = new Set();
  if (type.productTypeStatus === 'mapped') matchedSet.add('productType');
  if (qty.packageType) matchedSet.add('packageType');
  for (const f of qty.matched) matchedSet.add(f);
  const FIELD_ORDER = ['productType', 'packageType', 'packageCount', 'perPackageAmount', 'perPackageUnit', 'totalAmount', 'totalUnit'];
  const matchedFields = FIELD_ORDER.filter((f) => matchedSet.has(f));

  // --- Status ---
  let status;
  if (qty.quantityStatus === 'ambiguous' || type.productTypeStatus === 'ambiguous') {
    status = 'ambiguous';
  } else if (type.productTypeStatus === 'mapped' && qty.quantityStatus === 'ok') {
    status = 'parsed';
  } else if (type.productTypeStatus === 'mapped' || qty.quantityStatus === 'ok') {
    status = 'partial';
  } else {
    status = 'unresolved';
  }

  // --- Confidence ---
  let confidence = 'none';
  if (qty.quantityStatus === 'ok' && type.productTypeStatus === 'mapped') {
    confidence = minConfidence(qty.confidence, type.typeConfidence);
  } else if (qty.quantityStatus === 'ok') {
    confidence = qty.confidence; // quantity is explicit even without a type
  } else if (type.productTypeStatus === 'mapped') {
    confidence = 'low'; // type only
  }
  if (status === 'ambiguous') confidence = minConfidence(confidence, 'medium');

  // --- Reason ---
  const bits = [];
  if (type.productTypeStatus === 'mapped') bits.push(`type=${type.productType}`);
  else if (type.productTypeStatus === 'ambiguous') bits.push('type=ambiguous');
  else if (type.productTypeStatus === 'unresolved') bits.push('type=unresolved');
  if (qty.reasonHint) bits.push(`quantity: ${qty.reasonHint}`);
  else if (qty.quantityStatus === 'ambiguous') bits.push('quantity: ambiguous');
  else bits.push('quantity: not stated');
  const reason = `${bits.join('; ')} [${shortFragment(norm)}]`;

  return {
    status,
    productType: type.productType,
    productTypeStatus: type.productTypeStatus,
    packageType: qty.packageType,
    packageCount: qty.packageCount,
    perPackageAmount: qty.perPackageAmount,
    perPackageUnit: qty.perPackageUnit,
    totalAmount: qty.totalAmount,
    totalUnit: qty.totalUnit,
    // Shortcuts for the total amount.
    amount: qty.totalAmount,
    unit: qty.totalUnit,
    confidence,
    matchedFields,
    warnings,
    reason,
  };
}

// --- calculateBasketAvailability ---

// Total amount represented by a basket quantity of this product. Invalid quantities are rejected.
export function calculateBasketAvailability(interpretation, basketQuantity) {
  const invalid = (reason) => ({ status: 'invalid', totalAmount: null, totalUnit: null, basketQuantity: null, reason });

  if (!interpretation || typeof interpretation !== 'object' || Array.isArray(interpretation)) {
    return invalid('an interpretation object is required');
  }
  if (typeof basketQuantity !== 'number' || !Number.isFinite(basketQuantity)) {
    return invalid('basketQuantity must be a finite number');
  }
  if (!Number.isInteger(basketQuantity)) {
    return invalid('basketQuantity must be an integer');
  }
  if (basketQuantity < 1) {
    return invalid('basketQuantity must be 1 or greater');
  }
  if (basketQuantity > INTERPRETATION_LIMITS.MAX_BASKET_QUANTITY) {
    return invalid('basketQuantity exceeds the documented safe bound');
  }

  const { totalAmount, totalUnit } = interpretation;
  if (!isFiniteNumber(totalAmount) || totalAmount <= 0 || totalUnit == null) {
    return {
      status: 'unknown',
      totalAmount: null,
      totalUnit: totalUnit ?? null,
      basketQuantity,
      reason: 'the interpretation has no usable total quantity',
    };
  }

  const scaled = totalAmount * basketQuantity;
  const bound = INTERPRETATION_LIMITS.MAX_SCALED_TOTAL[totalUnit] ?? 0;
  if (!Number.isFinite(scaled) || scaled > bound) {
    return invalid('the basket-scaled quantity exceeds the documented safe bound');
  }

  return {
    status: 'available',
    totalAmount: toInteger(scaled),
    totalUnit,
    basketQuantity,
    reason: `${totalAmount} ${totalUnit} per retail unit x ${basketQuantity}`,
  };
}

// --- Interpreter factory ---

// Create an interpreter bound to an ingredient mapper (the default mapping if none is given).
export function createProductInterpreter(deps = {}) {
  const mapProduct = typeof deps.mapProduct === 'function'
    ? deps.mapProduct
    : createIngredientMapper(loadIngredientMappingConfig());
  return {
    interpret(input) {
      return interpretProductName(input, { mapProduct });
    },
    calculateBasketAvailability,
  };
}
