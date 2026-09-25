# SmartBasket synthetic recipe dataset — licence and attribution

## Summary

The file `recipes.json` in this directory is a **synthetic dataset created
specifically for the SmartBasket BSc dissertation prototype**. The recipe
dataset was created specifically for this prototype as synthetic project data
and reviewed by the project author. It was not copied from external recipe
websites or commercial datasets.

It is released into the public domain under the
[Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
public-domain dedication. You may use, copy, modify and redistribute it for the
development, testing, evaluation and academic demonstration of this prototype
and its dissertation, with or without attribution.

## What this dataset is not

- It is **not** copied, scraped or adapted from any recipe website, cookbook,
  app or third-party dataset.
- It contains **no** cooking instructions, photographs, brand names or
  copyrighted descriptions.
- It is **not** nutritional, dietary, medical or food-safety guidance. Recipes
  and ingredient quantities are illustrative only.
- It does **not** represent the catalogue, product range or data of the company
  that provided authorised read-only catalogue access to the prototype.

## Relationship to the company catalogue

Recipe ingredients are expressed as **normalised ingredient keys** (for example
`tomato`, `olive_oil`, `canned_tuna`). These keys are generic food concepts.
Mapping them to specific catalogue products is a separate, later layer and is
not part of this dataset. This dataset is stored entirely inside the
repository and is never written to any database table.

## Provenance metadata inside the data

Each recipe carries a `source` object:

```json
"source": { "name": "SmartBasket synthetic recipe dataset", "licence": "CC0-1.0", "url": null }
```

The dataset validator (`server/src/services/recipe/recipeDataset.js`) requires
this metadata to be present and non-blank for every recipe.
