import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useShoppingList } from '../context/ShoppingListContext';
import { useI18n } from '../i18n/I18nContext';
import { currentAccountScope, shouldDiscardMatchSession } from '../lib/manualListMatch';
import { shouldDismissNoteEditorAfterFailure } from '../lib/personalNoteEdit';
import type { AccountScope } from '../lib/accountScope';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type PersonalNoteEditSession = {
  entryId: string;
  initialLabel: string;
  started: AccountScope;
};

type Props = {
  session: PersonalNoteEditSession | null;
  onClose: () => void;
};

export function PersonalNoteEditHost({ session, onClose }: Props) {
  const { t } = useI18n();
  const { customer, accountGeneration } = useAuth();
  const { updateManualItemLabel } = useShoppingList();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = currentAccountScope(customer?.id ?? null, accountGeneration);
  const stale = session ? shouldDiscardMatchSession(session.started, current) : false;
  const visible = Boolean(session) && !stale;

  useEffect(() => {
    if (stale) onClose();
  }, [onClose, stale]);

  useEffect(() => {
    if (!session) {
      setDraft('');
      setError(null);
      setBusy(false);
      return;
    }
    setDraft(session.initialLabel);
    setError(null);
    setBusy(false);
  }, [session]);

  if (!visible || !session) return null;

  const onDismiss = () => {
    if (busy) return;
    onClose();
  };

  const onSave = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateManualItemLabel({
        entryId: session.entryId,
        nextLabel: draft,
        started: session.started,
      });
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : t('list.saveFailed');
      const reason =
        message === t('list.matchStale') || message === t('list.errorSignInRequired')
          ? 'stale_account'
          : message === t('list.editNoteGone')
            ? 'entry_missing'
            : message === t('list.errorEmptyLabel')
              ? 'empty_label'
              : undefined;
      if (shouldDismissNoteEditorAfterFailure(reason)) {
        Alert.alert(t('list.addFailed'), message);
        onClose();
        return;
      }
      setError(message === t('list.errorEmptyLabel') ? message : t('list.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.backdrop}>
          <View style={styles.card} accessibilityViewIsModal>
            <Text style={styles.title} accessibilityRole="header">
              {t('list.editNoteTitle')}
            </Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
            >
              <FormField
                label={t('list.editNoteField')}
                value={draft}
                onChangeText={(value) => {
                  setDraft(value);
                  if (error) setError(null);
                }}
                error={error}
                hint={t('list.editNoteHint')}
                maxLength={120}
                multiline
                autoFocus
                editable={!busy}
                textAlignVertical="top"
                style={styles.input}
                containerStyle={styles.field}
              />
            </ScrollView>
            <PrimaryButton
              label={t('common.save')}
              onPress={() => void onSave()}
              loading={busy}
              disabled={busy}
            />
            <PrimaryButton
              label={t('common.cancel')}
              onPress={onDismiss}
              variant="outline"
              disabled={busy}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
    maxHeight: '90%',
  },
  title: { ...typography.heading, fontSize: 18 },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: spacing.xs },
  field: { marginBottom: 0 },
  input: { minHeight: 88, textAlignVertical: 'top' },
});
