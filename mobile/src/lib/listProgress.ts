// Shopping-list progress text (French needs plural forms).

export type ListProgressCollectedKey = 'list.progressCollectedOne' | 'list.progressCollected';
export type ListProgressRemainingKey = 'list.progressRemainingOne' | 'list.progressRemaining';

export function listProgressWordKeys(
  completed: number,
  remaining: number,
): {
  collectedKey: ListProgressCollectedKey;
  remainingKey: ListProgressRemainingKey;
} {
  return {
    collectedKey: completed === 1 ? 'list.progressCollectedOne' : 'list.progressCollected',
    remainingKey: remaining === 1 ? 'list.progressRemainingOne' : 'list.progressRemaining',
  };
}
