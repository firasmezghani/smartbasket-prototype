import { loadRecipeDataset } from '../services/recipe/recipeDataset.js';
import { createIngredientMapper } from '../services/recipe/ingredientMapping.service.js';
import {
  buildEffectiveInterpretProduct,
  buildEffectiveMapProduct,
} from '../services/recipe/recommendation.api.service.js';
import { recommendRecipes } from '../services/recipe/recommendation.service.js';
import { popularityFallbackOrder } from '../services/recipe/score.js';
import {
  RECOMMENDATION_EVALUATION_SCENARIOS,
  RECOMMENDATION_EVALUATION_SCENARIO_VERSION,
} from './recommendationEvaluation.scenarios.js';

export const RECOMMENDATION_EVALUATION_VERSION = 2;
export const EVALUATION_K_VALUES = Object.freeze([1, 3, 5]);

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildOverrides(raw = {}) {
  return new Map(Object.entries(raw).map(([id, override]) => [id.toLowerCase(), override]));
}

function rankingMetrics(rankedIds, relevantIds, kValues) {
  const relevant = new Set(relevantIds);
  const firstIndex = rankedIds.findIndex((id) => relevant.has(id));
  const metrics = {
    firstRelevantRank: firstIndex === -1 ? null : firstIndex + 1,
    reciprocalRank: firstIndex === -1 ? 0 : 1 / (firstIndex + 1),
  };
  for (const k of kValues) {
    const hits = rankedIds.slice(0, k).filter((id) => relevant.has(id)).length;
    metrics[`hitAt${k}`] = hits > 0 ? 1 : 0;
    metrics[`precisionAt${k}`] = hits / k;
    metrics[`recallAt${k}`] = relevant.size === 0 ? null : hits / relevant.size;
  }
  return metrics;
}

function fitMetrics(rankedIds, cardsById, kValues) {
  const out = {};
  for (const k of kValues) {
    const cards = rankedIds.slice(0, k).map((id) => cardsById.get(id)).filter(Boolean);
    const evaluated = cards.filter((card) => card.evidenceSource !== 'popularity');
    out[`meanEssentialCoverageAt${k}`] = round(mean(evaluated.map((card) => card.essentialCoverage)));
    out[`meanMissingEssentialAt${k}`] = round(mean(evaluated.map((card) => card.missingEssentialCount)));
  }
  return out;
}

function evaluateChecks(scenario, result) {
  const checks = [];
  const add = (name, passed, expected, actual) => checks.push({ name, passed, expected, actual });

  add('evidence source', result.evidenceSource === scenario.expectedEvidenceSource, scenario.expectedEvidenceSource, result.evidenceSource);
  if (scenario.expectedFirstRecipeId) {
    const actual = result.recommendations[0]?.recipeId ?? null;
    add('first recipe', actual === scenario.expectedFirstRecipeId, scenario.expectedFirstRecipeId, actual);
  }
  if (scenario.expectedMappedIngredientKeys) {
    const actual = result.evidence.mappedIngredientKeys ?? [];
    add('mapped ingredient keys', JSON.stringify(actual) === JSON.stringify(scenario.expectedMappedIngredientKeys), scenario.expectedMappedIngredientKeys, actual);
  }

  for (const expected of scenario.checks ?? []) {
    const card = result.recommendations.find((item) => item.recipeId === expected.recipeId);
    const requirement = card?.requirements?.find((item) => item.key === expected.requirementKey);
    const prefix = `${expected.recipeId}/${expected.requirementKey}`;
    const allowed = expected.statuses ?? [];
    add(`${prefix} status`, allowed.includes(requirement?.status), allowed, requirement?.status ?? null);
    for (const field of ['availableAmount', 'availableUnit', 'matchedKey']) {
      if (!(field in expected)) continue;
      add(`${prefix} ${field}`, requirement?.[field] === expected[field], expected[field], requirement?.[field] ?? null);
    }
  }
  return checks;
}

function evaluateScenario({ scenario, recipes, rawMapProduct, kValues }) {
  const overridesByProductId = buildOverrides(scenario.overridesByProductId);
  const mapProduct = buildEffectiveMapProduct({ mapProduct: rawMapProduct, overridesByProductId });
  const interpretProduct = buildEffectiveInterpretProduct({ mapProduct: rawMapProduct, overridesByProductId });
  const result = recommendRecipes({
    recipes,
    mapProduct,
    interpretProduct,
    basketProducts: scenario.basketProducts,
    historyProducts: scenario.historyProducts,
    catalogueProducts: [],
    unrestrictedLimit: true,
  });

  const systemRanking = result.recommendations.map((item) => item.recipeId);
  const baselineRanking = popularityFallbackOrder(recipes).map((item) => item.recipeId);
  const cardsById = new Map(result.recommendations.map((item) => [item.recipeId, item]));
  const relevantRecipeIds = scenario.relevantRecipeIds ?? [];
  const checks = evaluateChecks(scenario, result);

  return {
    id: scenario.id,
    description: scenario.description,
    retrievalMetricEligible: scenario.includeInRetrievalMetrics !== false && relevantRecipeIds.length > 0,
    relevantRecipeIds,
    evidenceSource: result.evidenceSource,
    mappedIngredientKeys: result.evidence.mappedIngredientKeys ?? [],
    systemTop5: systemRanking.slice(0, 5),
    baselineTop5: baselineRanking.slice(0, 5),
    system: {
      ...rankingMetrics(systemRanking, relevantRecipeIds, kValues),
      ...fitMetrics(systemRanking, cardsById, kValues),
    },
    baseline: {
      ...rankingMetrics(baselineRanking, relevantRecipeIds, kValues),
      ...fitMetrics(baselineRanking, cardsById, kValues),
    },
    checks,
    checksPassed: checks.filter((check) => check.passed).length,
    checksTotal: checks.length,
    passed: checks.every((check) => check.passed),
  };
}

