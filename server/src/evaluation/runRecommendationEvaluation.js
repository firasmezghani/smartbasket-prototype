import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluationToCsv,
  evaluationToMarkdown,
  runRecommendationEvaluation,
} from './recommendationEvaluation.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const outputDir = join(moduleDir, '../../../docs/evaluation');
const evaluation = runRecommendationEvaluation();

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'recommendation-evaluation-results.json'), `${JSON.stringify(evaluation, null, 2)}\n`);
writeFileSync(join(outputDir, 'recommendation-evaluation-results.csv'), evaluationToCsv(evaluation));
writeFileSync(join(outputDir, 'RECOMMENDATION_EVALUATION_REPORT.md'), evaluationToMarkdown(evaluation));

const failed = evaluation.summary.guardrails.checksPassed !== evaluation.summary.guardrails.checksTotal;
console.log(JSON.stringify({
  outputDir,
  retrievalScenarios: evaluation.retrievalScenarioCount,
  systemHitAt3: evaluation.summary.system.hitRateAt3,
  baselineHitAt3: evaluation.summary.baseline.hitRateAt3,
  guardrails: `${evaluation.summary.guardrails.checksPassed}/${evaluation.summary.guardrails.checksTotal}`,
}, null, 2));

if (failed) process.exitCode = 1;

