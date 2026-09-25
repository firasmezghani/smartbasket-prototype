# Recipe recommendations

The app ranks **10 authored recipes** (`server/src/data/recipes/recipes.json`).
French titles and ingredient labels come from `recipes.fr.json`. There is no
machine translation and no external recipe service. Mapping rules are in
`ingredientMappings.json`.

## Evidence

One source is used per request, in this order:

1. The current basket, if at least one product maps to an ingredient key.
2. Otherwise, cashier-validated purchase history.
3. Otherwise, the authored `fallbackRank` order. That result is not personalised.

Rejected, expired, cancelled, and still-active sessions are not history evidence.

## Score

Implemented in `server/src/services/recipe/score.js`. Essential coverage has
weight 1 and optional coverage has weight 0.1. Ranking then prefers higher
essential coverage, then the weighted score, then fewer missing essentials.
When both recipes are complete, the more specific match wins, then a lower
`fallbackRank`, then recipe id. The same inputs always produce the same order.
`fallbackRank` is not part of the score.

Missing ingredients can link to at most one catalogue product when the match
is reliable enough to add to the shopping list.

Explanations are built from matched and missing ingredients, coverage, and the
evidence source. The mobile screens do not show raw scores.

## Limits

The dataset is synthetic project data. Catalogue rows stay read-only. The
recommender does not write to the database. Offline comparison with the
popularity order is `npm run evaluate:recommendations` from `server/`. It uses
labelled scenarios, not real customer preferences.
