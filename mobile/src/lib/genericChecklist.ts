// A checklist item can be a product, a type such as eggs, or a note.

import type { Product } from '../types/catalog';
import type { ShoppingListItem } from '../types/shoppingList';
import { isCurrentAccountScope, type AccountScope } from './accountScope';

export const SUPPORTED_GENERIC_TYPES = Object.freeze([
  'egg',
  'milk',
  'butter',
  'rice',
  'pasta',
  'tomato',
  'cheese',
  'mozzarella',
  'parmesan',
  'flour',
  'sugar',
  'canned_tuna',
  'mayonnaise',
  'chickpeas',
  'peas',
  'mushroom',
  'olive_oil',
  'peanut_butter',
  'tortilla',
] as const);

export type GenericChecklistType = (typeof SUPPORTED_GENERIC_TYPES)[number];

const SUPPORTED_SET = new Set<string>(SUPPORTED_GENERIC_TYPES);

// The generic types a customer can add (e.g. eggs, milk).
export const GENERIC_CHECKLIST_MEMBERSHIP = Object.freeze({
  egg: 'Hen-egg boxes only (visible 6-piece and 30-piece). Mayonnaise and cake mixes are not egg.',
  milk: 'Dairy milk only. Plant drinks must not inherit this key.',
  butter: 'Dairy butter only. Peanut butter is a separate type.',
  rice: 'Products typed rice.',
  pasta: 'Products typed pasta.',
  tomato: 'Products typed tomato, not merely tomato-containing sauces without that type.',
  cheese: 'Exact CanonicalType cheese only. Mozzarella and parmesan stay separate keys.',
  mozzarella: 'Products typed mozzarella.',
  parmesan: 'Products typed parmesan.',
  flour: 'Products typed flour.',
  sugar: 'Products typed sugar.',
  canned_tuna: 'Products typed canned_tuna.',
  mayonnaise: 'Products typed mayonnaise.',
  chickpeas: 'Products typed chickpeas.',
  peas: 'Products typed peas.',
  mushroom: 'Products typed mushroom.',
  olive_oil: 'Products typed olive_oil. Not a shopping substitute for butter.',
  peanut_butter: 'Products typed peanut_butter. Not a shopping substitute for butter.',
  tortilla: 'Products typed tortilla.',
});

export const GENERIC_CHECKLIST_EXCLUSIONS = Object.freeze([
  'non_food',
  'null CanonicalType (catalogue-only food or drink)',
  'unknown or invalid CanonicalType',
  'recipe anyOf substitutions (for example butter or olive oil)',
  'catalogue search aliases that group mozzarella/parmesan under cheese',
  'products that merely contain an ingredient',
  'drinks without a canonical type (water, soda, juice, coffee)',
]);

// Shopping-intent aliases. Cheese does not include mozzarella or parmesan.
const GENERIC_TYPE_ALIASES: Readonly<Record<GenericChecklistType, readonly string[]>> = Object.freeze({
  egg: Object.freeze(['egg', 'eggs', 'oeuf', 'oeufs']),
  milk: Object.freeze(['milk', 'lait']),
  butter: Object.freeze(['butter', 'beurre']),
  rice: Object.freeze(['rice', 'riz']),
  pasta: Object.freeze(['pasta', 'pates', 'spaghetti', 'penne']),
  tomato: Object.freeze(['tomato', 'tomatoes', 'tomate', 'tomates']),
  cheese: Object.freeze(['cheese', 'fromage']),
  mozzarella: Object.freeze(['mozzarella']),
  parmesan: Object.freeze(['parmesan', 'parmigiano']),
  flour: Object.freeze(['flour', 'farine']),
  sugar: Object.freeze(['sugar', 'sucre']),
  canned_tuna: Object.freeze(['canned tuna', 'tuna', 'thon', 'thon conserve']),
  mayonnaise: Object.freeze(['mayonnaise', 'mayo']),
  chickpeas: Object.freeze(['chickpeas', 'chick peas', 'pois chiches', 'pois chiche']),
  peas: Object.freeze(['peas', 'petit pois', 'petits pois']),
  mushroom: Object.freeze(['mushroom', 'mushrooms', 'champignon', 'champignons']),
  olive_oil: Object.freeze(['olive oil', 'huile olive', 'huile d olive', 'huile dolive']),
  peanut_butter: Object.freeze(['peanut butter', 'beurre de cacahuete', 'beurre cacahuete']),
  tortilla: Object.freeze(['tortilla', 'tortillas']),
});

