import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

test('checklist scan is a Home-stack session; Scan tab stays parameterless browse', () => {
  const navTypes = readFileSync(join(root, 'src/types/navigation.ts'), 'utf8');
  assert.match(navTypes, /ChecklistScan:\s*\{\s*sessionId:\s*string;\s*targetItemId\?:\s*string;\s*expectedProductId\?:\s*string\s*\}/);
  assert.match(navTypes, /Scan:\s*undefined/);
  assert.doesNotMatch(navTypes, /Scan:\s*\{[^}]*returnTo/);

  const tabs = readFileSync(join(root, 'src/navigation/MainTabs.tsx'), 'utf8');
  assert.match(tabs, /name="ChecklistScan"/);
  assert.match(tabs, /freezeOnBlur:\s*false/);
  assert.match(tabs, /homeTabBarHidden/);

  const list = readFileSync(join(root, 'src/screens/ShoppingListScreen.tsx'), 'utf8');
  assert.match(list, /const completed = useMemo/);
  const memoIdx = list.indexOf('const completed = useMemo');
  const earlyIdx = list.indexOf('if (!ready)');
  assert.ok(memoIdx > 0 && earlyIdx > memoIdx, 'completed useMemo must run before early returns');
  assert.match(list, /list\.scanProduct/);
  assert.match(list, /createChecklistScanParams/);
  assert.match(list, /draftLabel/);
  assert.match(list, /list\.browseCatalog/);
  assert.match(list, /openChecklistScan\(item\)/);
  assert.match(list, /list\.scanRow/);
  assert.match(list, /list\.rowMenu/);
  assert.match(list, /offerBasketMatch/);
  assert.doesNotMatch(list, /ListEmptyComponent[\s\S]*list\.browseCatalog/);
  assert.doesNotMatch(list, /list\.catalogLinked/);
  assert.doesNotMatch(list, /list\.manualEntry/);

  const scanTab = readFileSync(join(root, 'src/screens/ScannerScreen.tsx'), 'utf8');
  assert.match(scanTab, /mode="browse"/);
  assert.doesNotMatch(scanTab, /mode="checklist"/);

  const checklist = readFileSync(join(root, 'src/screens/ChecklistScanScreen.tsx'), 'utf8');
  assert.match(checklist, /mode="checklist"/);
  assert.match(checklist, /sessionId=\{route\.params\.sessionId\}/);
  assert.match(checklist, /targetItemId=\{route\.params\.targetItemId\}/);
  assert.match(checklist, /expectedProductId=\{route\.params\.expectedProductId\}/);

  const flow = readFileSync(join(root, 'src/screens/BarcodeScannerFlow.tsx'), 'utf8');
  assert.match(flow, /useIsFocused/);
  assert.match(flow, /shouldRenderCameraPreview/);
  assert.match(flow, /list\.addAndReturn/);
  assert.match(flow, /list\.addAndCheck/);
  assert.match(flow, /shouldShowScanDiagnostics/);
  assert.doesNotMatch(flow, /__DEV__/);
  assert.match(flow, /beforeRemove/);
  assert.match(flow, /isNetworkError/);
  assert.match(flow, /recoverAmbiguousScannerAdd/);
  assert.match(flow, /createScannerSessionGuard/);
  assert.match(flow, /presentAddFeedback/);
  assert.match(flow, /kind: 'unresolved'/);
  assert.doesNotMatch(flow, /scan\.observedInBasket/);
  assert.match(flow, /targetedScan:\s*Boolean\(scanTarget\)/);
  assert.match(flow, /finishChecklistAdd\(op\)/);
  assert.doesNotMatch(flow, /offerAfterAddMatch/);
  assert.match(flow, /accountGeneration/);
  assert.match(flow, /invalidateBlur/);
  assert.match(flow, /resolveChecklistRowScanTarget/);
  assert.match(flow, /evaluateLinkedScanMatch/);
  assert.match(flow, /extraItemIdForTargetedAdd/);
  assert.match(flow, /extraItemIdForTargetedGenericAdd/);
  assert.match(flow, /evaluateTargetedGenericScan/);
  assert.match(flow, /list\.genericIncompatibleTitle/);
  assert.match(flow, /list\.scanMismatchTitle/);
  assert.match(flow, /isUncheckedManualItem/);
  assert.match(flow, /list\.matchFulfilsNote/);
  assert.match(flow, /list\.matchProductLabel/);
  assert.match(flow, /list\.matchNoteLabel/);
  assert.match(flow, /collectedPlan/);
  assert.doesNotMatch(flow, /addGen\.current\.isCurrent\(addGen\.current\.current\(\)\)/);
});

