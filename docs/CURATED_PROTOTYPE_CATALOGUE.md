# Curated prototype catalogue

The customer app shows **91 products**: 53 food, 12 drinks, 13 household,
9 personal care, and 4 other. Of those, **35** are recipe-eligible, **30** are
catalogue-only food or drink, and **26** are non-food. Every product has a
barcode and a price.

The list is `server/src/data/catalogue/curated-v3-approved.json`. Flyway
installs it from `server/db/migration/V2__seed_demo_catalogue.sql` (91 products,
164 barcodes, 91 metadata rows). Photos live in `server/product-images/`.

`CATALOGUE_MODE=curated` (the default) is what the customer API serves. The
ten recipes in `server/src/data/recipes/recipes.json` can all be demonstrated
on this catalogue.
