import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  RECIPE_IMAGE_ASSETS,
  RECIPE_IMAGES_NEEDED,
  recipeImageFit,
  recipeImageLaidOutSize,
  recipeImageNeedForId,
  recipeImageSource,
} from './recipeImages';

const DATASET_IDS = [
  'classic-omelette',
  'fluffy-pancakes',
  'tomato-pantry-pasta',
  'tuna-pasta-salad',
  'chickpea-tomato-stew',
  'mushroom-pea-rice',
  'tuna-tortilla-wrap',
  'cheesy-tomato-pasta',
  'rice-pudding',
  'peanut-butter-pancakes',
] as const;

test('every dataset recipe id is wired to an existing local asset', () => {
  assert.equal(RECIPE_IMAGES_NEEDED.length, 10);
  assert.deepEqual(
    RECIPE_IMAGES_NEEDED.map((row) => row.recipeId),
    [...DATASET_IDS],
  );
  assert.equal(Object.keys(RECIPE_IMAGE_ASSETS).length, 10);
  const assetsRoot = join(process.cwd(), 'assets');
  for (const id of DATASET_IDS) {
    assert.equal(typeof recipeImageSource(id), 'number');
    const row = recipeImageNeedForId(id);
    assert.ok(row, id);
    assert.equal(existsSync(join(assetsRoot, row.filename)), true, row.filename);
  }
  assert.equal(recipeImageSource('unknown-recipe'), null);
  assert.equal(recipeImageNeedForId('Classic-Omelette')?.recipeId, 'classic-omelette');
  assert.equal(recipeImageNeedForId('fluffy-pancakes')?.filename, 'recipes/fluffy-pancakes.webp');
  assert.equal(recipeImageNeedForId('peanut-butter-pancakes')?.filename, 'recipes/peanut-butter-pancakes.png');

  const dataset = JSON.parse(
    readFileSync(join(process.cwd(), '../server/src/data/recipes/recipes.json'), 'utf8'),
  ) as { recipes: { id: string }[] };
  const defined = new Set(dataset.recipes.map((row) => row.id));
  assert.equal(defined.size, 10);
  for (const id of DATASET_IDS) assert.equal(defined.has(id), true, id);
});

test('RecipeImage hides fallback copy and uses per-recipe contain or cover', () => {
  const image = readFileSync(join(process.cwd(), 'src/components/RecipeImage.tsx'), 'utf8');
  assert.match(image, /recipeImageSource/);
  assert.match(image, /recipeImageLaidOutSize/);
  assert.match(image, /onError/);
  assert.match(image, /onLayout/);
  assert.match(image, /accessibilityElementsHidden/);
  assert.match(image, /alignItems: 'center'/);
  assert.doesNotMatch(image, /recipe\.noImage/);
  assert.doesNotMatch(image, /recipe\.imageAlt/);
});

test('portrait wrap, cheesy pasta and watermarked pantry pasta use contain', () => {
  assert.equal(recipeImageFit('tuna-tortilla-wrap'), 'contain');
  assert.equal(recipeImageFit('cheesy-tomato-pasta'), 'contain');
  assert.equal(recipeImageFit('tomato-pantry-pasta'), 'contain');
  assert.equal(recipeImageFit('fluffy-pancakes'), 'contain');
  assert.equal(recipeImageFit('classic-omelette'), 'cover');
  assert.equal(recipeImageFit('peanut-butter-pancakes'), 'cover');
  assert.equal(recipeImageFit('unknown-recipe'), 'contain');

  const wrap = recipeImageLaidOutSize(160, 100, 'tuna-tortilla-wrap');
  assert.equal(wrap.height, 100);
  assert.ok(wrap.width < 160);
  assert.ok(Math.abs(wrap.width / wrap.height - 1200 / 1800) < 0.001);

  const cheesy = recipeImageLaidOutSize(160, 100, 'cheesy-tomato-pasta');
  assert.equal(cheesy.height, 100);
  assert.ok(cheesy.width < 160);

  const pantry = recipeImageLaidOutSize(160, 100, 'tomato-pantry-pasta');
  assert.equal(pantry.height, 100);
  assert.ok(pantry.width < 160);
  assert.ok(Math.abs(pantry.width / pantry.height - 1200 / 900) < 0.001);

  const omelette = recipeImageLaidOutSize(160, 100, 'classic-omelette');
  assert.deepEqual(omelette, { width: 160, height: 100 });

  const pancakes = recipeImageLaidOutSize(160, 100, 'fluffy-pancakes');
  assert.equal(pancakes.height, 100);
  assert.equal(pancakes.width, 100);
});