export type ShoppingClassificationStatus = 'typed' | 'excluded' | 'unknown' | 'non_food';

export type ShoppingClassification = {
  canonicalType: string | null;
  status: ShoppingClassificationStatus;
};

export type GenericMatchCandidate = {
  id: string;
  label: string;
  genericType: GenericChecklistType;
  quantity: number;
};

export type TargetedGenericScan =
  | { kind: 'not_applicable' }
  | { kind: 'incompatible' }
  | { kind: 'compatible'; extraItemId: string; genericType: GenericChecklistType };

export type AfterAddGenericMatch =
  | { kind: 'none' }
  | { kind: 'confirm'; candidates: GenericMatchCandidate[] }
  | { kind: 'select'; candidates: GenericMatchCandidate[] };

function foldShoppingText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSupportedGenericType(value: unknown): value is GenericChecklistType {
  return typeof value === 'string' && SUPPORTED_SET.has(value);
}

export function normaliseGenericType(value: unknown): GenericChecklistType | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  return isSupportedGenericType(key) ? key : null;
}

export function genericTypeLabelKey(type: GenericChecklistType): `list.genericType.${GenericChecklistType}` {
  return `list.genericType.${type}`;
}

// Generic types matching the typed text. Several matches are shown as a choice.
export function genericTypesOfferedForDraft(draft: unknown): GenericChecklistType[] {
  const folded = foldShoppingText(draft);
  if (!folded) return [];
  return SUPPORTED_GENERIC_TYPES.filter((type) => GENERIC_TYPE_ALIASES[type].includes(folded));
}

// Draft text may *offer* a generic choice. It never silently becomes one.
export function genericTypeOfferedForDraft(draft: unknown): GenericChecklistType | null {
  const types = genericTypesOfferedForDraft(draft);
  return types.length === 1 ? types[0] : null;
}

export function shouldOfferGenericDraftChoice(opts: { draft: unknown; adding?: boolean }): boolean {
  if (opts.adding === true) return false;
  return genericTypesOfferedForDraft(opts.draft).length > 0;
}

export function shoppingClassificationOf(product: {
  canonicalType?: string | null;
  classificationStatus?: string | null;
} | null | undefined): ShoppingClassification {
  const statusRaw =
    typeof product?.classificationStatus === 'string'
      ? product.classificationStatus.trim().toLowerCase()
      : '';
  if (statusRaw === 'excluded') {
    return { canonicalType: null, status: 'excluded' };
  }
  if (statusRaw === 'non_food') {
    return { canonicalType: null, status: 'non_food' };
  }
  if (statusRaw === 'unknown') {
    return { canonicalType: null, status: 'unknown' };
  }
  const type = normaliseGenericType(product?.canonicalType);
  if (!type) {
    return { canonicalType: null, status: 'unknown' };
  }
  return { canonicalType: type, status: 'typed' };
}

export function productCompatibleWithGenericType(
  product: {
    canonicalType?: string | null;
    classificationStatus?: string | null;
  } | null | undefined,
  genericType: unknown,
): boolean {
  const wanted = normaliseGenericType(genericType);
  if (!wanted) return false;
  const classification = shoppingClassificationOf(product);
  if (classification.status !== 'typed' || !classification.canonicalType) return false;
  return classification.canonicalType === wanted;
}

function itemHasProductId(item: ShoppingListItem | null | undefined): boolean {
  return typeof item?.productId === 'string' && item.productId.trim().length > 0;
}

export function isUncheckedGenericItem(item: ShoppingListItem | null | undefined): boolean {
  if (!item || item.checked === true) return false;
  if (itemHasProductId(item)) return false;
  return normaliseGenericType(item.genericType) != null;
}

export function matchingUncheckedGenericItems(
  items: readonly ShoppingListItem[] | null | undefined,
  genericType: unknown,
): ShoppingListItem[] {
  const wanted = normaliseGenericType(genericType);
  if (!wanted || !Array.isArray(items)) return [];
  return items.filter(
    (item) => isUncheckedGenericItem(item) && normaliseGenericType(item.genericType) === wanted,
  );
}

export function genericMatchCandidates(
  items: readonly ShoppingListItem[] | null | undefined,
  genericType: unknown,
): GenericMatchCandidate[] {
  return matchingUncheckedGenericItems(items, genericType).map((item) => ({
    id: item.id,
    label: item.label,
    genericType: normaliseGenericType(item.genericType) as GenericChecklistType,
    quantity: item.quantity,
  }));
}

