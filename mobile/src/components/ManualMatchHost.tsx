import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useShoppingList } from '../context/ShoppingListContext';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import {
  basketAvailabilityForMatch,
  buildMatchReviewPairing,
  currentAccountScope,
  eligibleManualMatchEntries,
  matchStepAfterChangeSelection,
  matchStepAfterSelectingOption,
  resolveAfterAddReviewNote,
  resolveBasketReviewProduct,
  shouldCommitMatchConfirm,
  shouldDiscardMatchSession,
  type ManualMatchFailure,
  type ManualMatchStep,
} from '../lib/manualListMatch';
import { PrimaryButton } from './PrimaryButton';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { friendlyErrorMessage } from '../lib/errors';

function failureMessageKey(reason: ManualMatchFailure): TranslationKey {
  if (reason === 'stale_account') return 'list.matchStale';
  if (reason === 'product_missing') return 'list.matchBasketGone';
  if (reason === 'basket_unknown') return 'list.matchBasketUnknown';
  if (reason === 'entry_missing' || reason === 'entry_checked' || reason === 'entry_linked') {
    return 'list.matchEntryGone';
  }
  return 'list.addFailed';
}

export function ManualMatchHost() {
  const { t } = useI18n();
  const { customer, accountGeneration } = useAuth();
  const { cart, loading: cartLoading, error: cartError, refresh } = useCart();
  const {
    items,
    pendingMatch,
    dismissPendingMatch,
    confirmManualMatch,
    setNotice,
  } = useShoppingList();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [step, setStep] = useState<ManualMatchStep>('pick');
  const [busy, setBusy] = useState(false);

  const current = currentAccountScope(customer?.id ?? null, accountGeneration);
  const stale = pendingMatch ? shouldDiscardMatchSession(pendingMatch.started, current) : false;
  const visible = Boolean(pendingMatch) && !stale;

  useEffect(() => {
    if (stale) dismissPendingMatch();
  }, [dismissPendingMatch, stale]);

  useEffect(() => {
    setSelectedId(null);
    setStep('pick');
    setBusy(false);
  }, [pendingMatch]);

  useEffect(() => {
    if (pendingMatch?.kind !== 'fromBasket') return;
    void refresh();
  }, [pendingMatch?.kind, refresh]);

  const entries = useMemo(() => eligibleManualMatchEntries(items), [items]);
  const basketState = useMemo(
    () => basketAvailabilityForMatch({ loading: cartLoading, error: cartError, cart }),
    [cart, cartError, cartLoading],
  );

  const onDismiss = () => {
    if (busy) return;
    const previous = dismissPendingMatch();
    if (previous?.kind === 'afterAdd' && !previous.listSynced) {
      setNotice({
        name: previous.productName,
        productId: previous.productId,
        listSynced: false,
      });
    }
  };

  const onConfirm = async () => {
    if (!pendingMatch || !shouldCommitMatchConfirm({ step, busy, selectedId })) return;
    const entryId = pendingMatch.kind === 'fromBasket' ? pendingMatch.entryId : selectedId;
    if (!entryId) return;
    const selectedProductId = pendingMatch.kind === 'fromBasket' ? selectedId ?? undefined : undefined;
    if (pendingMatch.kind === 'fromBasket' && !selectedProductId) return;
    setBusy(true);
    try {
      const result = await confirmManualMatch({
        entryId,
        selectedProductId,
        cart,
        basketKnown: basketState.status === 'ready' || basketState.status === 'empty',
      });
      if (!result.ok) {
        if (result.reason === 'cancelled') return;
        Alert.alert(t('list.addFailed'), t(failureMessageKey(result.reason)));
        if (result.reason === 'stale_account') return;
        return;
      }
      if (pendingMatch.kind === 'afterAdd' && !pendingMatch.listSynced) {
        setNotice({
          name: pendingMatch.productName,
          productId: pendingMatch.productId,
          listSynced: false,
        });
      }
    } catch (error) {
      Alert.alert(t('list.addFailed'), friendlyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (!visible || !pendingMatch) return null;

  const isAfterAdd = pendingMatch.kind === 'afterAdd';
  const title = isAfterAdd ? t('list.matchTitle') : t('list.matchBasketTitle');
  const selectedNote = isAfterAdd ? resolveAfterAddReviewNote(entries, selectedId) : null;
  const quantityNoteLabel = isAfterAdd ? selectedNote?.label ?? '' : pendingMatch.entryLabel;
  const quantityNoteQty = isAfterAdd ? selectedNote?.quantity ?? 0 : pendingMatch.entryQuantity;
  const options = isAfterAdd
    ? entries
    : basketState.status === 'ready'
      ? basketState.products.map((product) => ({
          id: product.productId,
          label: product.name,
          quantity: product.quantity,
        }))
      : [];

  const review = (() => {
    if (!selectedId) return null;
    if (isAfterAdd) {
      return buildMatchReviewPairing({
        productLabel: pendingMatch.productName,
        noteLabel: selectedNote?.label,
      });
    }
    const product =
      basketState.status === 'ready'
        ? resolveBasketReviewProduct(basketState.products, selectedId)
        : null;
    return buildMatchReviewPairing({
      productLabel: product?.name,
      noteLabel: pendingMatch.entryLabel,
    });
  })();
  const showReview = step === 'review' && review != null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <View style={styles.scrim}>
        <View style={styles.card} accessibilityLabel={title}>
          <Text style={styles.title}>{title}</Text>
          {showReview && review ? (
            <>
              <Text style={styles.kicker}>{t('list.matchProductLabel')}</Text>
              <Text style={styles.pairing} accessibilityRole="text">
                {review.productLabel}
              </Text>
              <Text style={styles.kicker}>{t('list.matchNoteLabel')}</Text>
              <Text style={styles.pairing} accessibilityRole="text">
                {review.noteLabel}
              </Text>
              <Text style={styles.body}>{t('list.matchFulfilsNote')}</Text>
              {quantityNoteQty > 1 ? (
                <Text style={styles.note}>
                  {t('list.matchQuantityNote', {
                    quantity: quantityNoteQty,
                    label: quantityNoteLabel,
                  })}
                </Text>
              ) : null}
              {isAfterAdd ? (
                <Text style={styles.note}>{t('list.matchCancelKeepsProduct')}</Text>
              ) : null}
            </>
          ) : (
            <>
              {isAfterAdd ? (
                <>
                  <Text style={styles.kicker}>{t('list.matchProductLabel')}</Text>
                  <Text style={styles.pairing} accessibilityRole="text">
                    {pendingMatch.productName}
                  </Text>
                  <Text style={styles.body}>{t('list.matchSelectEntry')}</Text>
                  <Text style={styles.note}>{t('list.matchCancelKeepsProduct')}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.body}>
                    {t('list.matchBasketBody', { label: pendingMatch.entryLabel })}
                  </Text>
                  {quantityNoteQty > 1 ? (
                    <Text style={styles.note}>
                      {t('list.matchQuantityNote', {
                        quantity: quantityNoteQty,
                        label: quantityNoteLabel,
                      })}
                    </Text>
                  ) : null}
                  {basketState.status === 'empty' ? (
                    <Text style={styles.note}>{t('list.matchBasketEmpty')}</Text>
                  ) : null}
                  {basketState.status === 'unknown' ? (
                    <Text style={styles.note}>{t('list.matchBasketUnknown')}</Text>
                  ) : null}
                </>
              )}

              {options.length ? (
                <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                  {options.map((option) => {
                    const selected = selectedId === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => {
                          if (busy) return;
                          setSelectedId(option.id);
                          setStep(matchStepAfterSelectingOption());
                        }}
                        style={[styles.option, selected && styles.optionOn]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={
                          option.quantity > 1
                            ? `${option.label}, ${t('list.quantity', { quantity: option.quantity })}`
                            : option.label
                        }
                        accessibilityHint={t('list.matchReviewHint')}
                      >
                        <View style={[styles.radio, selected && styles.radioOn]} />
                        <View style={styles.optionText}>
                          <Text style={styles.optionLabel}>{option.label}</Text>
                          {option.quantity > 1 ? (
                            <Text style={styles.optionMeta}>
                              {t('list.quantity', { quantity: option.quantity })}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
            </>
          )}

          <View style={styles.actions}>
            {showReview ? (
              <>
                <PrimaryButton
                  label={t('list.matchConfirmMatch')}
                  onPress={() => void onConfirm()}
                  loading={busy}
                  disabled={!shouldCommitMatchConfirm({ step, busy, selectedId })}
                  accessibilityHint={t('list.matchFulfilsNote')}
                />
                <PrimaryButton
                  label={t('list.matchChangeSelection')}
                  onPress={() => setStep(matchStepAfterChangeSelection())}
                  variant="outline"
                  disabled={busy}
                />
              </>
            ) : null}
            <PrimaryButton
              label={t('common.cancel')}
              onPress={onDismiss}
              variant="outline"
              disabled={busy}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.screen,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '85%',
  },
  title: { ...typography.heading, fontSize: 18, marginBottom: spacing.sm },
  kicker: { ...typography.label, color: colors.textMuted, marginTop: spacing.sm },
  pairing: { ...typography.body, fontWeight: '700', marginBottom: spacing.sm, flexShrink: 1 },
  body: { ...typography.body, marginBottom: spacing.sm },
  note: { ...typography.caption, color: colors.primaryDark, marginBottom: spacing.md },
  list: { maxHeight: 240, marginBottom: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  radioOn: { backgroundColor: colors.primary },
  optionText: { flex: 1, minWidth: 0 },
  optionLabel: { ...typography.body, fontWeight: '600' },
  optionMeta: { ...typography.caption, marginTop: 2 },
  actions: { gap: spacing.sm },
});
