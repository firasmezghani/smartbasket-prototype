// Catalogue suggestions while typing a checklist item, ignoring late responses.

import type { ProductListInput } from '../types/shoppingList';
import type { CatalogQuery } from './catalogQuery';
import { isCurrentAccountScope, type AccountScope } from './accountScope';
import { safeTrim } from './catalogDisplay';

export const CHECKLIST_DRAFT_DEBOUNCE_MS = 350;
export const CHECKLIST_DRAFT_SUGGESTION_LIMIT = 5;

export type DraftSearchStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export function normalisedDraftQuery(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function shouldSearchChecklistDraft(value: unknown): boolean {
  return normalisedDraftQuery(value).length > 0;
}

// Same endpoint as Catalogue free-text search; small page for the compact list.
export function checklistDraftCatalogQuery(value: unknown): CatalogQuery | null {
  const search = normalisedDraftQuery(value);
  if (!search) return null;
  return { search, limit: CHECKLIST_DRAFT_SUGGESTION_LIMIT };
}

export function shouldShowDraftSuggestionPanel(opts: {
  draft: unknown;
  adding?: boolean;
}): boolean {
  if (opts.adding === true) return false;
  return shouldSearchChecklistDraft(opts.draft);
}

// Secondary action, never the first catalogue hit, and only while text is present.
export function shouldShowPersonalNoteAction(opts: { draft: unknown }): boolean {
  return shouldSearchChecklistDraft(opts.draft);
}

export type PersonalNoteActionMode = 'hidden' | 'quiet' | 'unmatched';

// Offer "Add as a note" as the main action only when nothing matched.
export function personalNoteActionMode(opts: {
  draft: unknown;
  adding?: boolean;
  suggestionStatus: DraftSearchStatus;
  genericCount: number;
}): PersonalNoteActionMode {
  if (opts.adding === true || !shouldSearchChecklistDraft(opts.draft)) return 'hidden';
  const genericCount = Number.isFinite(opts.genericCount) ? Math.max(0, opts.genericCount) : 0;
  if (opts.suggestionStatus === 'empty' && genericCount === 0) return 'unmatched';
  return 'quiet';
}

// What the suggestion panel shows (never results for an older search).
export function resolveDraftSuggestionView<T>(opts: {
  enabled: boolean;
  draft: unknown;
  debounced: unknown;
  status: DraftSearchStatus;
  products: readonly T[] | null | undefined;
}): { status: DraftSearchStatus; products: T[] } {
  if (!opts.enabled || !shouldSearchChecklistDraft(opts.draft)) {
    return { status: 'idle', products: [] };
  }
  const draftQuery = normalisedDraftQuery(opts.draft);
  const debouncedQuery = normalisedDraftQuery(opts.debounced);
  if (draftQuery !== debouncedQuery || opts.status === 'idle' || opts.status === 'loading') {
    return { status: 'loading', products: [] };
  }
  if (opts.status === 'error') return { status: 'error', products: [] };
  if (opts.status === 'empty') return { status: 'empty', products: [] };
  return {
    status: 'ready',
    products: Array.isArray(opts.products) ? [...opts.products] : [],
  };
}

// Compact second line: package/brand/category/price when the caller supplies them.
export function formatDraftSuggestionDetail(
  parts: readonly (string | null | undefined)[],
): string {
  return parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0)
    .join(' · ');
}

export function shouldAcceptDraftSearchResult(opts: {
  mounted: boolean;
  requestCurrent: boolean;
  started: AccountScope;
  current: AccountScope;
}): boolean {
  if (opts.mounted !== true) return false;
  if (opts.requestCurrent !== true) return false;
  return isCurrentAccountScope(opts.started, opts.current);
}

export function shouldCommitDraftListAdd(opts: {
  adding: boolean;
  started: AccountScope;
  current: AccountScope;
}): boolean {
  if (opts.adding === true) return false;
  return isCurrentAccountScope(opts.started, opts.current);
}

// Checklist entry from a tapped suggestion.
export function linkedInputFromCatalogueProduct(product: {
  id?: string | null;
  name?: string | null;
  sourceName?: string | null;
} | null | undefined): ProductListInput | null {
  const productId = typeof product?.id === 'string' ? product.id.trim() : '';
  const label = safeTrim(product?.name) || safeTrim(product?.sourceName);
  if (!productId || !label) return null;
  return { productId, label, quantity: 1 };
}

export function draftSearchStatusFromResult(opts: {
  error: boolean;
  products: readonly unknown[] | null | undefined;
}): DraftSearchStatus {
  if (opts.error === true) return 'error';
  const list = Array.isArray(opts.products) ? opts.products : [];
  return list.length > 0 ? 'ready' : 'empty';
}
