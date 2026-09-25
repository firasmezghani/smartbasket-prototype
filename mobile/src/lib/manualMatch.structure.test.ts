import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

test('every basket-add caller presents checklist feedback without auto-opening assignment', () => {
  const flow = readFileSync(join(root, 'src/screens/BarcodeScannerFlow.tsx'), 'utf8');
  assert.match(flow, /presentAddFeedback/);
  assert.match(flow, /listCollectMeta/);
  assert.match(flow, /extraItemId/);
  assert.match(flow, /bodyKey === 'confirmed'/);
  assert.match(flow, /recoverAmbiguousScannerAdd/);
  assert.doesNotMatch(flow, /offerAfterAddMatch/);
  assert.doesNotMatch(flow, /shouldOfferAfterAddMatch/);

  const detail = readFileSync(join(root, 'src/screens/ProductDetailScreen.tsx'), 'utf8');
  assert.match(detail, /presentAddFeedback/);
  assert.match(detail, /listCollectMeta/);
  assert.match(detail, /addConfirmed:\s*true/);
  assert.match(detail, /accountRef/);
  assert.doesNotMatch(detail, /offerAfterAddMatch/);
  assert.doesNotMatch(detail, /shouldOfferAfterAddMatch/);
  assert.match(detail, /hasCatalogueDescription/);
  assert.doesNotMatch(detail, /descriptionFallback/);

  const callers = `${flow}\n${detail}`;
  assert.equal((callers.match(/addItem\(/g) ?? []).length, 2);

  const app = readFileSync(join(root, 'App.tsx'), 'utf8');
  assert.match(app, /ManualMatchHost/);
  assert.match(app, /GenericMatchHost/);
  assert.match(app, /ChecklistNoticeHost/);
});

test('checklist rows expose a compact menu for scan, basket match and remove', () => {
  const list = readFileSync(join(root, 'src/screens/ShoppingListScreen.tsx'), 'utf8');
  assert.match(list, /list\.rowMenu/);
  assert.match(list, /list\.matchWithBasket/);
  assert.match(list, /offerBasketMatch/);
  assert.match(list, /openChecklistScan\(item\)/);
  assert.match(list, /list\.scanRow/);
  assert.match(list, /list\.browseCatalog/);
  const menuStart = list.indexOf('const openRowMenu');
  const menuEnd = list.indexOf('const confirmClear');
  assert.ok(menuStart > 0 && menuEnd > menuStart);
  const menu = list.slice(menuStart, menuEnd);
  assert.match(menu, /isManualPersonalNote/);
  assert.match(menu, /list\.editNote/);
  assert.match(menu, /list\.matchWithBasket/);
  assert.doesNotMatch(menu, /list\.scanRow/);
});

test('checklist draft suggestions use the catalogue search endpoint and explicit personal notes', () => {
  const list = readFileSync(join(root, 'src/screens/ShoppingListScreen.tsx'), 'utf8');
  assert.match(list, /useChecklistDraftSuggestions/);
  assert.match(list, /addProductItem/);
  assert.match(list, /linkedInputFromCatalogueProduct/);
  assert.match(list, /onAddPersonalNote/);
  assert.match(list, /list\.addPersonalNote/);
  assert.match(list, /list\.addPersonalNoteHint/);
  assert.match(list, /list\.personalNoteBadge/);
  assert.match(list, /list\.addedInlineNamed/);
  assert.match(list, /pendingScrollId/);
  assert.match(list, /addingRef/);
  assert.match(list, /list\.genericChoice/);
  assert.match(list, /addGenericItem/);
  assert.match(list, /genericTypesOfferedForDraft/);
  assert.match(list, /personalNoteActionMode/);
  assert.match(list, /list\.chooseSpecific/);
  assert.match(list, /list\.addUnmatched/);
  assert.match(list, /list\.addAsNoteQuiet/);
  assert.match(list, /offeredGenericTypes\.length === 1/);
  assert.match(list, /offeredGenericTypes\.length > 1/);
  assert.match(list, /onSubmitEditing=\{\(\) => void onAddPersonalNote\(\)\}/);
  assert.doesNotMatch(list, /products\[0\]/);

  const hook = readFileSync(join(root, 'src/hooks/useChecklistDraftSuggestions.ts'), 'utf8');
  assert.match(hook, /fetchProducts\(query\)/);
  assert.match(hook, /checklistDraftCatalogQuery/);
  assert.match(hook, /shouldAcceptDraftSearchResult/);
  assert.match(hook, /createRequestGeneration/);
  assert.match(hook, /resolveDraftSuggestionView/);
});

test('manual assignment requires a review pairing before it persists', () => {
  const host = readFileSync(join(root, 'src/components/ManualMatchHost.tsx'), 'utf8');
  assert.match(host, /matchStepAfterSelectingOption/);
  assert.match(host, /shouldCommitMatchConfirm/);
  assert.match(host, /list\.matchConfirmMatch/);
  assert.match(host, /list\.matchChangeSelection/);
  assert.match(host, /list\.matchProductLabel/);
  assert.match(host, /list\.matchNoteLabel/);
  assert.match(host, /list\.matchFulfilsNote/);
  assert.match(host, /list\.matchCancelKeepsProduct/);
  assert.match(host, /list\.matchSelectEntry/);
  assert.doesNotMatch(host, /list\.matchQuestion/);
  assert.doesNotMatch(host, /list\.matchUnitNote/);
  assert.doesNotMatch(host, /list\.matchAdded/);
  const optionPress = host.slice(host.indexOf('onPress={() => {'), host.indexOf('accessibilityRole="button"'));
  assert.doesNotMatch(optionPress, /confirmManualMatch/);
  assert.match(optionPress, /setStep\(matchStepAfterSelectingOption\(\)\)/);
});

test('personal-note editor reuses list persistence, 120-character cap, and account generation', () => {
  const host = readFileSync(join(root, 'src/components/PersonalNoteEditHost.tsx'), 'utf8');
  assert.match(host, /updateManualItemLabel/);
  assert.match(host, /maxLength=\{120\}/);
  assert.match(host, /common\.save/);
  assert.match(host, /common\.cancel/);
  assert.match(host, /shouldDiscardMatchSession/);
  assert.match(host, /list\.saveFailed/);
  assert.match(host, /accessibilityViewIsModal/);
  assert.match(host, /KeyboardAvoidingView/);
  assert.doesNotMatch(host, /classify/);
  assert.doesNotMatch(host, /addItem\(/);

  const ctx = readFileSync(join(root, 'src/context/ShoppingListContext.tsx'), 'utf8');
  assert.match(ctx, /evaluatePersonalNoteEdit/);
  assert.match(ctx, /persistPersonalNoteEdit/);
  assert.match(ctx, /itemsRef\.current/);
  assert.match(ctx, /snapshot\.generation !== opts\.started\.generation/);
  assert.match(ctx, /cleanShoppingListLabel/);
});

test('Recipe Ideas still loads without a Home evidence key', () => {
  const ideas = readFileSync(join(root, 'src/screens/RecipeIdeasScreen.tsx'), 'utf8');
  assert.match(ideas, /useRecipeRecommendations\(\)/);
  assert.doesNotMatch(ideas, /evidenceKey/);
});

test('home uses existing list, basket and one recipe preview without a tab-duplicating grid', () => {
  const home = readFileSync(join(root, 'src/screens/HomeScreen.tsx'), 'utf8');
  assert.match(home, /useRecipeRecommendations\(\{[\s\S]*limit: 1/);
  assert.match(home, /homeListCardState/);
  assert.match(home, /homeBasketSummaryState/);
  assert.match(home, /basketEvidenceKey/);
  assert.match(home, /home\.nextShopTitle/);
  assert.match(home, /home\.recipeInspiration/);
  assert.match(home, /home\.openShoppingList/);
  assert.match(home, /home\.listComplete/);
  assert.match(home, /home\.allRecipes/);
  assert.match(home, /shouldHideBasketRecipeWhileRefreshing/);
  assert.doesNotMatch(home, /QuickActionCard/);
  assert.doesNotMatch(home, /home\.heroTitle/);
  assert.doesNotMatch(home, /home\.evidenceBasket/);
});
