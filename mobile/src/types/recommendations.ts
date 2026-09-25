// Types for the recipe recommendation API responses.

// Confidence label given by the ingredient mapper (rule based, not a probability).
export type MappingConfidence = 'exact' | 'high' | 'medium' | 'low' | 'none';

// Confidence levels allowed for a "buy this product" suggestion.
export type LinkableMappingConfidence = 'exact' | 'high' | 'medium';

// Which mapping rule produced a match. Matches server `MATCH_RULES`.
export type IngredientMatchRule =
  | 'exact_phrase'
  | 'synonym_phrase'
  | 'name_token'
  | 'family_evidence'
  | 'description_evidence'
  | 'none';

// Which evidence tier produced a recommendation. Matches server `EVIDENCE_SOURCES`.
export type RecommendationEvidenceSource = 'basket' | 'history' | 'popularity';

// Where the recommendation evidence came from (basket, history or popularity).
export type AvailabilitySemantics =
  | 'current_availability'
  | 'previous_purchase_association'
  | 'popularity_fallback';

// Recipe difficulty, matching the dataset validator's allowed values.
export type RecipeDifficulty = 'easy' | 'medium' | 'hard';

// One matched or missing ingredient, as described for display.
export type RecipeIngredientInfo = {
  key: string;
  label: string;
  essential: boolean;
  quantityText: string | null;
};

// Requirement status: sufficient, insufficient, quantity_unknown, matched,
// missing, or not_evaluated (no basket evidence).
export type RequirementStatus =
  | 'sufficient'
  | 'insufficient'
  | 'quantity_unknown'
  | 'matched'
  | 'missing'
  | 'not_evaluated';

// Units a structured requirement / availability may use.
export type RequirementUnit = 'piece' | 'g' | 'ml';

// One structured recipe requirement (server card `requirements[]`).
export type RecipeRequirement = {
  // Primary ingredient key of the requirement group.
  key: string;
  // Human label (fallback when `labelKey` is absent).
  label: string;
  // Optional translation key for a requirement-group label.
  labelKey: string | null;
  essential: boolean;
  // Accepted alternative ingredient keys, in fixed order.
  anyOfKeys: string[];
  // The accepted alternative that matched, if any.
  matchedKey: string | null;
  // Structured requirement (only when reliably comparable).
  requiredAmount: number | null;
  requiredUnit: RequirementUnit | null;
  // Known available quantity for the matched alternative (current basket only).
  availableAmount: number | null;
  availableUnit: RequirementUnit | null;
  // Free-text display quantity from the recipe (never parsed).
  quantityText: string | null;
  status: RequirementStatus;
  // Short machine-readable reason (e.g. `known_quantity_meets_requirement`, `no_evidence`).
  reasonCode: string;
};

// One product-evidence item that mapped to an ingredient key (`evidence.mappedEvidence[]`).
export type MappedEvidenceItem = {
  ingredientKey: string;
  productId: string | null;
  confidence: MappingConfidence;
  matchedRule: IngredientMatchRule;
};

// Structured evidence statistics returned alongside every recommendation result.
export type RecommendationEvidenceStats = {
  mappedIngredientKeys: string[];
  mappedProductCount: number;
  uniqueIngredientCount: number;
  ignoredAmbiguousCount: number;
  ignoredUnresolvedCount: number;
  consideredProductCount: number;
  mappedEvidence: MappedEvidenceItem[];
};

// A missing requirement the server linked to one preferred catalogue product.
export type MissingLinkedProduct = {
  // The alternative key the product actually maps to.
  ingredientKey: string;
  // Primary key of the requirement this suggestion satisfies.
  requirementKey?: string;
  label: string;
  labelKey?: string | null;
  essential: boolean;
  // True when this product satisfies the whole (possibly alternative) requirement.
  satisfiesRequirement?: boolean;
  productId: string | null;
  productName: string;
  confidence: LinkableMappingConfidence;
  matchedRule: IngredientMatchRule;
};

// One recommended recipe with its full explanation (`recommendations[]` / `recommendation`).
export type RecipeRecommendationCard = {
  recipeId: string;
  name: string;
  description: string;
  cuisine: string | null;
  category: string | null;
  prepTimeMinutes: number | null;
  difficulty: RecipeDifficulty | null;
  fallbackRank: number;
  rank: number;
  score: number;
  coveragePercent: number;
  essentialCoverage: number;
  optionalCoverage: number;
  matchedEssentialCount: number;
  missingEssentialCount: number;
  matchedOptionalCount: number;
  missingOptionalCount: number;
  totalEssential: number;
  totalOptional: number;
  matchedIngredients: RecipeIngredientInfo[];
  missingIngredients: RecipeIngredientInfo[];
  missingEssential: RecipeIngredientInfo[];
  missingOptional: RecipeIngredientInfo[];
  // Evaluation of each recipe requirement (empty for popularity results).
  requirements: RecipeRequirement[];
  personalised: boolean;
  evidenceSource: RecommendationEvidenceSource;
  availabilitySemantics: AvailabilitySemantics;
  // Backward-compatible English prose, not used for principal UI content.
  explanationText: string;
  dataLimitationText: string;
  missingLinkedProducts: MissingLinkedProduct[];
};

// Payload of `data` for `GET /api/recommendations/recipes`.
export type RecommendationListData = {
  evidenceSource: RecommendationEvidenceSource;
  personalised: boolean;
  availabilitySemantics: AvailabilitySemantics;
  evidence: RecommendationEvidenceStats;
  recommendations: RecipeRecommendationCard[];
};

// Languages the recipe API serves (server `SUPPORTED_RECIPE_LANGUAGES`).
export type RecipeLanguage = 'en' | 'fr';

// Response of GET /api/recommendations/recipes (text in the requested language).
export type RecommendationListResponse = {
  data: RecommendationListData;
  meta: { limit: number; language: RecipeLanguage };
};

// Payload of `data` for `GET /api/recommendations/recipes/:recipeId`.
export type RecommendationDetailData = {
  evidenceSource: RecommendationEvidenceSource;
  personalised: boolean;
  availabilitySemantics: AvailabilitySemantics;
  evidence: RecommendationEvidenceStats;
  recommendation: RecipeRecommendationCard;
};

// Full response body of `GET /api/recommendations/recipes/:recipeId`.
export type RecommendationDetailResponse = {
  data: RecommendationDetailData;
  meta: { language: RecipeLanguage };
};
