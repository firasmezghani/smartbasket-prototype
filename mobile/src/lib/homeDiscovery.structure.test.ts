import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

test('Home is a shopping dashboard without a repeated SmartBasket heading or popularity claims', () => {
  const home = readFileSync(join(root, 'src/screens/HomeScreen.tsx'), 'utf8');
  assert.match(home, /home\.helloNamed/);
  assert.match(home, /home\.helloNeutral/);
  assert.match(home, /home\.readySubtitle/);
  assert.match(home, /home\.nextShopTitle/);
  assert.match(home, /home\.exploreProducts/);
  assert.match(home, /selectHomeExploreProducts/);
  assert.match(home, /HOME_EXPLORE_FETCH_LIMIT/);
  assert.match(home, /home\.recipeInspiration/);
  assert.match(home, /RecipeImage/);
  assert.match(home, /ProductCard/);
  assert.match(home, /screen: 'ProductDetail'/);
  assert.match(home, /screen: 'CatalogList'/);
  assert.doesNotMatch(home, /home\.brandName/);
  assert.doesNotMatch(home, /shouldShowRecipeEvidenceCaption/);
  assert.doesNotMatch(home, /recipe\.evidencePopularity/);
  assert.doesNotMatch(home, /addItem\(/);
  assert.doesNotMatch(home, /popularised|discounted|personalised selection/i);

  const insights = readFileSync(join(root, 'src/screens/InsightsScreen.tsx'), 'utf8');
  assert.match(insights, /accountHistoryPreviewState/);
  assert.match(insights, /isHistoryResultCurrent/);
  assert.match(insights, /account\.latestValidatedTitle/);
  assert.match(insights, /account\.latestValidatedEmpty/);
  assert.match(insights, /account\.latestValidatedUnavailable/);
  assert.match(insights, /fetchPurchaseHistory/);
  assert.doesNotMatch(insights, /metricAverage|loyalty|spent this month/i);
});
