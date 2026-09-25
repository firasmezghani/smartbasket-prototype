export type CatalogDisplayCategory =
  | 'food'
  | 'drinks'
  | 'household'
  | 'personal-care'
  | 'other';

// The five canonical application display-category slugs (service-layer concept).
export const CATALOG_DISPLAY_CATEGORIES: readonly CatalogDisplayCategory[] = [
  'food',
  'drinks',
  'household',
  'personal-care',
  'other',
];

export type CatalogIntelligenceType = 'recipe' | 'replenishment' | 'none';

export type Product = {
  id: string;
  code?: string | null;
  // Effective display name: metadata DisplayName when set, else the imported name.
  name?: string | null;
  // Raw imported name, before any metadata DisplayName override.
  sourceName?: string | null;
  brand?: string | null;
  familyCode?: string | null;
  familyName?: string | null;
  subFamilyCode?: string | null;
  subFamilyName?: string | null;
  description?: string | null;
  sitePrice?: number | null;
  salePrice?: number | null;
  oldPrice?: number | null;
  priceDisplayMode?: string | null;
  hasPromo?: boolean;
  promoImageUrl?: string | null;
  remoteImageUrl?: string | null;
  cardRemoteImageUrl?: string | null;
  hasImageBinary?: boolean;
  imageEndpoint?: string | null;
  imageUrl?: string | null;

  // Product metadata fields (optional; defaults are used when missing).
  // True when a metadata row exists and the product is not hidden.
  isCurated?: boolean;
  // One of the five canonical slugs, or null when uncategorised.
  displayCategory?: CatalogDisplayCategory | null;
  displaySubcategory?: string | null;
  isFeatured?: boolean;
  intelligenceType?: CatalogIntelligenceType;
  isRecipeEligible?: boolean;
  isReplenishmentEligible?: boolean;
  expectedRepurchaseDays?: number | null;
  sortOrder?: number;
  // Resolved public URL for an application-managed image asset, or null.
  metadataImageUrl?: string | null;
  // Shopping type from the curated metadata, or null.
  canonicalType?: string | null;
  classificationStatus?: 'typed' | 'excluded' | 'unknown' | 'non_food';
  packageAmount?: number | null;
  packageUnit?: string | null;
};

export type CatalogSectionKey = 'featured' | CatalogDisplayCategory;

export type CatalogSection = {
  key: CatalogSectionKey;
  // Translation key resolved on the client; the API never sends translated text.
  titleKey: string;
  count: number;
};

export type Family = {
  codFam: string;
  desFamille: string;
};

export type CatalogPagination = {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
};
