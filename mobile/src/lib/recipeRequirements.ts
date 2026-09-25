// Turns each recipe requirement into translated lines for the recipe screens.

import type { TranslationKey } from '../i18n/translations';
import type {
  AvailabilitySemantics,
  RecipeDifficulty,
  RecipeRequirement,
  RecommendationEvidenceSource,
  RequirementStatus,
  RequirementUnit,
} from '../types/recommendations';

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function difficultyKey(value: RecipeDifficulty | null): TranslationKey {
  if (value === 'easy') return 'recipe.difficultyEasy';
  if (value === 'hard') return 'recipe.difficultyHard';
  return 'recipe.difficultyMedium';
}

export function evidenceBadgeKey(source: RecommendationEvidenceSource): TranslationKey {
  if (source === 'basket') return 'recipe.evidenceBadgeBasket';
  if (source === 'history') return 'recipe.evidenceBadgeHistory';
  return 'recipe.evidenceBadgePopularity';
}

const REQUIREMENT_STATUSES: readonly RequirementStatus[] = [
  'sufficient',
  'insufficient',
  'quantity_unknown',
  'matched',
  'missing',
  'not_evaluated',
];

const REQUIREMENT_UNITS: readonly RequirementUnit[] = ['piece', 'g', 'ml'];

// A finite, strictly-positive number, or null. Rejects NaN / Infinity / <= 0 / non-number.
export function safePositiveAmount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function safeUnit(value: unknown): RequirementUnit | null {
  return typeof value === 'string' && (REQUIREMENT_UNITS as readonly string[]).includes(value)
    ? (value as RequirementUnit)
    : null;
}

function safeStatus(value: unknown): RequirementStatus | null {
  return typeof value === 'string' && (REQUIREMENT_STATUSES as readonly string[]).includes(value)
    ? (value as RequirementStatus)
    : null;
}

function safeKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim().toLowerCase();
  return /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(t) ? t : null;
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const k = safeKey(v);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

// Parse one requirement from the API (null if it has no key).
export function parseRequirement(raw: unknown): RecipeRequirement | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const key = safeKey(r.key);
  if (!key) return null;

  const anyOfKeys = safeStringArray(r.anyOfKeys);
  const matchedKey = safeKey(r.matchedKey);
  const requiredUnit = safeUnit(r.requiredUnit);
  const requiredAmount = requiredUnit ? safePositiveAmount(r.requiredAmount) : null;
  const availableUnit = safeUnit(r.availableUnit);
  const availableAmount = availableUnit ? safePositiveAmount(r.availableAmount) : null;

  const status = safeStatus(r.status) ?? (matchedKey ? 'matched' : 'missing');

  return {
    key,
    label: typeof r.label === 'string' && r.label.trim() !== '' ? r.label : key,
    labelKey: typeof r.labelKey === 'string' && r.labelKey.trim() !== '' ? r.labelKey : null,
    essential: r.essential === true,
    anyOfKeys: anyOfKeys.length > 0 ? anyOfKeys : [key],
    matchedKey,
    requiredAmount: requiredUnit && requiredAmount ? requiredAmount : null,
    requiredUnit: requiredUnit && requiredAmount ? requiredUnit : null,
    availableAmount: availableUnit && availableAmount ? availableAmount : null,
    availableUnit: availableUnit && availableAmount ? availableUnit : null,
    quantityText:
      typeof r.quantityText === 'string' && r.quantityText.trim() !== '' ? r.quantityText : null,
    status,
    reasonCode: typeof r.reasonCode === 'string' ? r.reasonCode : '',
  };
}

