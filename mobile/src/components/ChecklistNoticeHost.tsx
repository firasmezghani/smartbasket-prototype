import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedbackNotice } from './FeedbackNotice';
import { PrimaryButton } from './PrimaryButton';
import { useAuth } from '../context/AuthContext';
import { useShoppingList } from '../context/ShoppingListContext';
import { useI18n } from '../i18n/I18nContext';
import {
  ADD_NOTICE_AUTO_DISMISS_MS,
  currentAccountScope,
  resolveAddChecklistNoticeView,
  shouldDiscardMatchSession,
} from '../lib/manualListMatch';
import { spacing } from '../theme/spacing';
import { friendlyErrorMessage } from '../lib/errors';

export function ChecklistNoticeHost() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { customer, accountGeneration } = useAuth();
  const {
    notice,
    setNotice,
    offerMatchFromNotice,
    retryNoticeListSync,
  } = useShoppingList();
  const [retrying, setRetrying] = useState(false);

  const current = currentAccountScope(customer?.id ?? null, accountGeneration);
  const stale = notice?.started ? shouldDiscardMatchSession(notice.started, current) : false;
  const view = notice
    ? resolveAddChecklistNoticeView({
        kind: notice.kind,
        name: notice.name,
        remaining: notice.remaining,
        listSynced: notice.listSynced,
        offerMatch: notice.offerMatch,
        offerGenericMatch: notice.offerGenericMatch,
      })
    : null;

  useEffect(() => {
    if (stale) setNotice(null);
  }, [setNotice, stale]);

  useEffect(() => {
    setRetrying(false);
  }, [notice]);

  useEffect(() => {
    if (!notice || stale || !view?.autoDismiss) return;
    const timer = setTimeout(() => setNotice(null), ADD_NOTICE_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notice, setNotice, stale, view?.autoDismiss]);

  if (!notice || stale || !view) return null;

  const failed = view.tone === 'partial';
  const offerMatch = notice.offerMatch === true && view.tone === 'success';
  const tabReserve = (width >= 700 ? 70 : 60) + (insets.bottom > 0 ? insets.bottom : spacing.sm);

  const onRetry = async () => {
    if (!failed || retrying) return;
    setRetrying(true);
    try {
      await retryNoticeListSync();
    } catch (error) {
      Alert.alert(t('list.addFailed'), friendlyErrorMessage(error));
    } finally {
      setRetrying(false);
    }
  };

  const action = failed ? (
    <PrimaryButton
      label={t('list.retryListUpdate')}
      onPress={() => void onRetry()}
      loading={retrying}
      disabled={retrying}
    />
  ) : offerMatch ? (
    <PrimaryButton
      label={t('list.matchToList')}
      onPress={() => offerMatchFromNotice()}
      accessibilityHint={t('list.matchToListHint')}
    />
  ) : null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.overlay, { paddingBottom: tabReserve + spacing.sm }]}
    >
      <FeedbackNotice
        key={`${notice.kind ?? 'none'}:${notice.productId}:${notice.started?.generation ?? ''}:${notice.listSynced}:${notice.offerMatch ? '1' : '0'}`}
        tone={view.tone}
        heading={t(view.headingKey)}
        details={t(view.detailKey, view.params)}
        onClose={() => setNotice(null)}
        closeLabel={t('list.noticeDismiss')}
        action={action}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 20,
    paddingHorizontal: spacing.screen,
  },
});
