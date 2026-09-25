import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useShoppingList } from '../context/ShoppingListContext';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import {
  currentAccountScope,
  shouldDiscardMatchSession,
  type ManualMatchFailure,
} from '../lib/manualListMatch';
import { matchStepAfterChangeSelection, matchStepAfterSelectingOption, shouldCommitMatchConfirm, type ManualMatchStep } from '../lib/manualListMatch';
import {
  genericTypeLabelKey,
  isSupportedGenericType,
  onePackageDoesNotCompleteQuantity,
} from '../lib/genericChecklist';
import { PrimaryButton } from './PrimaryButton';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

function failureMessageKey(reason: ManualMatchFailure): TranslationKey {
  if (reason === 'stale_account') return 'list.matchStale';
  if (reason === 'entry_missing' || reason === 'entry_checked' || reason === 'entry_linked') {
    return 'list.matchEntryGone';
  }
  return 'list.addFailed';
}

export function GenericMatchHost() {
  const { t } = useI18n();
  const { customer, accountGeneration } = useAuth();
  const { pendingGenericMatch, dismissPendingGenericMatch, confirmGenericMatch } = useShoppingList();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [step, setStep] = useState<ManualMatchStep>('pick');
  const [busy, setBusy] = useState(false);

  const current = currentAccountScope(customer?.id ?? null, accountGeneration);
  const stale = pendingGenericMatch
    ? shouldDiscardMatchSession(pendingGenericMatch.started, current)
    : false;
  const visible = Boolean(pendingGenericMatch) && !stale;
  const candidates = pendingGenericMatch?.candidates ?? [];
  const single = candidates.length === 1;
  const typeName = pendingGenericMatch
    ? isSupportedGenericType(pendingGenericMatch.productCanonicalType)
      ? t(genericTypeLabelKey(pendingGenericMatch.productCanonicalType))
      : pendingGenericMatch.candidates[0]?.label || pendingGenericMatch.productName
    : '';

  useEffect(() => {
    if (stale) dismissPendingGenericMatch();
  }, [dismissPendingGenericMatch, stale]);

  useEffect(() => {
    if (!pendingGenericMatch) {
      setSelectedId(null);
      setStep('pick');
      setBusy(false);
      return;
    }
    if (pendingGenericMatch.candidates.length === 1) {
      setSelectedId(pendingGenericMatch.candidates[0]!.id);
      setStep('review');
    } else {
      setSelectedId(null);
      setStep('pick');
    }
    setBusy(false);
  }, [pendingGenericMatch]);

  if (!visible || !pendingGenericMatch) return null;

  const selected = candidates.find((row) => row.id === selectedId) ?? null;

  const onDismiss = () => {
    if (busy) return;
    dismissPendingGenericMatch();
  };

  const onConfirm = async () => {
    if (!shouldCommitMatchConfirm({ step, busy, selectedId })) return;
    setBusy(true);
    try {
      const result = await confirmGenericMatch({ entryId: selectedId! });
      if (!result.ok) {
        if (result.reason === 'cancelled') return;
        Alert.alert(t('list.addFailed'), t(failureMessageKey(result.reason)));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View
          style={styles.card}
          accessibilityViewIsModal
        >
          <Text style={styles.title} accessibilityRole="header">
            {single
              ? t('list.genericConfirmTitle', { name: typeName })
              : t('list.genericSelectTitle', { name: typeName })}
          </Text>
          <Text style={styles.package}>{pendingGenericMatch.packageLabel}</Text>
          <Text style={styles.already}>{t('list.genericAlreadyInBasket')}</Text>
          {step === 'pick' ? (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {candidates.map((row) => (
                <Pressable
                  key={row.id}
                  onPress={() => {
                    setSelectedId(row.id);
                    setStep(matchStepAfterSelectingOption());
                  }}
                  style={styles.option}
                  accessibilityRole="button"
                  accessibilityLabel={row.label}
                >
                  <Text style={styles.optionLabel}>{row.label}</Text>
                  {onePackageDoesNotCompleteQuantity(row.quantity) ? (
                    <Text style={styles.note}>
                      {t('list.genericQuantityNote', { quantity: row.quantity })}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.review}>
              {!single && selected ? <Text style={styles.package}>{selected.label}</Text> : null}
              {selected && onePackageDoesNotCompleteQuantity(selected.quantity) ? (
                <Text style={styles.note}>
                  {t('list.genericQuantityNote', { quantity: selected.quantity })}
                </Text>
              ) : null}
            </View>
          )}
          {step === 'review' ? (
            <>
              <PrimaryButton
                label={t('list.genericConfirm')}
                onPress={() => void onConfirm()}
                loading={busy}
                disabled={busy}
                accessibilityHint={t('list.markGenericHint')}
              />
              {!single ? (
                <PrimaryButton
                  label={t('list.genericChangeSelection')}
                  onPress={() => {
                    if (busy) return;
                    setStep(matchStepAfterChangeSelection());
                  }}
                  variant="outline"
                  disabled={busy}
                />
              ) : null}
            </>
          ) : null}
          <PrimaryButton
            label={t('common.notNow')}
            onPress={onDismiss}
            variant="outline"
            disabled={busy}
            accessibilityHint={t('list.genericNotNowHint')}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
    padding: spacing.screen,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { ...typography.heading, fontSize: 18 },
  package: { ...typography.body, fontWeight: '600' },
  already: { ...typography.caption, color: colors.textMuted },
  list: { maxHeight: 220 },
  option: {
    minHeight: 48,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionLabel: { ...typography.body, fontWeight: '600' },
  note: { ...typography.caption, marginTop: 4 },
  review: { marginBottom: spacing.sm },
});