export function evaluateTargetedGenericScan(opts: {
  target: ShoppingListItem | null | undefined;
  product?: {
    canonicalType?: string | null;
    classificationStatus?: string | null;
  } | null;
}): TargetedGenericScan {
  if (!isUncheckedGenericItem(opts.target)) return { kind: 'not_applicable' };
  const genericType = normaliseGenericType(opts.target!.genericType);
  if (!genericType) return { kind: 'not_applicable' };
  if (!productCompatibleWithGenericType(opts.product, genericType)) {
    return { kind: 'incompatible' };
  }
  return { kind: 'compatible', extraItemId: opts.target!.id, genericType };
}

export function extraItemIdForTargetedGenericAdd(
  target: ShoppingListItem | null | undefined,
  product?: {
    canonicalType?: string | null;
    classificationStatus?: string | null;
  } | null,
): string | undefined {
  const result = evaluateTargetedGenericScan({ target, product });
  return result.kind === 'compatible' ? result.extraItemId : undefined;
}

// After a basket add, offer to tick a matching generic item.
export function evaluateAfterAddGenericMatch(opts: {
  items: readonly ShoppingListItem[] | null | undefined;
  product?: {
    canonicalType?: string | null;
    classificationStatus?: string | null;
  } | null;
  collectKind?: 'none' | 'newly_checked' | 'already_checked' | null;
  targetedAlreadyConfirmed?: boolean;
}): AfterAddGenericMatch {
  if (opts.targetedAlreadyConfirmed === true) return { kind: 'none' };
  if (opts.collectKind === 'newly_checked' || opts.collectKind === 'already_checked') {
    return { kind: 'none' };
  }
  const classification = shoppingClassificationOf(opts.product);
  if (classification.status !== 'typed' || !classification.canonicalType) {
    return { kind: 'none' };
  }
  const candidates = genericMatchCandidates(opts.items, classification.canonicalType);
  if (candidates.length === 0) return { kind: 'none' };
  if (candidates.length === 1) return { kind: 'confirm', candidates };
  return { kind: 'select', candidates };
}

export function packageChoiceParts(product: Product | null | undefined): string[] {
  if (!product) return [];
  const brand = typeof product.brand === 'string' ? product.brand.trim() : '';
  const name =
    (typeof product.name === 'string' && product.name.trim()) ||
    (typeof product.sourceName === 'string' && product.sourceName.trim()) ||
    '';
  const amount =
    product.packageAmount != null && Number.isFinite(Number(product.packageAmount))
      ? String(product.packageAmount)
      : '';
  const unit = typeof product.packageUnit === 'string' ? product.packageUnit.trim() : '';
  const pack = amount && unit ? `${amount} ${unit}` : '';
  return [brand, name, pack].filter((part) => part.length > 0);
}

export function evaluateGenericMatchCommit(opts: {
  started: AccountScope;
  current: AccountScope;
  items: readonly ShoppingListItem[] | null | undefined;
  entryId: unknown;
  expectedType?: unknown;
}): { ok: true; extraItemId: string } | { ok: false; reason: 'stale_account' | 'entry_missing' | 'entry_checked' | 'entry_linked' | 'cancelled' } {
  if (!isCurrentAccountScope(opts.started, opts.current)) {
    return { ok: false, reason: 'stale_account' };
  }
  const id = typeof opts.entryId === 'string' ? opts.entryId.trim() : '';
  if (!id) return { ok: false, reason: 'entry_missing' };
  const list = Array.isArray(opts.items) ? opts.items : [];
  const item = list.find((row) => row.id === id);
  if (!item) return { ok: false, reason: 'entry_missing' };
  if (item.checked === true) return { ok: false, reason: 'entry_checked' };
  if (!isUncheckedGenericItem(item)) return { ok: false, reason: 'entry_linked' };
  const expected = normaliseGenericType(opts.expectedType);
  if (expected && normaliseGenericType(item.genericType) !== expected) {
    return { ok: false, reason: 'entry_linked' };
  }
  return { ok: true, extraItemId: id };
}

export function onePackageDoesNotCompleteQuantity(quantity: unknown): boolean {
  const n = Math.floor(Number(quantity));
  return Number.isFinite(n) && n > 1;
}