// Parse an array of raw requirements, dropping unusable entries.
export function parseRequirements(raw: unknown): RecipeRequirement[] {
  if (!Array.isArray(raw)) return [];
  const out: RecipeRequirement[] = [];
  for (const item of raw) {
    const parsed = parseRequirement(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

// Statuses that count as "matched" for the header requirement count.
const MATCHED_FOR_HEADER = new Set<RequirementStatus>(['sufficient', 'matched', 'quantity_unknown']);

export function isRequirementMatchedForHeader(status: RequirementStatus): boolean {
  return MATCHED_FOR_HEADER.has(status);
}

// True for popularity results, where requirements are not checked.
export function isNeutralRequirementSet(requirements: RecipeRequirement[]): boolean {
  return requirements.length > 0 && requirements.every((r) => r.status === 'not_evaluated');
}

// Count essential requirements that count as matched, and the essential total.
export function essentialRequirementCounts(requirements: RecipeRequirement[]): {
  matched: number;
  total: number;
} {
  const essential = requirements.filter((r) => r.essential);
  return {
    matched: essential.filter((r) => isRequirementMatchedForHeader(r.status)).length,
    total: essential.length,
  };
}

// --- Recipe list card ---

// The subset of a recipe list card this module needs to summarise it.
export type RecipeCardSummaryInput = {
  evidenceSource?: string | null;
  availabilitySemantics?: string | null;
  personalised?: boolean | null;
  requirements?: RecipeRequirement[] | null;
  matchedEssentialCount?: number | null;
  missingEssentialCount?: number | null;
  totalEssential?: number | null;
};

export function resolveAvailabilitySemantics(card: {
  availabilitySemantics?: string | null;
  evidenceSource?: string | null;
}): AvailabilitySemantics {
  const raw = card.availabilitySemantics;
  if (
    raw === 'current_availability'
    || raw === 'previous_purchase_association'
    || raw === 'popularity_fallback'
  ) {
    return raw;
  }
  if (card.evidenceSource === 'basket') return 'current_availability';
  if (card.evidenceSource === 'history') return 'previous_purchase_association';
  return 'popularity_fallback';
}

export function isHistoryAvailability(card: {
  availabilitySemantics?: string | null;
  evidenceSource?: string | null;
}): boolean {
  return resolveAvailabilitySemantics(card) === 'previous_purchase_association';
}

// True for a popularity card, which must not show "covered" or "missing" counts.
export function isNeutralRecipeCard(card: RecipeCardSummaryInput): boolean {
  const semantics = resolveAvailabilitySemantics(card);
  const noEvidence =
    semantics === 'popularity_fallback'
    || card.evidenceSource === 'popularity'
    || card.personalised === false;
  const reqs = Array.isArray(card.requirements) ? card.requirements : [];
  return noEvidence && isNeutralRequirementSet(reqs);
}

// Number of requirements to show on a popularity card.
export function neutralRequirementCount(requirements: RecipeRequirement[]): number {
  const essential = requirements.filter((r) => r.essential).length;
  return essential > 0 ? essential : requirements.length;
}

export type RecipeReadinessKind =
  | 'ready'
  | 'missing'
  | 'insufficient'
  | 'check_quantity'
  | 'history'
  | 'popularity';

export type RecipeCardSummary = {
  // True for popularity / no-evidence cards, no matched/missing claims.
  neutral: boolean;
  kind: RecipeReadinessKind;
  // Prominent customer status (Ready to cook / Missing: cheese / …).
  statusLine: string;
  // Optional extra line (e.g. ingredients linked from purchase history).
  detailLine: string | null;
  // Detail-screen overall heading.
  overallLine: string;
  a11yStatus: string;
};

function currentBasketKind(essentials: RecipeRequirement[]): RecipeReadinessKind {
  if (essentials.some((r) => r.status === 'missing')) return 'missing';
  if (essentials.some((r) => r.status === 'insufficient')) return 'insufficient';
  if (essentials.some((r) => r.status === 'quantity_unknown')) return 'check_quantity';
  return 'ready';
}

function formatLabelList(labels: string[], t: T): string {
  if (labels.length <= 2) return labels.join(', ');
  return `${labels[0]}, ${labels[1]} ${t('recipe.statusMoreCount', { count: labels.length - 2 })}`;
}

function currentBasketStatusLine(essentials: RecipeRequirement[], kind: RecipeReadinessKind, t: T): string {
  if (kind === 'ready') return t('recipe.statusReady');
  if (kind === 'missing') {
    const missing = essentials.filter((r) => r.status === 'missing');
    return t('recipe.statusMissing', { list: formatLabelList(missing.map((r) => requirementGroupLabel(r, t)), t) });
  }
  if (kind === 'insufficient') {
    const first = essentials.find((r) => r.status === 'insufficient');
    if (!first) return t('recipe.overallInsufficient');
    const rem = remainingRequirementAmount(first);
    const ingredient = requirementGroupLabel(first, t);
    if (rem) {
      const amount = formatRequirementQuantity(rem.amount, rem.unit, first.matchedKey ?? first.key, t);
      if (amount) return t('recipe.statusNeedMore', { amount, ingredient });
    }
    return t('recipe.statusNotEnough', { ingredient });
  }
  const unknown = essentials.filter((r) => r.status === 'quantity_unknown');
  return t('recipe.statusCheckQuantity', {
    list: formatLabelList(unknown.map((r) => requirementGroupLabel(r, t)), t),
  });
}

function overallLineForKind(kind: RecipeReadinessKind, t: T): string {
  switch (kind) {
    case 'ready':
      return t('recipe.statusReady');
    case 'missing':
      return t('recipe.overallMissing');
    case 'insufficient':
      return t('recipe.overallInsufficient');
    case 'check_quantity':
      return t('recipe.overallCheckQuantity');
    case 'history':
      return t('recipe.statusCheckWhatYouHave');
    case 'popularity':
      return t('recipe.overallNotAssessed');
  }
}

export function buildRecipeCardSummary(card: RecipeCardSummaryInput, t: T): RecipeCardSummary {
  const reqs = Array.isArray(card.requirements) ? card.requirements : [];
  const essentials = reqs.filter((r) => r.essential);
  if (isNeutralRecipeCard(card) || resolveAvailabilitySemantics(card) === 'popularity_fallback') {
    if (isNeutralRecipeCard(card) || essentials.every((r) => r.status === 'not_evaluated')) {
      const line = t('recipe.overallNotAssessed');
      return {
        neutral: true,
        kind: 'popularity',
        statusLine: line,
        detailLine: null,
        overallLine: line,
        a11yStatus: line,
      };
    }
  }
  if (isHistoryAvailability(card)) {
    const associated = essentials.filter((r) => r.status !== 'missing' && r.status !== 'not_evaluated');
    const detailLine = associated.length
      ? t('recipe.associatedIngredients', {
          list: formatLabelList(associated.map((r) => requirementGroupLabel(r, t)), t),
        })
      : null;
    const statusLine = t('recipe.statusCheckWhatYouHave');
    return {
      neutral: false,
      kind: 'history',
      statusLine,
      detailLine,
      overallLine: statusLine,
      a11yStatus: detailLine ? `${statusLine}. ${detailLine}` : statusLine,
    };
  }
  const kind = currentBasketKind(essentials);
  const statusLine = currentBasketStatusLine(essentials, kind, t);
  return {
    neutral: false,
    kind,
    statusLine,
    detailLine: null,
    overallLine: overallLineForKind(kind, t),
    a11yStatus: statusLine,
  };
}

// --- Display ---

// Per-ingredient countable noun translation keys ("1 egg" / "6 eggs").
const PIECE_NOUN_KEYS: Record<string, { one: TranslationKey; other: TranslationKey }> = {
  egg: { one: 'recipe.pieceEggOne', other: 'recipe.pieceEggOther' },
};

// Known ingredient-key → display-label translation key.
const INGREDIENT_LABEL_KEYS: Record<string, TranslationKey> = {
  egg: 'recipe.ingredient.egg',
  butter: 'recipe.ingredient.butter',
  olive_oil: 'recipe.ingredient.oliveOil',
  cheese: 'recipe.ingredient.cheese',
  mozzarella: 'recipe.ingredient.mozzarella',
  parmesan: 'recipe.ingredient.parmesan',
  flour: 'recipe.ingredient.flour',
  milk: 'recipe.ingredient.milk',
  sugar: 'recipe.ingredient.sugar',
  pasta: 'recipe.ingredient.pasta',
  tomato: 'recipe.ingredient.tomato',
  canned_tuna: 'recipe.ingredient.tuna',
  mayonnaise: 'recipe.ingredient.mayonnaise',
  sweetcorn: 'recipe.ingredient.sweetcorn',
  chickpeas: 'recipe.ingredient.chickpeas',
  rice: 'recipe.ingredient.rice',
  mushroom: 'recipe.ingredient.mushroom',
  peas: 'recipe.ingredient.peas',
  tortilla: 'recipe.ingredient.tortilla',
  peanut_butter: 'recipe.ingredient.peanutButter',
};

export function ingredientLabelKey(key: string): TranslationKey | null {
  return INGREDIENT_LABEL_KEYS[key] ?? null;
}

function ingredientShortLabel(key: string, t: T): string {
  if (key === 'cheese') return t('recipe.ingredient.cheddar');
  const tk = ingredientLabelKey(key);
  return tk ? t(tk) : key.replace(/_/g, ' ');
}

export function requirementGroupLabel(req: RecipeRequirement, t: T): string {
  if (req.labelKey) return t(req.labelKey as TranslationKey);
  const keys = req.anyOfKeys.length > 0 ? req.anyOfKeys : [req.key];
  if (keys.includes('butter') && keys.includes('olive_oil')) return t('recipe.reqLabel.cookingFat');
  if (keys.length > 1 && keys.some((k) => k === 'cheese' || k === 'mozzarella' || k === 'parmesan')) {
    return t('recipe.reqLabel.cheese');
  }
  const tk = ingredientLabelKey(req.key);
  return tk ? t(tk) : req.label;
}

function joinOr(items: string[], t: T): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return t('recipe.listOrTwo', { a: items[0], b: items[1] });
  return t('recipe.listOrMany', { list: items.slice(0, -1).join(', '), last: items[items.length - 1] });
}

export function requirementDisplayTitle(req: RecipeRequirement, t: T): string {
  const group = requirementGroupLabel(req, t);
  const keys = req.anyOfKeys.length > 1 ? req.anyOfKeys : [];
  if (keys.length <= 1) return group;
  const list = joinOr(keys.map((k) => ingredientShortLabel(k, t)), t);
  return t('recipe.reqGroupWithAlternatives', { group, list });
}

export function remainingRequirementAmount(
  req: RecipeRequirement,
): { amount: number; unit: RequirementUnit } | null {
  if (
    req.requiredAmount != null
    && req.availableAmount != null
    && req.requiredUnit
    && req.availableUnit
    && req.requiredUnit === req.availableUnit
    && req.requiredAmount > req.availableAmount
  ) {
    const amount = req.requiredAmount - req.availableAmount;
    if (Number.isFinite(amount) && amount > 0) return { amount, unit: req.requiredUnit };
  }
  return null;
}

export type RequirementPartition = {
  youHaveNow: RecipeRequirement[];
  stillNeeded: RecipeRequirement[];
  optionalAdditions: RecipeRequirement[];
  associatedHistory: RecipeRequirement[];
  notAssociatedHistory: RecipeRequirement[];
};

export function partitionRequirements(reqs: RecipeRequirement[]): RequirementPartition {
  const essential = reqs.filter((r) => r.essential);
  const optional = reqs.filter((r) => !r.essential);
  return {
    youHaveNow: essential.filter((r) => r.status === 'sufficient' || r.status === 'matched'),
    stillNeeded: essential.filter(
      (r) => r.status === 'missing' || r.status === 'insufficient' || r.status === 'quantity_unknown',
    ),
    optionalAdditions: optional.filter(
      (r) => r.status === 'missing' || r.status === 'insufficient' || r.status === 'quantity_unknown',
    ),
    associatedHistory: essential.filter((r) => r.status !== 'missing' && r.status !== 'not_evaluated'),
    notAssociatedHistory: essential.filter((r) => r.status === 'missing'),
  };
}

// Format a quantity, e.g. "6 eggs", "1 unit", "500 g".
export function formatRequirementQuantity(
  amount: number | null,
  unit: RequirementUnit | null,
  ingredientKey: string,
  t: T,
): string {
  const n = safePositiveAmount(amount);
  if (n == null || unit == null) return '';
  if (unit === 'piece') {
    const nouns = PIECE_NOUN_KEYS[ingredientKey];
    const rounded = Math.round(n);
    if (nouns) return t(rounded === 1 ? nouns.one : nouns.other, { count: rounded });
    return t(rounded === 1 ? 'recipe.pieceUnitOne' : 'recipe.pieceUnitOther', { count: rounded });
  }
  // g / ml: keep a compact number (integers stay integers, decimals to 1 dp).
  const shown = Number.isInteger(n) ? n : Math.round(n * 10) / 10;
  return t(unit === 'g' ? 'recipe.qtyGrams' : 'recipe.qtyMillilitres', { amount: shown });
}

// Translation key for a requirement status line.
export function requirementStatusKey(
  status: RequirementStatus,
  semantics?: AvailabilitySemantics | string | null,
): TranslationKey {
  const history = semantics === 'previous_purchase_association';
  switch (status) {
    case 'sufficient':
      return history ? 'recipe.reqHistoryAssociated' : 'recipe.reqSufficient';
    case 'insufficient':
      return history ? 'recipe.reqHistoryAssociated' : 'recipe.reqInsufficient';
    case 'quantity_unknown':
      return history ? 'recipe.reqHistoryQuantityUnverified' : 'recipe.reqQuantityUnknown';
    case 'missing':
      return history ? 'recipe.reqHistoryNotAssociated' : 'recipe.reqMissing';
    case 'not_evaluated':
      return 'recipe.reqNotEvaluated';
    case 'matched':
    default:
      return history ? 'recipe.reqHistoryAssociated' : 'recipe.reqMatched';
  }
}

export type RequirementView = {
  key: string;
  titleLabel: string;
  // For example "Detected: 6 eggs", left out when there is no amount.
  detectedLine: string | null;
  // e.g. "Recipe requires: 3 eggs" (structured) or the recipe's free-text quantity.
  requiresLine: string | null;
  // e.g. "Remaining: 120 g" when units are compatible and the amount is short.
  remainingLine: string | null;
  // e.g. "Matched with: Olive oil", only when an alternative (not the primary) matched.
  matchedWithLine: string | null;
  // e.g. "Quantity sufficient" / (neutral) "In this recipe".
  statusLine: string;
  status: RequirementStatus;
  essential: boolean;
  // True for `not_evaluated`, render neutrally, no matched/missing tone.
  neutral: boolean;
};

// Build the fully-translated view model for one requirement.
export function buildRequirementView(
  req: RecipeRequirement,
  t: T,
  semantics?: AvailabilitySemantics | string | null,
): RequirementView {
  const titleLabel = requirementDisplayTitle(req, t);
  const neutral = req.status === 'not_evaluated';
  const history = semantics === 'previous_purchase_association';

  const detectedQty = neutral || history
    ? ''
    : formatRequirementQuantity(req.availableAmount, req.availableUnit, req.matchedKey ?? req.key, t);
  const requiredQty = formatRequirementQuantity(req.requiredAmount, req.requiredUnit, req.key, t);
  const requiresLine = requiredQty
    ? t('recipe.reqRequires', { value: requiredQty })
    : (neutral || history) && req.quantityText
      ? t('recipe.reqRequires', { value: req.quantityText })
      : null;

  let remainingLine: string | null = null;
  if (!neutral && !history && req.status === 'insufficient') {
    const rem = remainingRequirementAmount(req);
    if (rem) {
      const remainingQty = formatRequirementQuantity(rem.amount, rem.unit, req.matchedKey ?? req.key, t);
      if (remainingQty) remainingLine = t('recipe.reqRemaining', { value: remainingQty });
    }
  }

  let matchedWithLine: string | null = null;
  if (!neutral && req.matchedKey && req.matchedKey !== req.key) {
    const altKey = ingredientLabelKey(req.matchedKey);
    const altLabel = altKey ? t(altKey) : req.matchedKey;
    matchedWithLine = t('recipe.reqMatchedWith', { value: altLabel });
  }

  return {
    key: req.key,
    titleLabel,
    detectedLine: detectedQty ? t('recipe.reqDetected', { value: detectedQty }) : null,
    requiresLine,
    remainingLine,
    matchedWithLine,
    statusLine: t(requirementStatusKey(req.status, semantics)),
    status: req.status,
    essential: req.essential,
    neutral,
  };
}
