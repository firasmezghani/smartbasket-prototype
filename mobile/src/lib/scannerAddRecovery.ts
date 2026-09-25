// After a scan times out, refresh the basket without sending the add again.

import {
  nextActionAfterAmbiguousAdd,
  type AmbiguousAddDecision,
  type AmbiguousAddRefresh,
} from './scannerSession';

export type ScannerAddRecoveryOutcome =
  | { outcome: 'stale'; allowRepeatAdd: false }
  | { outcome: 'unresolved'; allowRepeatAdd: false; decision: AmbiguousAddDecision }
  | {
      outcome: 'observed';
      allowRepeatAdd: false;
      decision: AmbiguousAddDecision;
      listMarked: boolean;
    }
  | { outcome: 'not_confirmed'; allowRepeatAdd: false; decision: AmbiguousAddDecision };

export async function recoverAmbiguousScannerAdd(opts: {
  productId: string;
  preQuantity: number;
  intendedDelta: number;
  refresh: () => Promise<AmbiguousAddRefresh>;
  // False when the account or generation that started the add has changed.
  isAccountCurrent: () => boolean;
  // Rechecked after every await before UI/navigation/notices.
  isOperationCurrent: () => boolean;
  markCollected: () => Promise<void>;
}): Promise<ScannerAddRecoveryOutcome> {
  if (!opts.isAccountCurrent()) {
    return { outcome: 'stale', allowRepeatAdd: false };
  }

  const refresh = await opts.refresh();
  if (!opts.isOperationCurrent()) {
    return { outcome: 'stale', allowRepeatAdd: false };
  }

  const decision = nextActionAfterAmbiguousAdd({
    productId: opts.productId,
    preQuantity: opts.preQuantity,
    intendedDelta: opts.intendedDelta,
    refresh,
  });

  if (decision.kind === 'unresolved') {
    return { outcome: 'unresolved', allowRepeatAdd: false, decision };
  }

  if (decision.kind === 'observed_expected_quantity') {
    let listMarked = true;
    try {
      await opts.markCollected();
    } catch {
      listMarked = false;
    }
    if (!opts.isOperationCurrent()) {
      return { outcome: 'stale', allowRepeatAdd: false };
    }
    return { outcome: 'observed', allowRepeatAdd: false, decision, listMarked };
  }

  return { outcome: 'not_confirmed', allowRepeatAdd: false, decision };
}
