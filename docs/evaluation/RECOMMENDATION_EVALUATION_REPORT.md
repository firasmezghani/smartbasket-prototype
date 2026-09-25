# Offline recipe recommendation evaluation

## Outcome

The production deterministic recommender was compared with the fixed authored baseline on **10 authored retrieval scenarios**. It achieved Hit@3 **100%** versus **50%** for the baseline (delta 50%), and MRR **1.0000** versus **0.3994**. Guardrail checks passed **32/32**.

## Aggregate results

| Metric | Production recommender | Popularity baseline | Delta |
|---|---:|---:|---:|
| Hit rate @ 1 | 100% | 20% | 80% |
| Hit rate @ 3 | 100% | 50% | 50% |
| Hit rate @ 5 | 100% | 70% | 30% |
| Mean reciprocal rank | 1.0000 | 0.3994 | 0.6006 |
| Mean essential coverage @ 3 | 68.3% | 40% | 28.3% |
| Mean missing essentials @ 3 | 0.9333 | 1.6333 | -0.7000 |

## Scenario results

| Scenario | Relevant recipe | System rank | Baseline rank | Evidence | Checks |
|---|---|---:|---:|---|---:|
| basket-omelette-six-eggs-olive-oil | classic-omelette | 1 | 1 | basket | 6/6 |
| basket-tomato-pantry-pasta | tomato-pantry-pasta | 1 | 3 | basket | 1/1 |
| basket-mushroom-pea-rice | mushroom-pea-rice | 1 | 6 | basket | 1/1 |
| basket-chickpea-tomato-stew | chickpea-tomato-stew | 1 | 5 | basket | 1/1 |
| basket-fluffy-pancakes | fluffy-pancakes | 1 | 2 | basket | 2/2 |
| basket-peanut-butter-pancakes | peanut-butter-pancakes | 1 | 10 | basket | 2/2 |
| basket-rice-pudding | rice-pudding | 1 | 9 | basket | 1/1 |
| basket-tuna-pasta-salad-sufficient | tuna-pasta-salad | 1 | 4 | basket | 4/4 |
| history-only-pasta | tomato-pantry-pasta | 1 | 3 | history | 1/1 |
| basket-priority-over-history | classic-omelette | 1 | 1 | basket | 1/1 |
| guardrail-insufficient-eggs | guardrail | — | — | basket | 4/4 |
| guardrail-insufficient-tuna | guardrail | — | — | basket | 4/4 |
| guardrail-non-food-egg-language | guardrail | — | — | popularity | 2/2 |
| guardrail-cold-start | guardrail | — | — | popularity | 2/2 |

## Interpretation and limits

- Relevance labels are explicit synthetic scenario judgements. They test whether the right recipe is retrieved for known evidence; they do **not** prove that a real customer prefers that recipe.
- The fixed authored baseline is intentionally evidence-blind and is not estimated from observed popularity.
- Coverage metrics reuse the production requirement evaluator so both rankings are compared against the same evidence interpretation.
- The scenario set is small and curated. It is a regression benchmark for the thesis prototype, not a population-level recommender study.
- No imported catalogue table, customer record, database, external dataset, AI model, or network service is used or modified.

## Reproducibility

Run `npm run evaluate:recommendations` from `server/`. The runner regenerates this report plus the JSON and CSV artifacts from the versioned scenarios and shipped recipe/mapping data. The output contains no clock-derived value, so identical code and data produce identical files.

## Guardrail status

All scenario checks passed.
