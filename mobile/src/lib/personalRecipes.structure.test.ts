import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('My recipes stays outside the recommender and does not add a tab', () => {
  const ideas = readFileSync(join(process.cwd(), 'src/screens/RecipeIdeasScreen.tsx'), 'utf8');
  assert.match(ideas, /useRecipeRecommendations/);
  assert.match(ideas, /MyRecipes/);
  assert.match(ideas, /myRecipes\.entryTitle/);
  assert.doesNotMatch(ideas, /saveRecipe|PersonalRecipe/);

  const detail = readFileSync(join(process.cwd(), 'src/screens/RecipeDetailScreen.tsx'), 'utf8');
  assert.match(detail, /fetchRecipeRecommendationById/);
  assert.doesNotMatch(detail, /usePersonalRecipes/);

  const tabs = readFileSync(join(process.cwd(), 'src/navigation/MainTabs.tsx'), 'utf8');
  assert.match(tabs, /name="MyRecipes"/);
  assert.doesNotMatch(tabs, /name="MyRecipes".*tabBar/);
  assert.match(tabs, /Home: \[/);

  const personal = readFileSync(join(process.cwd(), 'src/lib/personalRecipes.ts'), 'utf8');
  assert.doesNotMatch(personal, /useRecipeRecommendations|fallbackRank|recipes\.json/);
});

test('personal recipe screens do not assign recommended dish photos or mutate the basket', () => {
  const list = readFileSync(join(process.cwd(), 'src/screens/MyRecipesScreen.tsx'), 'utf8');
  const editor = readFileSync(join(process.cwd(), 'src/screens/MyRecipeEditorScreen.tsx'), 'utf8');
  const add = readFileSync(join(process.cwd(), 'src/screens/MyRecipeAddToListScreen.tsx'), 'utf8');
  for (const source of [list, editor, add]) {
    assert.doesNotMatch(source, /RecipeImage|RECIPE_IMAGE_ASSETS|addItem\(|CartContext/);
  }
  assert.match(add, /addMixedChecklistEntries/);
  assert.match(add, /packageQty/);
  assert.match(add, /shouldRefuseDuplicateSubmit/);
  assert.match(editor, /usePreventRemove/);
  assert.match(editor, /adjustKeyboardInsets/);
});
