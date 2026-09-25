import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluationToCsv,
  evaluationToMarkdown,
  runRecommendationEvaluation,
} from './recommendationEvaluation.js';

test('offline evaluation is deterministic and all scenario checks pass', () => {
  const first = runRecommendationEvaluation();
  const second = runRecommendationEvaluation();
  assert.deepEqual(first, second);
  assert.equal(first.generatedAt, 'deterministic-no-clock');
  assert.equal(first.scenarioCount, 14);
  assert.equal(first.retrievalScenarioCount, 10);
  assert.equal(first.summary.guardrails.checksPassed, first.summary.guardrails.checksTotal);
  assert.ok(first.scenarios.every((scenario) => scenario.passed));
});

test('production recommender beats the popularity baseline on the authored retrieval benchmark', () => {
  const result = runRecommendationEvaluation();
  assert.ok(result.summary.system.hitRateAt3 > result.summary.baseline.hitRateAt3);
  assert.ok(result.summary.system.meanReciprocalRank > result.summary.baseline.meanReciprocalRank);
  assert.ok(result.summary.system.meanEssentialCoverageAt3 > result.summary.baseline.meanEssentialCoverageAt3);
  assert.ok(result.summary.system.meanMissingEssentialAt3 < result.summary.baseline.meanMissingEssentialAt3);
});

test('machine-readable and thesis-ready serializers include the declared scope', () => {
  const result = runRecommendationEvaluation();
  const csv = evaluationToCsv(result);
  const markdown = evaluationToMarkdown(result);
  assert.match(csv, /^scenario_id,description,/);
  assert.equal(csv.trim().split('\n').length, result.scenarioCount + 1);
  assert.match(markdown, /do \*\*not\*\* prove that a real customer prefers/i);
  assert.match(markdown, /npm run evaluate:recommendations/);
});

