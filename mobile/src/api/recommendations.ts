// API calls for recipe recommendations (signed-in customers only).

import { getCustomerIdentityHeaders } from './customerIdentity';
import { apiUrl, handleResponse } from './http';
import { buildRecommendationsListPath, buildRecommendationDetailPath } from '../lib/recommendations';
import type {
  RecommendationDetailData,
  RecommendationDetailResponse,
  RecommendationListData,
  RecommendationListResponse,
} from '../types/recommendations';
import { getGlobalLanguage, translate } from '../i18n/translations';

// Get recipe recommendations for the signed-in customer.
export async function fetchRecipeRecommendations(
  limit?: number,
  language?: string,
): Promise<RecommendationListData> {
  const headers = await getCustomerIdentityHeaders();
  if (!headers['x-customer-id']) {
    throw new Error(translate('errors.signInRequired', getGlobalLanguage()));
  }
  const path = buildRecommendationsListPath(limit, language);
  const res = await fetch(apiUrl(path), { headers });
  const body = await handleResponse<RecommendationListResponse>(res);
  return body.data;
}

// Get one recipe recommendation by id.
export async function fetchRecipeRecommendationById(
  recipeId: string,
  language?: string,
): Promise<RecommendationDetailData> {
  const headers = await getCustomerIdentityHeaders();
  if (!headers['x-customer-id']) {
    throw new Error(translate('errors.signInRequired', getGlobalLanguage()));
  }
  const path = buildRecommendationDetailPath(recipeId, language);
  const res = await fetch(apiUrl(path), { headers });
  const body = await handleResponse<RecommendationDetailResponse>(res);
  return body.data;
}
