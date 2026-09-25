import { useCallback, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchPurchaseHistoryDetail } from '../api/purchaseHistory';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { ScreenCard } from '../components/ScreenCard';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { friendlyErrorMessage } from '../lib/errors';
import {
  formatPurchaseAmount,
  formatPurchaseDateTime,
  getPurchaseSourceLabel,
  getPurchaseStatusColors,
  getPurchaseStatusLabel,
} from '../lib/purchaseHistoryDisplay';
import { formatMoneyOrUnavailable, getPriceInStoreLabel } from '../lib/valueDisplay';
import type { PurchaseHistoryDetail } from '../types/purchaseHistory';
import type { PurchaseHistoryDetailProps } from '../types/navigation';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

function linePrice(line: PurchaseHistoryDetail['items'][0]): string {
  if (line.lineTotal != null && Number(line.lineTotal) > 0) {
    return formatMoneyOrUnavailable(line.lineTotal);
  }
  const u = line.unitPriceSnapshot ?? line.unitPrice;
  if (u != null && Number(u) > 0) {
    return formatMoneyOrUnavailable(Number(u) * line.quantity);
  }
  return getPriceInStoreLabel();
}

export function PurchaseHistoryDetailScreen({ route }: PurchaseHistoryDetailProps) {
  const { recordId } = route.params;
  const { customer } = useAuth();
  const { t } = useI18n();
  const signedIn = Boolean(customer?.id);

  const [detail, setDetail] = useState<PurchaseHistoryDetail | null>(null);
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
        const data = await fetchPurchaseHistoryDetail(recordId);
        setDetail(data);
        setError(null);
      } catch (e) {
        setError(friendlyErrorMessage(e));
        if (!silent) setDetail(null);
      }
    },
    [signedIn, recordId],
  );

  useFocusEffect(
    useCallback(() => {
      if (!signedIn) {
        setLoading(false);
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

  if (!signedIn) {
    return <ErrorState message={t('orders.guestTitle')} />;
  }

  if (loading && !detail) {
    return <LoadingState message={t('purchase.detailLoading')} />;
  }

  if (error && !detail) {
    return <ErrorState message={error || t('purchase.notFound')} onRetry={() => load()} />;
  }

  if (!detail) {
    return <ErrorState message={t('purchase.notFound')} onRetry={() => load()} />;
  }

  const sc = getPurchaseStatusColors(detail.type, detail.status);
  const latest = detail.latestValidation ?? detail.validations[0] ?? null;
  const validationAt = detail.completedAt ?? latest?.createdAt ?? detail.createdAt;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load({ silent: true });
            setRefreshing(false);
          }}
          tintColor={colors.primary}
        />
      }
    >
      <ScreenCard>
        <View style={styles.badgeRow}>
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>
              {getPurchaseSourceLabel(detail.sourceLabel)}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusBadgeText, { color: sc.text }]}>
              {getPurchaseStatusLabel(detail.type, detail.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.summary}>{detail.summary}</Text>
        <Text style={styles.meta}>
          {t('purchase.validationAt')}: {formatPurchaseDateTime(validationAt)}
        </Text>
        <Text style={styles.amountLabel}>{t('purchase.recordedValue')}</Text>
        <Text style={styles.amount}>
          {formatPurchaseAmount(detail.type, detail.total, detail.estimatedTotal)}
        </Text>
        <Text style={styles.itemMeta}>
          {detail.itemCount} {t('purchase.recordedItems')}
          {detail.uniqueProductCount != null
            ? ` · ${detail.uniqueProductCount} ${t('purchase.uniqueProducts')}`
            : ''}
        </Text>
        <Text style={styles.estimateNote}>{t('purchase.estimateIncomplete')}</Text>
      </ScreenCard>

      {latest || detail.validationNote ? (
        <ScreenCard style={styles.validationCard}>
          <Text style={styles.sectionTitle}>{t('purchase.validationHeading')}</Text>
          {latest ? (
            <>
              <Text style={styles.body}>{t('purchase.validatedByStaff')}</Text>
              <Text style={styles.body}>{formatPurchaseDateTime(latest.createdAt)}</Text>
            </>
          ) : null}
          {detail.validationNote ? (
            <Text style={styles.note}>
              {t('purchase.validationNote')}: {detail.validationNote}
            </Text>
          ) : null}
        </ScreenCard>
      ) : null}

      <ScreenCard>
        <Text style={styles.sectionTitle}>{t('purchase.itemsHeading')}</Text>
        {detail.items.map((line) => (
          <View key={line.id} style={styles.lineRow}>
            <Text style={styles.lineName}>
              {line.productName} × {line.quantity}
            </Text>
            <Text style={styles.linePrice}>{linePrice(line)}</Text>
          </View>
        ))}
      </ScreenCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  sourceBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  sourceBadgeText: { fontSize: 12, fontWeight: '700', color: colors.primaryDark },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '600' },
  summary: { ...typography.heading, fontSize: 17, marginBottom: spacing.xs },
  meta: { ...typography.caption, marginTop: 2 },
  amountLabel: { ...typography.caption, marginTop: spacing.md },
  amount: { fontSize: 18, fontWeight: '700', color: colors.primary, marginTop: 2 },
  itemMeta: { ...typography.bodyMuted, marginTop: spacing.xs },
  estimateNote: { ...typography.caption, marginTop: spacing.sm },
  sectionTitle: { ...typography.heading, fontSize: 16, marginBottom: spacing.md },
  validationCard: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
  note: { fontSize: 14, color: colors.primaryDark, marginTop: spacing.sm, fontStyle: 'italic' },
  lineRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
  },
  lineName: { fontSize: 15, fontWeight: '600', color: colors.text },
  linePrice: { fontSize: 14, fontWeight: '600', color: colors.primary, marginTop: 4 },
});
