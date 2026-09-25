import test from 'node:test';
import assert from 'node:assert/strict';

import { captureAccountScope } from './accountScope';
import { applyCollectedMarks } from './shoppingListBatch';
import type { ShoppingListItem } from '../types/shoppingList';
import {
  basketAvailabilityForMatch,
  basketProductsForMatch,
  buildMatchReviewPairing,
  eligibleManualMatchEntries,
  evaluateAddChecklistFeedback,
  evaluateManualMatchCommit,
  addedCheckedNoticeKey,
  addChecklistNoticeCopy,
  resolveAddChecklistNoticeView,
  matchStepAfterChangeSelection,
  matchStepAfterSelectingOption,
  persistConfirmedManualMatch,
  previewUncheckedItems,
  productStillInBasket,
  resolveAfterAddReviewNote,
  resolveBasketReviewProduct,
  shouldCommitMatchConfirm,
  shouldDiscardMatchSession,
  shouldDismissMatchAfterFailure,
  uncheckedManualEntries,
} from './manualListMatch';
import { inspectLinkedCollect } from './shoppingListBatch';

function item(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id: 'id-1',
    label: 'Milk',
    quantity: 1,
    checked: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const manuals = [
  item({ id: 'milk', label: 'Milk', quantity: 2 }),
  item({ id: 'rice', label: 'Rice' }),
];

const linked = item({ id: 'linked', label: 'Milk 1L', productId: 'sku-milk' });

test('exact linked entries still check automatically; similar manual names do not', () => {
  const current = [item({ id: 'manual', productId: undefined, label: 'Milk' }), linked];
  const auto = applyCollectedMarks(current, { productId: 'sku-milk', nowIso: 't' });
  assert.equal(auto.nextItems.find((row) => row.id === 'linked')?.checked, true);
  assert.equal(auto.nextItems.find((row) => row.id === 'manual')?.checked, false);
  assert.equal(auto.extraMarked, false);
});

test('exact linked eggs match with unrelated manual Rice remaining does not open assignment', () => {
  const current = [
    item({ id: 'eggs', label: 'Eggs', productId: 'sku-eggs' }),
    item({ id: 'rice', label: 'Rice', productId: undefined }),
  ];
  const inspect = inspectLinkedCollect(current, { productId: 'sku-eggs', nowIso: 't' });
  assert.equal(inspect.kind, 'newly_checked');
  assert.equal(inspect.nextItems.find((row) => row.id === 'eggs')?.checked, true);
  assert.equal(inspect.nextItems.find((row) => row.id === 'rice')?.checked, false);
  assert.equal(inspect.remainingUnchecked, 1);
  assert.equal(inspect.eligibleManualCount, 1);
  const feedback = evaluateAddChecklistFeedback({
    addConfirmed: true,
    listSynced: true,
    collectKind: inspect.kind,
    remainingUnchecked: inspect.remainingUnchecked,
    eligibleManualCount: inspect.eligibleManualCount,
  });
  assert.equal(feedback.openMatchDialog, false);
  assert.equal(feedback.offerMatchAction, false);
  assert.equal(feedback.noticeKind, 'checked');
  assert.equal(feedback.remaining, 1);
  assert.equal(addedCheckedNoticeKey(1), 'list.noticeCheckedDetailOne');
  assert.equal(addedCheckedNoticeKey(0), 'list.noticeCheckedDetailZero');
  assert.equal(addedCheckedNoticeKey(2), 'list.noticeCheckedDetailOther');
  const checkedView = resolveAddChecklistNoticeView({ kind: 'checked', name: 'Eggs', remaining: 1 });
  assert.equal(checkedView.headingKey, 'list.noticeCheckedHeading');
  assert.equal(checkedView.detailKey, 'list.noticeCheckedDetailOne');
  assert.equal(checkedView.tone, 'success');
  assert.equal(checkedView.autoDismiss, true);
  assert.equal(checkedView.params.remaining, 1);
  assert.equal(
    addChecklistNoticeCopy({ kind: 'already', name: 'Eggs' }).headingKey,
    'list.noticeAddedToBasket',
  );
  assert.equal(addChecklistNoticeCopy({ kind: 'added', name: 'Eggs' }).detailKey, 'list.noticeAddedDetail');
  const failedView = addChecklistNoticeCopy({ kind: 'list_failed', name: 'Eggs', remaining: 1 });
  assert.equal(failedView.headingKey, 'list.noticePartialHeading');
  assert.equal(failedView.tone, 'partial');
  assert.equal(failedView.autoDismiss, false);
  const matchView = resolveAddChecklistNoticeView({
    kind: 'added',
    name: 'Milk',
    offerMatch: true,
  });
  assert.equal(matchView.autoDismiss, false);
  assert.equal(matchView.tone, 'success');
  const unresolvedView = resolveAddChecklistNoticeView({
    kind: 'unresolved',
    name: 'Eggs',
    listSynced: true,
  });
  assert.equal(unresolvedView.tone, 'unresolved');
  assert.equal(unresolvedView.headingKey, 'list.noticeUnresolvedHeading');
  assert.equal(unresolvedView.autoDismiss, false);
});

test('exact entry already checked does not claim a new completion or open matching', () => {
  const current = [
    item({ id: 'eggs', label: 'Eggs', productId: 'sku-eggs', checked: true }),
    item({ id: 'rice', label: 'Rice', productId: undefined }),
  ];
  const inspect = inspectLinkedCollect(current, { productId: 'sku-eggs', nowIso: 't' });
  assert.equal(inspect.kind, 'already_checked');
  assert.equal(inspect.marked, 0);
  const feedback = evaluateAddChecklistFeedback({
    addConfirmed: true,
    listSynced: true,
    collectKind: inspect.kind,
    remainingUnchecked: inspect.remainingUnchecked,
    eligibleManualCount: inspect.eligibleManualCount,
  });
  assert.equal(feedback.noticeKind, 'already');
  assert.equal(feedback.offerMatchAction, false);
  assert.equal(feedback.openMatchDialog, false);
  assert.equal(feedback.remaining, undefined);
});

test('ordinary untargeted adds do not offer personal-note assignment on the success notice', () => {
  const current = [item({ id: 'rice', label: 'Rice', productId: undefined })];
  const inspect = inspectLinkedCollect(current, { productId: 'sku-eggs', nowIso: 't' });
  assert.equal(inspect.kind, 'none');
  const feedback = evaluateAddChecklistFeedback({
    addConfirmed: true,
    listSynced: true,
    collectKind: inspect.kind,
    remainingUnchecked: inspect.remainingUnchecked,
    eligibleManualCount: inspect.eligibleManualCount,
  });
  assert.equal(feedback.noticeKind, 'added');
  assert.equal(feedback.offerMatchAction, false);
  assert.equal(feedback.offerGenericMatchAction, false);
  assert.equal(feedback.openMatchDialog, false);
});

test('compatible generic entries are offered only when there is no exact product match', () => {
  const offered = evaluateAddChecklistFeedback({
    addConfirmed: true,
    listSynced: true,
    collectKind: 'none',
    remainingUnchecked: 1,
    eligibleManualCount: 0,
    genericCandidateCount: 1,
  });
  assert.equal(offered.noticeKind, null);
  assert.equal(offered.offerGenericMatchAction, false);
  assert.equal(offered.openMatchDialog, true);
  assert.equal(offered.offerMatchAction, false);
  const targeted = evaluateAddChecklistFeedback({
    addConfirmed: true,
    listSynced: true,
    collectKind: 'none',
    remainingUnchecked: 1,
    eligibleManualCount: 0,
    genericCandidateCount: 2,
    extraItemId: 'g-milk',
    targetedScan: true,
    genericExtraMarked: true,
  });
  assert.equal(targeted.offerGenericMatchAction, false);
  assert.equal(targeted.openMatchDialog, false);
  assert.equal(targeted.noticeKind, 'checked');
  const several = evaluateAddChecklistFeedback({
    addConfirmed: true,
    listSynced: true,
    collectKind: 'none',
    remainingUnchecked: 2,
    eligibleManualCount: 0,
    genericCandidateCount: 2,
  });
  assert.equal(several.openMatchDialog, true);
  assert.equal(several.noticeKind, null);
});

test('no eligible manual notes means no matching action', () => {
  const onlyLinked = [item({ id: 'eggs', label: 'Eggs', productId: 'sku-eggs', checked: true })];
  const inspect = inspectLinkedCollect(onlyLinked, { productId: 'sku-bread', nowIso: 't' });
  const feedback = evaluateAddChecklistFeedback({
    addConfirmed: true,
    listSynced: true,
    collectKind: inspect.kind,
    remainingUnchecked: inspect.remainingUnchecked,
    eligibleManualCount: inspect.eligibleManualCount,
  });
  assert.equal(feedback.offerMatchAction, false);
  assert.equal(feedback.openMatchDialog, false);
});

test('targeted manual scan does not show a second matching prompt', () => {
  const feedback = evaluateAddChecklistFeedback({
    addConfirmed: true,
    listSynced: true,
    collectKind: 'none',
    remainingUnchecked: 1,
    eligibleManualCount: 1,
    extraItemId: 'rice',
    targetedScan: true,
  });
  assert.equal(feedback.openMatchDialog, false);
  assert.equal(feedback.offerMatchAction, false);
  assert.equal(feedback.noticeKind, 'added');
});

test('checklist save failure never claims checked off or falls through to matching', () => {
  const failed = evaluateAddChecklistFeedback({
    addConfirmed: true,
    listSynced: false,
    collectKind: 'newly_checked',
    remainingUnchecked: 1,
    eligibleManualCount: 1,
    genericCandidateCount: 2,
  });
  assert.equal(failed.noticeKind, 'list_failed');
  assert.equal(failed.offerMatchAction, false);
  assert.equal(failed.openMatchDialog, false);
  assert.equal(failed.remaining, undefined);
});

test('account changes while feedback is pending discard the session', () => {
  const startedA1 = captureAccountScope('A', 1);
  assert.equal(shouldDiscardMatchSession(startedA1, captureAccountScope('B', 2)), true);
  assert.equal(shouldDiscardMatchSession(startedA1, captureAccountScope('A', 3)), true);
  assert.equal(shouldDiscardMatchSession(startedA1, captureAccountScope('A', 1)), false);
});

test('unresolved additions do not present confirmed matching actions', () => {
  const unresolved = evaluateAddChecklistFeedback({
    addConfirmed: false,
    listSynced: true,
    collectKind: 'none',
    remainingUnchecked: 1,
    eligibleManualCount: 1,
  });
  assert.equal(unresolved.noticeKind, null);
  assert.equal(unresolved.offerMatchAction, false);
  assert.equal(unresolved.openMatchDialog, false);
});

test('after a confirmed catalogue/demo or general-scan add, remaining manuals stay off the notice', () => {
  assert.deepEqual(
    eligibleManualMatchEntries([...manuals, linked, item({ id: 'done', label: 'Butter', checked: true })]).map(
      (row) => row.id,
    ),
    ['milk', 'rice'],
  );
  const inspect = inspectLinkedCollect([...manuals, linked], { productId: 'sku-other', nowIso: 't' });
  assert.equal(inspect.eligibleManualCount, 2);
  assert.equal(
    evaluateAddChecklistFeedback({
      addConfirmed: true,
      listSynced: true,
      collectKind: inspect.kind,
      remainingUnchecked: inspect.remainingUnchecked,
      eligibleManualCount: inspect.eligibleManualCount,
    }).offerMatchAction,
    false,
  );
});

test('uncheckedManualEntries treats a missing list as empty', () => {
  assert.equal(uncheckedManualEntries(undefined).length, 0);
});

test('matching an existing basket product never posts to the basket', async () => {
  let posts = 0;
  let marks = 0;
  const evaluation = evaluateManualMatchCommit({
    started: captureAccountScope('A', 1),
    current: captureAccountScope('A', 1),
    items: manuals,
    entryId: 'milk',
    requireProductInBasket: {
      productId: 'sku-milk',
      cart: { items: [{ productId: 'sku-milk', productName: 'Farm Milk', quantity: 1 }] },
      basketKnown: true,
    },
  });
  assert.equal(evaluation.ok, true);
  const result = await persistConfirmedManualMatch({
    evaluation,
    markList: async (extraItemId) => {
      assert.equal(extraItemId, 'milk');
      marks += 1;
    },
    addToBasket: async () => {
      posts += 1;
    },
  });
  assert.equal(result.listMarked, true);
  assert.equal(result.basketPosted, false);
  assert.equal(marks, 1);
  assert.equal(posts, 0);
});

test('list-storage failure retries only checklist persistence', async () => {
  let posts = 0;
  await assert.rejects(
    () =>
      persistConfirmedManualMatch({
        evaluation: { ok: true, extraItemId: 'rice' },
        markList: async () => {
          throw new Error('Could not save your shopping list. Please try again.');
        },
        addToBasket: async () => {
          posts += 1;
        },
      }),
    /Could not save/,
  );
  assert.equal(posts, 0);

  const skipped = await persistConfirmedManualMatch({
    evaluation: { ok: false, reason: 'cancelled' },
    markList: async () => {
      throw new Error('should not mark on cancel');
    },
    addToBasket: async () => {
      posts += 1;
    },
  });
  assert.equal(skipped.listMarked, false);
  assert.equal(skipped.basketPosted, false);
  assert.equal(skipped.reason, 'cancelled');
  assert.equal(posts, 0);
});

test('account changes during matching, including A→B→A, discard the session', () => {
  const startedA1 = captureAccountScope('A', 1);
  const b = captureAccountScope('B', 2);
  const a2 = captureAccountScope('A', 3);
  assert.equal(shouldDiscardMatchSession(startedA1, b), true);
  assert.equal(shouldDiscardMatchSession(startedA1, a2), true);
  assert.equal(shouldDiscardMatchSession(startedA1, captureAccountScope('A', 1)), false);

  const stale = evaluateManualMatchCommit({
    started: startedA1,
    current: a2,
    items: manuals,
    entryId: 'milk',
  });
  assert.deepEqual(stale, { ok: false, reason: 'stale_account' });
});

test('stale, deleted, completed entries and products removed from the basket cannot confirm', () => {
  const started = captureAccountScope('A', 1);
  const current = captureAccountScope('A', 1);
  const cart = { items: [{ productId: 'sku-milk', productName: 'Farm Milk', quantity: 2 }] };

  assert.equal(
    evaluateManualMatchCommit({
      started,
      current,
      items: manuals,
      entryId: 'gone',
    }).ok,
    false,
  );
  assert.equal(
    evaluateManualMatchCommit({
      started,
      current,
      items: [item({ id: 'milk', label: 'Milk', checked: true })],
      entryId: 'milk',
    }).ok,
    false,
  );
  assert.equal(
    evaluateManualMatchCommit({
      started,
      current,
      items: [linked],
      entryId: 'linked',
    }).ok,
    false,
  );
  assert.equal(
    evaluateManualMatchCommit({
      started,
      current,
      items: manuals,
      entryId: 'milk',
      requireProductInBasket: { productId: 'sku-milk', cart: { items: [] }, basketKnown: true },
    }).ok,
    false,
  );
  assert.equal(
    evaluateManualMatchCommit({
      started,
      current,
      items: manuals,
      entryId: 'milk',
      requireProductInBasket: { productId: 'sku-gone', cart, basketKnown: true },
    }).ok,
    false,
  );
  assert.equal(
    evaluateManualMatchCommit({
      started,
      current,
      items: manuals,
      entryId: 'milk',
      requireProductInBasket: { productId: 'sku-milk', cart: null, basketKnown: false },
    }).ok,
    false,
  );
  assert.equal(
    evaluateManualMatchCommit({
      started,
      current,
      items: manuals,
      entryId: 'milk',
      requireProductInBasket: { productId: 'SKU-MILK', cart, basketKnown: true },
    }).ok,
    true,
  );
});

test('unresolved adds are not treated as confirmed matches; cancelling leaves the list unchanged', () => {
  const original = manuals.map((row) => ({ ...row }));
  const skipped = evaluateManualMatchCommit({
    started: captureAccountScope('A', 1),
    current: captureAccountScope('A', 1),
    items: original,
    entryId: '',
  });
  assert.deepEqual(skipped, { ok: false, reason: 'entry_missing' });
  assert.equal(original[0].checked, false);
  assert.equal(original[1].checked, false);
});

test('basket product listing uses current lines only and does not invent rows', () => {
  assert.deepEqual(basketProductsForMatch(null), []);
  assert.deepEqual(
    basketProductsForMatch({
      items: [
        { productId: 'a', productName: 'Apples', quantity: 2 },
        { productId: 'A', productName: 'Apples bag', quantity: 1 },
        { productId: '  ', productName: 'Skip' },
        { productId: 'b', productName: '  ', productCode: 'B-1', quantity: 3 },
      ],
    }),
    [
      { productId: 'a', name: 'Apples', quantity: 2 },
      { productId: 'b', name: 'B-1', quantity: 3 },
    ],
  );
  assert.equal(productStillInBasket({ items: [{ productId: 'a' }] }, 'A'), true);
  assert.equal(productStillInBasket({ items: [{ productId: 'a' }] }, 'z'), false);
  assert.equal(basketAvailabilityForMatch({ loading: true, cart: { items: [] } }).status, 'unknown');
  assert.equal(basketAvailabilityForMatch({ loading: false, error: 'fail', cart: { items: [] } }).status, 'unknown');
  assert.equal(basketAvailabilityForMatch({ loading: false, cart: { items: [] } }).status, 'empty');
  assert.equal(
    basketAvailabilityForMatch({
      loading: false,
      cart: { items: [{ productId: 'a', productName: 'Apples', quantity: 1 }] },
    }).status,
    'ready',
  );
});

test('home preview shows at most three remaining entries and excludes completed', () => {
  const list = [
    item({ id: '1', label: 'A', checked: true }),
    item({ id: '2', label: 'B' }),
    item({ id: '3', label: 'C' }),
    item({ id: '4', label: 'D' }),
    item({ id: '5', label: 'E' }),
  ];
  assert.deepEqual(
    previewUncheckedItems(list, 3).map((row) => row.label),
    ['B', 'C', 'D'],
  );
});

test('selecting a manual match does not persist until confirmation', async () => {
  assert.equal(matchStepAfterSelectingOption(), 'review');
  assert.equal(
    shouldCommitMatchConfirm({ step: 'pick', busy: false, selectedId: 'milk' }),
    false,
  );
  assert.equal(
    shouldCommitMatchConfirm({ step: 'review', busy: false, selectedId: 'milk' }),
    true,
  );
  assert.equal(
    shouldCommitMatchConfirm({ step: 'review', busy: true, selectedId: 'milk' }),
    false,
  );
  let marks = 0;
  const skipped = await persistConfirmedManualMatch({
    evaluation: { ok: false, reason: 'cancelled' },
    markList: async () => {
      marks += 1;
    },
  });
  assert.equal(skipped.listMarked, false);
  assert.equal(marks, 0);
});

test('change selection and cancellation cause no checklist write', async () => {
  assert.equal(matchStepAfterChangeSelection(), 'pick');
  const original = manuals.map((row) => ({ ...row }));
  const cancelled = await persistConfirmedManualMatch({
    evaluation: { ok: false, reason: 'cancelled' },
    markList: async () => {
      throw new Error('should not mark');
    },
    addToBasket: async () => {
      throw new Error('should not post');
    },
  });
  assert.equal(cancelled.listMarked, false);
  assert.equal(cancelled.basketPosted, false);
  assert.equal(original[0].checked, false);
  assert.equal(buildMatchReviewPairing({ productLabel: 'Farm Milk 1L', noteLabel: 'milk' })?.noteLabel, 'milk');
  assert.equal(buildMatchReviewPairing({ productLabel: 'Farm Milk 1L', noteLabel: '  ' }), null);
});

test('confirmation updates only the intended eligible note and performs no basket POST', async () => {
  let posts = 0;
  const evaluation = evaluateManualMatchCommit({
    started: captureAccountScope('A', 1),
    current: captureAccountScope('A', 1),
    items: [...manuals, linked],
    entryId: 'rice',
  });
  const result = await persistConfirmedManualMatch({
    evaluation,
    markList: async (extraItemId) => {
      assert.equal(extraItemId, 'rice');
    },
    addToBasket: async () => {
      posts += 1;
    },
  });
  assert.equal(result.listMarked, true);
  assert.equal(result.basketPosted, false);
  assert.equal(posts, 0);
  assert.equal(resolveAfterAddReviewNote(eligibleManualMatchEntries([...manuals, linked]), 'linked'), null);
  assert.equal(resolveAfterAddReviewNote(eligibleManualMatchEntries(manuals), 'rice')?.label, 'Rice');
  assert.equal(
    resolveBasketReviewProduct([{ productId: 'sku-milk', name: 'Farm Milk 1L', quantity: 1 }], 'SKU-MILK')?.name,
    'Farm Milk 1L',
  );
});

test('repeated confirmation, storage failure and retry do not duplicate mutations', async () => {
  let marks = 0;
  const first = evaluateManualMatchCommit({
    started: captureAccountScope('A', 1),
    current: captureAccountScope('A', 1),
    items: manuals,
    entryId: 'milk',
  });
  await persistConfirmedManualMatch({
    evaluation: first,
    markList: async () => {
      marks += 1;
    },
  });
  const afterCheck = [
    item({ id: 'milk', label: 'Milk', quantity: 2, checked: true }),
    item({ id: 'rice', label: 'Rice' }),
  ];
  const again = evaluateManualMatchCommit({
    started: captureAccountScope('A', 1),
    current: captureAccountScope('A', 1),
    items: afterCheck,
    entryId: 'milk',
  });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.reason, 'entry_checked');
  const skipped = await persistConfirmedManualMatch({
    evaluation: again,
    markList: async () => {
      marks += 1;
    },
  });
  assert.equal(skipped.listMarked, false);
  assert.equal(marks, 1);
  assert.equal(shouldDismissMatchAfterFailure('entry_checked'), true);
  assert.equal(shouldDismissMatchAfterFailure('product_missing'), false);
});

test('linked rows are excluded from manual assignment', () => {
  assert.deepEqual(eligibleManualMatchEntries([linked, item({ id: 'done', label: 'Butter', checked: true })]), []);
  assert.equal(
    evaluateManualMatchCommit({
      started: captureAccountScope('A', 1),
      current: captureAccountScope('A', 1),
      items: [linked],
      entryId: 'linked',
    }).ok,
    false,
  );
});
