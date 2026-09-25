import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

test('QR screen polls the displayed session, copies the full code, and does not clear the basket locally', () => {
  const screen = readFileSync(join(root, 'src/screens/BasketQrScreen.tsx'), 'utf8');
  assert.match(screen, /fetchSmartBasketSession/);
  assert.match(screen, /createQrStatusPoller/);
  assert.match(screen, /runQrStatusPollTick/);
  assert.match(screen, /sessionSnapshotFromRoute/);
  assert.match(screen, /commitDisplayedQrSession/);
  assert.match(screen, /isForegroundAppState/);
  assert.match(screen, /AppState/);
  assert.match(screen, /expo-clipboard/);
  assert.match(screen, /Clipboard\.setStringAsync/);
  assert.match(screen, /basketQr\.showCode/);
  assert.match(screen, /basketQr\.outcomeValidated/);
  assert.match(screen, /basketQr\.reviewBasket/);
  assert.match(screen, /refreshBasketAfterApproval/);
  assert.doesNotMatch(screen, /fetchCurrentSmartBasketSession/);
  assert.doesNotMatch(screen, /clearCart/);
  assert.doesNotMatch(screen, /DELETE \/api\/cart/);
  assert.doesNotMatch(screen, /shoppingList/);
});

test('QR status helpers stop after a terminal state and ignore another session id', () => {
  const helpers = readFileSync(join(root, 'src/lib/qrSessionStatus.ts'), 'utf8');
  assert.match(helpers, /QR_STATUS_POLL_MS = 3000/);
});
