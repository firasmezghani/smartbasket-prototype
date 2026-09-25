import test from 'node:test';
import assert from 'node:assert/strict';

import { translations, type TranslationKey } from './translations';

test('every English translation key has a French string', () => {
  const enKeys = Object.keys(translations.en) as TranslationKey[];
  const frKeys = new Set(Object.keys(translations.fr));
  const missing = enKeys.filter((key) => !frKeys.has(key) || translations.fr[key].trim() === '');
  assert.deepEqual(missing, []);
});

test('validated-history UI keys exist in both languages', () => {
  const required: TranslationKey[] = [
    'nav.purchaseHistory',
    'account.purchaseHistory',
    'orders.loading',
    'orders.emptyTitle',
    'orders.browseCatalog',
    'purchase.sourceSmartBasket',
    'purchase.validationAt',
    'purchase.recordedItems',
    'purchase.recordedValue',
    'purchase.estimateIncomplete',
    'purchase.validationHeading',
    'common.retry',
    'recipe.evidenceHistory',
    'recipe.historyNote',
    'recipe.coverageHistory',
    'recipe.reqHistoryAssociated',
    'recipe.reqHistoryQuantityUnverified',
    'recipe.listIntroHistory',
    'recipe.ideasIntroHistory',
  ];
  for (const key of required) {
    assert.ok(translations.en[key].trim().length > 0, key);
    assert.ok(translations.fr[key].trim().length > 0, key);
  }
});

test('lifecycle-correction UI keys exist in both languages', () => {
  const required: TranslationKey[] = [
    // Account-scoped shopping list (signed-out state + guard).
    'list.errorSignInRequired',
    'list.signedOutTitle',
    'list.signedOutBody',
    // Idle or abandoned basket prompt.
    'basket.staleTitle',
    'basket.staleBody',
    'basket.staleResume',
    'basket.staleStartNew',
    'basket.staleStartNewTitle',
    'basket.staleStartNewBody',
    'basket.staleClearFailed',
    'basket.openShoppingList',
    // Catalogue vs in-store basket (demo-only shortcut).
    'product.scanInStoreHint',
    'product.addToShoppingList',
    'product.demoAddToBasket',
    'product.demoAddToBasketHint',
    'product.demoAddToBasketNote',
    'errors.barcodeNotFound',
    'errors.barcodeNotInCatalogue',
  ];
  for (const key of required) {
    assert.ok(translations.en[key].trim().length > 0, key);
    assert.ok(translations.fr[key].trim().length > 0, key);
  }
});

test('my-recipes UI keys exist in both languages', () => {
  const required: TranslationKey[] = [
    'nav.myRecipes',
    'myRecipes.deviceNote',
    'myRecipes.create',
    'myRecipes.signedOutTitle',
    'myRecipes.loadError',
    'myRecipes.quantityNote',
    'myRecipes.apply',
    'myRecipes.alreadyApplied',
    'myRecipes.entryTitle',
  ];
  for (const key of required) {
    assert.ok(translations.en[key].trim().length > 0, key);
    assert.ok(translations.fr[key].trim().length > 0, key);
    assert.notEqual(translations.en[key], translations.fr[key], key);
  }
});

test('recipe UI keys exist in both languages', () => {
  const required: TranslationKey[] = [
    'nav.recipeIdeas',
    'nav.recipeDetail',
    'home.cardRecipesTitle',
    'home.cardRecipesDesc',
    'recipe.signInTitle',
    'recipe.evidenceBadgePopularity',
    'recipe.explanationLanguageNote',
    'recipe.addSelected',
    'recipe.selectAll',
    'recipe.popularityNote',
    'recipe.personalisedNote',
  ];
  for (const key of required) {
    assert.ok(translations.en[key].trim().length > 0, key);
    assert.ok(translations.fr[key].trim().length > 0, key);
  }
});