function aggregateRanker(scenarios, key, kValues) {
  const out = {
    evaluatedScenarios: scenarios.length,
    meanReciprocalRank: round(mean(scenarios.map((scenario) => scenario[key].reciprocalRank))),
  };
  for (const k of kValues) {
    out[`hitRateAt${k}`] = round(mean(scenarios.map((scenario) => scenario[key][`hitAt${k}`])));
    out[`meanPrecisionAt${k}`] = round(mean(scenarios.map((scenario) => scenario[key][`precisionAt${k}`])));
    out[`meanRecallAt${k}`] = round(mean(scenarios.map((scenario) => scenario[key][`recallAt${k}`])));
    out[`meanEssentialCoverageAt${k}`] = round(mean(scenarios.map((scenario) => scenario[key][`meanEssentialCoverageAt${k}`]).filter((value) => value != null)));
    out[`meanMissingEssentialAt${k}`] = round(mean(scenarios.map((scenario) => scenario[key][`meanMissingEssentialAt${k}`]).filter((value) => value != null)));
  }
  return out;
}

export function runRecommendationEvaluation(options = {}) {
  const recipes = options.recipes ?? loadRecipeDataset();
  const scenarios = options.scenarios ?? RECOMMENDATION_EVALUATION_SCENARIOS;
  const rawMapProduct = options.mapProduct ?? createIngredientMapper();
  const kValues = options.kValues ?? EVALUATION_K_VALUES;
  const results = scenarios.map((scenario) => evaluateScenario({ scenario, recipes, rawMapProduct, kValues }));
  const retrievalScenarios = results.filter((scenario) => scenario.retrievalMetricEligible);
  const system = aggregateRanker(retrievalScenarios, 'system', kValues);
  const baseline = aggregateRanker(retrievalScenarios, 'baseline', kValues);
  const deltas = {};
  for (const metric of Object.keys(system)) {
    if (metric === 'evaluatedScenarios' || system[metric] == null || baseline[metric] == null) continue;
    deltas[metric] = round(system[metric] - baseline[metric]);
  }
  const checksTotal = results.reduce((sum, scenario) => sum + scenario.checksTotal, 0);
  const checksPassed = results.reduce((sum, scenario) => sum + scenario.checksPassed, 0);

  return {
    evaluationVersion: RECOMMENDATION_EVALUATION_VERSION,
    scenarioVersion: RECOMMENDATION_EVALUATION_SCENARIO_VERSION,
    generatedAt: 'deterministic-no-clock',
    recipeCount: recipes.length,
    scenarioCount: results.length,
    retrievalScenarioCount: retrievalScenarios.length,
    kValues,
    method: {
      system: 'Production deterministic requirement-aware recommender with reliability gate and contextual exclusions; no database or network access.',
      baseline: 'Fixed authored fallbackRank ascending (not measured popularity), independent of basket/history evidence.',
      relevance: 'Versioned, manually authored recipe IDs for synthetic scenarios. These labels measure scenario suitability, not real customer preference.',
      fitMetrics: 'Coverage and missing-essential values are computed once by the production requirement evaluator, then summarized over each ranker ordering.',
      exclusions: 'Guardrail and cold-start scenarios are reported separately and excluded from retrieval averages.',
    },
    summary: {
      system,
      baseline,
      deltas,
      guardrails: {
        checksPassed,
        checksTotal,
        passRate: checksTotal === 0 ? null : round(checksPassed / checksTotal),
        scenariosPassed: results.filter((scenario) => scenario.passed).length,
        scenariosTotal: results.length,
      },
    },
    scenarios: results,
  };
}

