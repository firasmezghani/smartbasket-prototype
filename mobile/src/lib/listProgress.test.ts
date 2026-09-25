import test from 'node:test';
import assert from 'node:assert/strict';

import { listProgressWordKeys } from './listProgress';

test('French-style progress uses singular words only for a count of one', () => {
  assert.deepEqual(listProgressWordKeys(0, 9), {
    collectedKey: 'list.progressCollected',
    remainingKey: 'list.progressRemaining',
  });
  assert.deepEqual(listProgressWordKeys(1, 1), {
    collectedKey: 'list.progressCollectedOne',
    remainingKey: 'list.progressRemainingOne',
  });
  assert.deepEqual(listProgressWordKeys(1, 8), {
    collectedKey: 'list.progressCollectedOne',
    remainingKey: 'list.progressRemaining',
  });
  assert.deepEqual(listProgressWordKeys(2, 0), {
    collectedKey: 'list.progressCollected',
    remainingKey: 'list.progressRemaining',
  });
});