test('manual match UI keys exist in both languages', () => {
  const required: TranslationKey[] = [
    'list.rowMenu',
    'list.rowMenuA11y',
    'list.matchWithBasket',
    'list.matchQuestion',
    'list.matchNone',
    'list.matchConfirm',
    'list.matchConfirmMatch',
    'list.matchChangeSelection',
    'list.matchProductLabel',
    'list.matchNoteLabel',
    'list.matchFulfilsNote',
    'list.matchCancelKeepsProduct',
    'list.noticeAddedToBasket',
    'list.noticeCheckedHeading',
    'list.noticeCheckedDetailZero',
    'list.noticeCheckedDetailOne',
    'list.noticeCheckedDetailOther',
    'list.noticePartialHeading',
    'list.noticePartialDetail',
    'list.noticeUnresolvedHeading',
    'list.noticeUnresolvedDetail',
    'list.matchToList',
    'list.matchToListHint',
    'list.genericConfirmTitle',
    'list.genericSelectTitle',
    'list.genericAlreadyInBasket',
    'list.genericConfirm',
    'list.genericNotNowHint',
    'list.genericQuantityNote',
    'common.notNow',
    'list.addPersonalNote',
    'list.addPersonalNoteHint',
    'list.personalNoteBadge',
    'list.addedInlineNamed',
    'list.updatedInlineNamed',
    'list.suggestionsFailed',
    'list.suggestionsEmpty',
    'list.suggestionsSearching',
    'list.matchBasketTitle',
    'list.matchUnitNote',
    'basket.cashierOnlyNote',
    'basket.compactCounts',
    'home.continueList',
    'home.openRecipes',
    'home.createList',
    'home.itemsLeft',
    'home.listComplete',
    'home.editList',
    'home.openShoppingList',
    'home.listPrepareSubtitle',
    'home.viewRecipe',
    'home.allRecipes',
    'home.estimatedTotalLabel',
    'home.signedOutList',
    'home.helloNamed',
    'home.nextShopTitle',
    'home.exploreProducts',
    'home.recipeInspiration',
    'home.browseAll',
    'list.addUnmatched',
    'list.addAsNoteQuiet',
    'list.chooseSpecific',
    'account.latestValidatedTitle',
    'account.latestValidatedEmpty',
    'recipe.whySuggestion',
    'recipe.noImage',
    'recipe.overallNotAssessed',
  ];
  for (const key of required) {
    assert.ok(translations.en[key].trim().length > 0, key);
    assert.ok(translations.fr[key].trim().length > 0, key);
    assert.notEqual(translations.en[key], translations.fr[key], key);
  }
});

test('targeted checklist-scan UI keys exist in both languages', () => {
  const required: TranslationKey[] = [
    'list.browseCatalogHint',
    'list.scanRow',
    'list.scanRowHint',
    'list.scanTargetHeading',
    'list.scanTargetEntry',
    'list.addAndCheck',
    'list.addAndCheckHint',
    'list.scanQuantityNote',
    'list.scanMismatchTitle',
    'list.scanMismatchBody',
    'list.scanAgain',
    'list.helpA11y',
  ];
  for (const key of required) {
    assert.ok(translations.en[key].trim().length > 0, key);
    assert.ok(translations.fr[key].trim().length > 0, key);
    assert.notEqual(translations.en[key], translations.fr[key], key);
  }
});

test('empty-basket and personal-note edit keys exist in both languages', () => {
  const required: TranslationKey[] = [
    'basket.emptyTitle',
    'basket.emptyBody',
    'basket.scanBarcode',
    'basket.openShoppingList',
    'common.save',
    'list.editNote',
    'list.editNoteTitle',
    'list.editNoteField',
    'list.editNoteHint',
    'list.editNoteGone',
    'list.errorEmptyLabel',
    'list.saveFailed',
  ];
  for (const key of required) {
    assert.ok(translations.en[key].trim().length > 0, key);
    assert.ok(translations.fr[key].trim().length > 0, key);
    assert.notEqual(translations.en[key], translations.fr[key], key);
  }
  assert.equal(translations.en['basket.emptyTitle'], 'Your basket is empty');
  assert.equal(translations.en['basket.emptyBody'], 'Scan a product to get started.');
  assert.equal(translations.en['basket.scanBarcode'], 'Scan a product');
});
