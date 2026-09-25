import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_RECOMMENDATION_LIMIT,
  MAX_RECOMMENDATION_LIMIT,
  RECOMMENDATIONS_LIST_PATH,
  validateRecommendationLimit,
  buildRecommendationsListPath,
  buildRecommendationDetailPath,
  recipeLanguageQuery,
  classifyRecommendationErrorStatus,
} from './recommendations';

test('DEFAULT/MAX_RECOMMENDATION_LIMIT match the server contract', () => {
  assert.equal(DEFAULT_RECOMMENDATION_LIMIT, 10);
  assert.equal(MAX_RECOMMENDATION_LIMIT, 20);
});

test('validateRecommendationLimit accepts positive integers and clamps above the max', () => {
  assert.equal(validateRecommendationLimit(1), 1);
  assert.equal(validateRecommendationLimit(10), 10);
  assert.equal(validateRecommendationLimit(20), 20);
  assert.equal(validateRecommendationLimit(99), 20);
});

test('validateRecommendationLimit rejects anything that is not a positive integer', () => {
  for (const bad of [0, -1, 1.5, NaN, Infinity, -Infinity]) {
    assert.throws(() => validateRecommendationLimit(bad), RangeError);
  }
});

test('buildRecommendationsListPath omits the query string when no limit is given', () => {
  assert.equal(buildRecommendationsListPath(), RECOMMENDATIONS_LIST_PATH);
  assert.equal(buildRecommendationsListPath(undefined), RECOMMENDATIONS_LIST_PATH);
});

test('buildRecommendationsListPath appends a validated limit', () => {
  assert.equal(buildRecommendationsListPath(5), `${RECOMMENDATIONS_LIST_PATH}?limit=5`);
  assert.equal(buildRecommendationsListPath(20), `${RECOMMENDATIONS_LIST_PATH}?limit=20`);
});

test('buildRecommendationsListPath clamps an over-max limit like the server does', () => {
  assert.equal(buildRecommendationsListPath(99), `${RECOMMENDATIONS_LIST_PATH}?limit=20`);
});

test('buildRecommendationsListPath rejects an invalid limit before building a URL', () => {
  assert.throws(() => buildRecommendationsListPath(0), RangeError);
  assert.throws(() => buildRecommendationsListPath(-3), RangeError);
  assert.throws(() => buildRecommendationsListPath(1.5), RangeError);
});

test('buildRecommendationDetailPath builds the expected path and trims whitespace', () => {
  assert.equal(
    buildRecommendationDetailPath('tomato-pantry-pasta'),
    `${RECOMMENDATIONS_LIST_PATH}/tomato-pantry-pasta`,
  );
  assert.equal(buildRecommendationDetailPath(' spaced-id '), `${RECOMMENDATIONS_LIST_PATH}/spaced-id`);
});

test('buildRecommendationDetailPath percent-encodes unsafe characters', () => {
  assert.equal(buildRecommendationDetailPath('a/b'), `${RECOMMENDATIONS_LIST_PATH}/a%2Fb`);
  assert.equal(buildRecommendationDetailPath('a b?c=1'), `${RECOMMENDATIONS_LIST_PATH}/a%20b%3Fc%3D1`);
  assert.equal(buildRecommendationDetailPath('../secret'), `${RECOMMENDATIONS_LIST_PATH}/..%2Fsecret`);
});

test('buildRecommendationDetailPath rejects a blank recipe id', () => {
  assert.throws(() => buildRecommendationDetailPath(''));
  assert.throws(() => buildRecommendationDetailPath('   '));
});

test('recipeLanguageQuery only appends for fr; en / anything else is empty', () => {
  assert.equal(recipeLanguageQuery('fr'), '?language=fr');
  assert.equal(recipeLanguageQuery('fr', true), '&language=fr');
  for (const other of ['en', undefined, '', 'EN', 'de', 'fr-CA']) {
    assert.equal(recipeLanguageQuery(other), '');
    assert.equal(recipeLanguageQuery(other, true), '');
  }
});

test('buildRecommendationsListPath adds ?language=fr only for French, alongside any limit', () => {
  assert.equal(buildRecommendationsListPath(undefined, 'fr'), `${RECOMMENDATIONS_LIST_PATH}?language=fr`);
  assert.equal(buildRecommendationsListPath(undefined, 'en'), RECOMMENDATIONS_LIST_PATH);
  assert.equal(buildRecommendationsListPath(5, 'fr'), `${RECOMMENDATIONS_LIST_PATH}?limit=5&language=fr`);
  assert.equal(buildRecommendationsListPath(5, 'en'), `${RECOMMENDATIONS_LIST_PATH}?limit=5`);
  assert.equal(buildRecommendationsListPath(99, 'fr'), `${RECOMMENDATIONS_LIST_PATH}?limit=20&language=fr`);
});

test('buildRecommendationDetailPath adds ?language=fr only for French', () => {
  assert.equal(
    buildRecommendationDetailPath('classic-omelette', 'fr'),
    `${RECOMMENDATIONS_LIST_PATH}/classic-omelette?language=fr`,
  );
  assert.equal(
    buildRecommendationDetailPath('classic-omelette', 'en'),
    `${RECOMMENDATIONS_LIST_PATH}/classic-omelette`,
  );
  assert.equal(
    buildRecommendationDetailPath('classic-omelette'),
    `${RECOMMENDATIONS_LIST_PATH}/classic-omelette`,
  );
});

test('classifyRecommendationErrorStatus maps every known HTTP status', () => {
  assert.equal(classifyRecommendationErrorStatus(401), 'auth');
  assert.equal(classifyRecommendationErrorStatus(404), 'notFound');
  assert.equal(classifyRecommendationErrorStatus(429), 'rateLimited');
  assert.equal(classifyRecommendationErrorStatus(503), 'unavailable');
  assert.equal(classifyRecommendationErrorStatus(400), 'validation');
});

test('classifyRecommendationErrorStatus falls back to unknown for anything else', () => {
  assert.equal(classifyRecommendationErrorStatus(500), 'unknown');
  assert.equal(classifyRecommendationErrorStatus(undefined), 'unknown');
  assert.equal(classifyRecommendationErrorStatus(0), 'unknown');
});