function csvCell(value) {
  const string = value == null ? '' : Array.isArray(value) ? value.join('|') : String(value);
  return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

export function evaluationToCsv(evaluation) {
  const headers = [
    'scenario_id', 'description', 'retrieval_metric_eligible', 'relevant_recipe_ids', 'evidence_source',
    'mapped_ingredient_keys', 'system_top_5', 'baseline_top_5', 'system_first_relevant_rank',
    'baseline_first_relevant_rank', 'system_hit_at_3', 'baseline_hit_at_3', 'system_hit_at_5',
    'baseline_hit_at_5', 'system_mrr', 'baseline_mrr', 'checks_passed', 'checks_total', 'scenario_passed',
  ];
  const rows = evaluation.scenarios.map((scenario) => [
    scenario.id, scenario.description, scenario.retrievalMetricEligible, scenario.relevantRecipeIds,
    scenario.evidenceSource, scenario.mappedIngredientKeys, scenario.systemTop5, scenario.baselineTop5,
    scenario.system.firstRelevantRank, scenario.baseline.firstRelevantRank, scenario.system.hitAt3,
    scenario.baseline.hitAt3, scenario.system.hitAt5, scenario.baseline.hitAt5,
    round(scenario.system.reciprocalRank), round(scenario.baseline.reciprocalRank), scenario.checksPassed,
    scenario.checksTotal, scenario.passed,
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

function pct(value) {
  return value == null ? 'n/a' : `${round(value * 100, 1)}%`;
}

function dec(value, digits = 4) {
  return value == null ? 'n/a' : Number(value).toFixed(digits);
}

export function evaluationToMarkdown(evaluation) {
  const { system, baseline, deltas, guardrails } = evaluation.summary;
  const failures = evaluation.scenarios.filter((scenario) => !scenario.passed);
  return `# Offline recipe recommendation evaluation\n\n` +
    `## Outcome\n\n` +
    `The production deterministic recommender was compared with the fixed authored baseline on **${evaluation.retrievalScenarioCount} authored retrieval scenarios**. ` +
    `It achieved Hit@3 **${pct(system.hitRateAt3)}** versus **${pct(baseline.hitRateAt3)}** for the baseline (delta ${pct(deltas.hitRateAt3)}), and MRR **${dec(system.meanReciprocalRank)}** versus **${dec(baseline.meanReciprocalRank)}**. ` +
    `Guardrail checks passed **${guardrails.checksPassed}/${guardrails.checksTotal}**.\n\n` +
    `## Aggregate results\n\n` +
    `| Metric | Production recommender | Popularity baseline | Delta |\n|---|---:|---:|---:|\n` +
    `| Hit rate @ 1 | ${pct(system.hitRateAt1)} | ${pct(baseline.hitRateAt1)} | ${pct(deltas.hitRateAt1)} |\n` +
    `| Hit rate @ 3 | ${pct(system.hitRateAt3)} | ${pct(baseline.hitRateAt3)} | ${pct(deltas.hitRateAt3)} |\n` +
    `| Hit rate @ 5 | ${pct(system.hitRateAt5)} | ${pct(baseline.hitRateAt5)} | ${pct(deltas.hitRateAt5)} |\n` +
    `| Mean reciprocal rank | ${dec(system.meanReciprocalRank)} | ${dec(baseline.meanReciprocalRank)} | ${dec(deltas.meanReciprocalRank)} |\n` +
    `| Mean essential coverage @ 3 | ${pct(system.meanEssentialCoverageAt3)} | ${pct(baseline.meanEssentialCoverageAt3)} | ${pct(deltas.meanEssentialCoverageAt3)} |\n` +
    `| Mean missing essentials @ 3 | ${dec(system.meanMissingEssentialAt3)} | ${dec(baseline.meanMissingEssentialAt3)} | ${dec(deltas.meanMissingEssentialAt3)} |\n\n` +
    `## Scenario results\n\n` +
    `| Scenario | Relevant recipe | System rank | Baseline rank | Evidence | Checks |\n|---|---|---:|---:|---|---:|\n` +
    evaluation.scenarios.map((scenario) =>
      `| ${scenario.id} | ${scenario.relevantRecipeIds.join(', ') || 'guardrail'} | ${scenario.system.firstRelevantRank ?? '—'} | ${scenario.baseline.firstRelevantRank ?? '—'} | ${scenario.evidenceSource} | ${scenario.checksPassed}/${scenario.checksTotal} |`,
    ).join('\n') +
    `\n\n## Interpretation and limits\n\n` +
    `- Relevance labels are explicit synthetic scenario judgements. They test whether the right recipe is retrieved for known evidence; they do **not** prove that a real customer prefers that recipe.\n` +
    `- The fixed authored baseline is intentionally evidence-blind and is not estimated from observed popularity.\n` +
    `- Coverage metrics reuse the production requirement evaluator so both rankings are compared against the same evidence interpretation.\n` +
    `- The scenario set is small and curated. It is a regression benchmark for the thesis prototype, not a population-level recommender study.\n` +
    `- No imported catalogue table, customer record, database, external dataset, AI model, or network service is used or modified.\n\n` +
    `## Reproducibility\n\n` +
    `Run \`npm run evaluate:recommendations\` from \`server/\`. The runner regenerates this report plus the JSON and CSV artifacts from the versioned scenarios and shipped recipe/mapping data. The output contains no clock-derived value, so identical code and data produce identical files.\n\n` +
    `## Guardrail status\n\n` +
    (failures.length === 0
      ? `All scenario checks passed.\n`
      : `Failures: ${failures.map((scenario) => scenario.id).join(', ')}. Inspect the JSON artifact for expected/actual values.\n`);
}