test('add feedback host is global, non-blocking, and never auto-opens matching', () => {
  const host = readFileSync(join(root, 'src/components/ChecklistNoticeHost.tsx'), 'utf8');
  assert.match(host, /FeedbackNotice/);
  assert.match(host, /list\.matchToList/);
  assert.match(host, /retryNoticeListSync/);
  assert.match(host, /offerMatchFromNotice/);
  assert.match(host, /ADD_NOTICE_AUTO_DISMISS_MS/);
  assert.match(host, /paddingBottom/);
  assert.doesNotMatch(host, /Modal/);
  assert.doesNotMatch(host, /list\.markGeneric/);
  assert.doesNotMatch(host, /offerGenericMatchFromNotice/);

  const notice = readFileSync(join(root, 'src/components/FeedbackNotice.tsx'), 'utf8');
  assert.match(notice, /accessibilityLiveRegion="polite"/);
  assert.match(notice, /checkmark-circle/);
  assert.match(notice, /alert-circle/);
  assert.match(notice, /help-circle/);
  assert.match(notice, /name="close"/);
  assert.doesNotMatch(notice, /list\.noticeDismiss/);

  const context = readFileSync(join(root, 'src/context/ShoppingListContext.tsx'), 'utf8');
  const presentStart = context.indexOf('const presentAddFeedback');
  const presentEnd = context.indexOf('const offerMatchFromNotice');
  assert.ok(presentStart > 0 && presentEnd > presentStart);
  const presentFn = context.slice(presentStart, presentEnd);
  assert.match(presentFn, /setPendingMatch\(null\)/);
  assert.doesNotMatch(presentFn, /setPendingMatch\(\{/);
  assert.match(presentFn, /evaluateAddChecklistFeedback/);
  assert.match(presentFn, /setPendingGenericMatch\(\{/);
  assert.match(presentFn, /setNotice\(null\)/);
  assert.match(presentFn, /openMatchDialog/);

  const genericHost = readFileSync(join(root, 'src/components/GenericMatchHost.tsx'), 'utf8');
  assert.match(genericHost, /list\.genericConfirmTitle/);
  assert.match(genericHost, /list\.genericSelectTitle/);
  assert.match(genericHost, /list\.genericAlreadyInBasket/);
  assert.match(genericHost, /common\.notNow/);
  assert.match(genericHost, /list\.genericQuantityNote/);
  assert.doesNotMatch(genericHost, /generic item/i);
  assert.doesNotMatch(genericHost, /generic list entry/i);
});

test('cart add distinguishes list persistence failure from basket failure', () => {
  const cart = readFileSync(join(root, 'src/context/CartContext.tsx'), 'utf8');
  assert.match(cart, /completeAccountScopedCartAdd/);
  assert.match(cart, /completeAccountScopedCartRefresh/);
  assert.match(cart, /prepareProductCollected/);
  assert.match(cart, /commitPreparedCollected/);
  assert.match(cart, /collectedPlan/);
  const refreshStart = cart.indexOf('const refresh = useCallback');
  const refreshEnd = cart.indexOf('useEffect', refreshStart);
  const refreshFn = cart.slice(refreshStart, refreshEnd);
  assert.doesNotMatch(refreshFn, /setCart\(EMPTY_CART\)/);
});

test('shopping list commits snapshot the initiating account before await', () => {
  const list = readFileSync(join(root, 'src/context/ShoppingListContext.tsx'), 'utf8');
  assert.match(list, /commitShoppingListForAccount/);
  assert.match(list, /prepareProductCollected/);
  assert.match(list, /prepareCollectedMarks/);
  assert.match(list, /inspectLinkedCollect/);
  assert.match(list, /presentAddFeedback/);
  assert.match(list, /evaluateAddChecklistFeedback/);
  assert.match(list, /retryNoticeListSync/);
  assert.match(list, /offerMatchFromNotice/);
  assert.match(list, /applyCollectedMarks/);
  assert.match(list, /evaluateGenericMatchCommit/);
  assert.match(list, /accountGeneration/);
});

test('main screens drop duplicate tab shortcuts and empty-only catalogue access', () => {
  const home = readFileSync(join(root, 'src/screens/HomeScreen.tsx'), 'utf8');
  assert.doesNotMatch(home, /home\.heroTitle/);
  assert.doesNotMatch(home, /home\.startScanning/);
  assert.doesNotMatch(home, /home\.cardCatalogueTitle/);
  assert.match(home, /home\.nextShopTitle/);
  assert.match(home, /home\.recipeInspiration/);
  assert.match(home, /useRecipeRecommendations/);
  assert.match(home, /homeListCardState/);
  assert.doesNotMatch(home, /QuickActionCard/);

  const catalog = readFileSync(join(root, 'src/screens/CatalogScreen.tsx'), 'utf8');
  assert.doesNotMatch(catalog, /catalog\.landingIntro/);

  const account = readFileSync(join(root, 'src/screens/InsightsScreen.tsx'), 'utf8');
  assert.doesNotMatch(account, /home\.openBasket/);
  assert.match(account, /account\.viewFullHistory/);
});
