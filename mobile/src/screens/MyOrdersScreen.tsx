import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchPurchaseHistory } from '../api/purchaseHistory';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenCard } from '../components/ScreenCard';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { friendlyErrorMessage } from '../lib/errors';
import {
  formatPurchaseAmount,
  formatPurchaseDateTime,
  formatPurchaseListTitle,
  getPurchaseSourceLabel,
  getPurchaseStatusColors,
  getPurchaseStatusLabel,
} from '../lib/purchaseHistoryDisplay';
import type { PurchaseHistorySummary } from '../types/purchaseHistory';
import type { MyOrdersProps } from '../types/navigation';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export function MyOrdersScreen({ navigation }: MyOrdersProps) {
  const { customer } = useAuth();
  const { t } = useI18n();
  const signedIn = Boolean(customer?.id);

  const [records, setRecords] = useState<PurchaseHistorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipNextFocusLoad = useRef(true);

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!signedIn) return;
      const silent = options?.silent === true;
      if (!silent) setError(null);
      try {
        const list = await fetchPurchaseHistory();
        setRecords(list);
        setError(null);
      } catch (e) {
        setError(friendlyErrorMessage(e));
        if (!silent) setRecords([]);
      }
    },
    [signedIn],
  );

  useFocusEffect(
    useCallback(() => {
      if (!signedIn) {
        setLoading(false);
        setRecords([]);
        setError(null);
        return;
      }
      if (skipNextFocusLoad.current) {
        skipNextFocusLoad.current = false;
        setLoading(true);
        load().finally(() => setLoading(false));
        return;
      }
      void load({ silent: true });
    }, [signedIn, load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  };

  const openRecord = (item: PurchaseHistorySummary) => {
    navigation.navigate('PurchaseHistoryDetail', { recordId: item.id });
  };

  if (!signedIn) {
    return (
      <View style={styles.guestWrap}>
        <ScreenCard>
          <Text style={styles.guestTitle}>{t('orders.guestTitle')}</Text>
          <Text style={styles.guestBody}>{t('orders.guestBody')}</Text>
        </ScreenCard>
        <PrimaryButton
          label={t('common.signIn')}
          onPress={() => navigation.navigate('Login', { returnTo: 'history' })}
        />
        <View style={styles.gap} />
        <PrimaryButton
          label={t('common.createAccount')}
          variant="outline"
          onPress={() => navigation.navigate('Register', { returnTo: 'history' })}
        />
      </View>
    );
  }

  if (loading && records.length === 0 && !error) {
    return <LoadingState message={t('orders.loading')} />;
  }

  if (error && records.length === 0) {
    return <ErrorState message={error} onRetry={() => load()} retryLoading={refreshing} />;
  }

  return (
    <View style={styles.root}>
      {error && records.length > 0 ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>{error}</Text>
          <Pressable onPress={() => load({ silent: true })} disabled={refreshing}>
            <Text style={styles.inlineRetry}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={records.length === 0 ? styles.listEmpty : styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {/* Title lives in the native stack header (nav.purchaseHistory); the body keeps only the explanatory text. */}
            <Text style={styles.intro}>{t('orders.intro')}</Text>
            {records.length > 0 ? (
              <Text style={styles.refreshHint}>{t('orders.refreshHint')}</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{t('orders.emptyTitle')}</Text>
              <Text style={styles.emptyBody}>{t('orders.emptyBody')}</Text>
              <View style={styles.emptyBtn}>
                <PrimaryButton
                  label={t('orders.browseCatalog')}
                  variant="outline"
                  onPress={() =>
                    navigation.getParent()?.navigate('Catalog', { screen: 'CatalogList' })
                  }
                />
              </View>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const sc = getPurchaseStatusColors(item.type, item.status);
          return (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => openRecord(item)}
            >
              <View style={styles.cardTop}>
                <View style={styles.titleBlock}>
                  <View style={styles.sourceBadge}>
                    <Text style={styles.sourceBadgeText} numberOfLines={1}>
                      {getPurchaseSourceLabel(item.sourceLabel)}
                    </Text>
                  </View>
                  <Text style={styles.orderId} numberOfLines={1}>
                    {formatPurchaseListTitle(item)}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                  <Text style={[styles.badgeText, { color: sc.text }]} numberOfLines={2}>
                    {getPurchaseStatusLabel(item.type, item.status)}
                  </Text>
                </View>
              </View>
              <Text style={styles.date}>
                {t('purchase.validationAt')}:{' '}
                {formatPurchaseDateTime(item.completedAt ?? item.createdAt)}
              </Text>
              <View style={styles.cardBottom}>
                <Text style={styles.meta}>
                  {item.itemCount} {t('purchase.recordedItems')}
                  {item.uniqueProductCount != null
                    ? ` · ${item.uniqueProductCount} ${t('purchase.uniqueProducts')}`
                    : ''}
                </Text>
                <Text style={styles.total}>
                  {formatPurchaseAmount(item.type, item.total, item.estimatedTotal)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  guestWrap: { flex: 1, padding: spacing.screen, justifyContent: 'center' },
  guestTitle: { ...typography.heading, marginBottom: spacing.sm },
  guestBody: typography.bodyMuted,
  gap: { height: spacing.md },
  headerBlock: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionTitle: { ...typography.heading, marginBottom: spacing.sm },
  intro: { ...typography.bodyMuted, marginBottom: spacing.md },
  refreshHint: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  inlineError: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.md,
    marginBottom: 0,
    padding: spacing.md,
    backgroundColor: colors.errorBg,
    borderRadius: radius.sm,
  },
  inlineErrorText: { flex: 1, fontSize: 13, color: colors.error },
  inlineRetry: { fontSize: 13, fontWeight: '600', color: colors.primary },
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  listEmpty: { flexGrow: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { opacity: 0.94 },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  sourceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.xs,
  },
  sourceBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primaryDark },
  orderId: { fontSize: 16, fontWeight: '700', color: colors.text },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    maxWidth: '42%',
  },
  badgeText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  date: { ...typography.caption, marginTop: spacing.xs },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  meta: { flex: 1, fontSize: 14, color: colors.textMuted },
  total: { fontSize: 14, fontWeight: '600', color: colors.primary },
  empty: { padding: spacing.xxl, alignItems: 'center' },
  emptyTitle: { ...typography.heading, marginBottom: spacing.sm },
  emptyBody: { ...typography.bodyMuted, textAlign: 'center', marginBottom: spacing.xl },
  emptyBtn: { width: '100%', maxWidth: 280 },
});
