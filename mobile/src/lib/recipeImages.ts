// Local recipe images (in mobile/assets/recipes/) by recipe id.

export type RecipeImageFit = 'contain' | 'cover';

export type RecipeImageNeed = {
  recipeId: string;
  title: string;
  filename: string;
  fit: RecipeImageFit;
  // Intrinsic pixel size of the local file.
  width: number;
  height: number;
};

// All dataset recipe ids and the local file each is wired to.
export const RECIPE_IMAGES_NEEDED: readonly RecipeImageNeed[] = Object.freeze([
  {
    recipeId: 'classic-omelette',
    title: 'Classic Omelette',
    filename: 'recipes/classic-omelette.jpg',
    fit: 'cover',
    width: 2000,
    height: 1000,
  },
  {
    recipeId: 'fluffy-pancakes',
    title: 'Fluffy Pancakes',
    filename: 'recipes/fluffy-pancakes.webp',
    fit: 'contain',
    width: 844,
    height: 844,
  },
  {
    recipeId: 'tomato-pantry-pasta',
    title: 'Tomato Pantry Pasta',
    filename: 'recipes/tomato-pantry-pasta.jpg',
    fit: 'contain',
    width: 1200,
    height: 900,
  },
  {
    recipeId: 'tuna-pasta-salad',
    title: 'Tuna Pasta Salad',
    filename: 'recipes/tuna-pasta-salad.jpg',
    fit: 'contain',
    width: 1200,
    height: 1200,
  },
  {
    recipeId: 'chickpea-tomato-stew',
    title: 'Chickpea Tomato Stew',
    filename: 'recipes/chickpea-tomato-stew.jpg',
    fit: 'contain',
    width: 1200,
    height: 967,
  },
  {
    recipeId: 'mushroom-pea-rice',
    title: 'Mushroom Pea Rice',
    filename: 'recipes/mushroom-pea-rice.jpg',
    fit: 'contain',
    width: 1200,
    height: 1200,
  },
  {
    recipeId: 'tuna-tortilla-wrap',
    title: 'Tuna Tortilla Wrap',
    filename: 'recipes/tuna-tortilla-wrap.jpg',
    fit: 'contain',
    width: 1200,
    height: 1800,
  },
  {
    recipeId: 'cheesy-tomato-pasta',
    title: 'Cheesy Tomato Pasta',
    filename: 'recipes/cheesy-tomato-pasta.jpg',
    fit: 'contain',
    width: 1170,
    height: 1500,
  },
  {
    recipeId: 'rice-pudding',
    title: 'Rice Pudding',
    filename: 'recipes/rice-pudding.jpg',
    fit: 'contain',
    width: 1200,
    height: 1200,
  },
  {
    recipeId: 'peanut-butter-pancakes',
    title: 'Peanut Butter Pancakes',
    filename: 'recipes/peanut-butter-pancakes.png',
    fit: 'cover',
    width: 2000,
    height: 1125,
  },
]);

function loadRecipeImageAssets(): Readonly<Record<string, number>> {
  try {
    return Object.freeze({
      'classic-omelette': require('../../assets/recipes/classic-omelette.jpg') as number,
      'fluffy-pancakes': require('../../assets/recipes/fluffy-pancakes.webp') as number,
      'tomato-pantry-pasta': require('../../assets/recipes/tomato-pantry-pasta.jpg') as number,
      'tuna-pasta-salad': require('../../assets/recipes/tuna-pasta-salad.jpg') as number,
      'chickpea-tomato-stew': require('../../assets/recipes/chickpea-tomato-stew.jpg') as number,
      'mushroom-pea-rice': require('../../assets/recipes/mushroom-pea-rice.jpg') as number,
      'tuna-tortilla-wrap': require('../../assets/recipes/tuna-tortilla-wrap.jpg') as number,
      'cheesy-tomato-pasta': require('../../assets/recipes/cheesy-tomato-pasta.jpg') as number,
      'rice-pudding': require('../../assets/recipes/rice-pudding.jpg') as number,
      'peanut-butter-pancakes': require('../../assets/recipes/peanut-butter-pancakes.png') as number,
    });
  } catch {
    const stub: Record<string, number> = {};
    for (const row of RECIPE_IMAGES_NEEDED) stub[row.recipeId] = 1;
    return Object.freeze(stub);
  }
}

// Local `require()` module ids keyed by recipe id.
export const RECIPE_IMAGE_ASSETS: Readonly<Record<string, number>> = loadRecipeImageAssets();

export function normaliseRecipeId(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// Local image module for this recipe id, or null for the fallback.
export function recipeImageSource(recipeId: unknown): number | null {
  const id = normaliseRecipeId(recipeId);
  if (!id) return null;
  const asset = RECIPE_IMAGE_ASSETS[id];
  return typeof asset === 'number' ? asset : null;
}

export function recipeImageNeedForId(recipeId: unknown): RecipeImageNeed | null {
  const id = normaliseRecipeId(recipeId);
  if (!id) return null;
  return RECIPE_IMAGES_NEEDED.find((row) => row.recipeId === id) ?? null;
}

export function recipeImageFit(recipeId: unknown): RecipeImageFit {
  return recipeImageNeedForId(recipeId)?.fit ?? 'contain';
}

// Image size inside the frame for 'contain' or 'cover'.
export function recipeImageLaidOutSize(
  frameWidth: number,
  frameHeight: number,
  recipeId: unknown,
): { width: number; height: number } {
  const row = recipeImageNeedForId(recipeId);
  if (!row || frameWidth <= 0 || frameHeight <= 0) {
    return { width: Math.max(0, frameWidth), height: Math.max(0, frameHeight) };
  }
  if (row.fit === 'cover') {
    return { width: frameWidth, height: frameHeight };
  }
  const sourceAspect = row.width / row.height;
  const frameAspect = frameWidth / frameHeight;
  if (sourceAspect >= frameAspect) {
    return { width: frameWidth, height: frameWidth / sourceAspect };
  }
  return { width: frameHeight * sourceAspect, height: frameHeight };
}
