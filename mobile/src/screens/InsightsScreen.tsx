import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { fetchPurchaseHistory } from '../api/purchaseHistory';
import { AppIcon } from '../components/AppIcon';
import { LanguageSelector } from '../components/LanguageSelector';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { captureAccountScope } from '../lib/accountScope';
import {
  accountHistoryPreviewState,
  isHistoryResultCurrent,
  type AccountHistoryPreview,
} from '../lib/accountHistoryPreview';
import {
  formatPurchaseAmount,
  formatPurchaseDateTime,
  formatPurchaseListTitle,
} from '../lib/purchaseHistoryDisplay';
import { createRequestGeneration } from '../lib/requestGeneration';
import type { InsightsHomeProps } from '../types/navigation';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

function accountInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const second =
    parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
  return `${first}${second}`.toUpperCase();
}

export function InsightsScreen({ navigation }: InsightsHomeProps) {
  const { t } = useI18n();
  const { customer, logout, accountGeneration } = useAuth();
  const tabBarHeight = useBottomTabBarHeight();
  const scrollBottom = { paddingBottom: tabBarHeight + spacing.xl };
  const [history, setHistory] = useState<AccountHistoryPreview>({ kind: 'hidden', latest: null });
  const mountedRef = useRef(true);
  const gen = useRef(createRequestGeneration()).current;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadHistory = useCallback(async () => {
    if (!customer?.id) {
      setHistory({ kind: 'hidden', latest: null });
      return;
    }
    const started = captureAccountScope(String(customer.id), accountGeneration);
    const token = gen.next();
    setHistory((prev) =>
      prev.kind === 'ready' ? prev : { kind: 'loading', latest: null },
    );
    try {
      const records = await fetchPurchaseHistory();
      if (
        !isHistoryResultCurrent({
          mounted: mountedRef.current,
          requestCurrent: gen.isCurrent(token),
          started,
          current: captureAccountScope(String(customer.id), accountGeneration),
        })
      ) {
        return;
      }
      setHistory(
        accountHistoryPreviewState({
          signedIn: true,
          loading: false,
          records,
        }),
      );
    } catch {
      if (
        !isHistoryResultCurrent({
          mounted: mountedRef.current,
          requestCurrent: gen.isCurrent(token),
          started,
          current: captureAccountScope(String(customer.id), accountGeneration),
        })
      ) {
        return;
      }
      setHistory((prev) => (prev.kind === 'ready' ? prev : { kind: 'unavailable', latest: null }));
    }
  }, [accountGeneration, customer?.id, gen]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (!customer) {
    return (
      <ScreenContainer background={colors.cream} contentContainerStyle={[styles.content, scrollBottom]}>
        <View style={styles.sections}>
          <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <AppIcon name="person-outline" size={22} color={colors.primary} />
          </View>
          <PrimaryButton label={t('common.signIn')} onPress={() => navigation.navigate('Login')} />
          <PrimaryButton
            label={t('common.createAccount')}
            variant="outline"
            onPress={() => navigation.navigate('Register')}
          />
          <View style={styles.group}>
            <View style={styles.settingsRow}>
              <AppIcon name="language-outline" size={20} color={colors.primary} />
              <View style={styles.settingsBody}>
                <LanguageSelector />
              </View>
            </View>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  const fullName = customer.fullName?.trim() || t('common.customer');
  const email = customer.email?.trim();
  const initials = accountInitials(fullName);
  const latest = history.latest;

  return (
    <ScreenContainer background={colors.cream} contentContainerStyle={[styles.content, scrollBottom]}>
      <View style={styles.sections}>
        <View style={styles.profile}>
          <View
            style={styles.avatar}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={styles.initials} allowFontScaling>
              {initials}
            </Text>
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.name} accessibilityRole="header">
              {fullName}
            </Text>
            {email ? (
              <Text style={styles.email} selectable>
                {email}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.group}>
          <View style={styles.settingsRow}>
            <AppIcon name="language-outline" size={20} color={colors.primary} />
            <View style={styles.settingsBody}>
              <LanguageSelector />
            </View>
          </View>
        </View>

        <View style={styles.historyBlock}>
          {history.kind === 'loading' ? (
            <Text style={styles.historyMeta}>{t('orders.loading')}</Text>
          ) : history.kind === 'unavailable' ? (
            <>
              <Text style={styles.historyMeta}>{t('account.latestValidatedUnavailable')}</Text>
              <Pressable
                onPress={() => void loadHistory()}
                accessibilityRole="button"
                accessibilityLabel={t('common.retry')}
                hitSlop={8}
                style={styles.retryHit}
              >
                <Text style={styles.retry}>{t('common.retry')}</Text>
              </Pressable>
            </>
          ) : history.kind === 'empty' ? (
            <Text style={styles.historyMeta}>{t('account.latestValidatedEmpty')}</Text>
          ) : history.kind === 'ready' && latest ? (
            <Pressable
              onPress={() => navigation.navigate('PurchaseHistoryDetail', { recordId: latest.id })}
              accessibilityRole="button"
              accessibilityLabel={`${t('account.latestValidatedTitle')}. ${formatPurchaseListTitle(latest)}`}
              style={({ pressed }) => [styles.previewCard, pressed && styles.pressed]}
            >
              <Text style={styles.previewKicker}>{t('account.latestValidatedTitle')}</Text>
              <Text style={styles.previewTitle}>{formatPurchaseListTitle(latest)}</Text>
              <Text style={styles.historyMeta}>
                {formatPurchaseDateTime(latest.completedAt ?? latest.createdAt)}
              </Text>
              <Text style={styles.historyMeta}>
                {latest.itemCount} {t('purchase.recordedItems')}
                {latest.summary ? ` · ${latest.summary}` : ''}
              </Text>
              <Text style={styles.previewTotal}>
                {formatPurchaseAmount(latest.type, latest.total, latest.estimatedTotal)}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => navigation.navigate('MyOrders')}
            accessibilityRole="button"
            accessibilityLabel={t('account.viewFullHistory')}
            style={({ pressed }) => [styles.historyLink, pressed && styles.pressed]}
          >
            <AppIcon name="receipt-outline" size={20} color={colors.primary} />
            <Text style={styles.historyLabel}>{t('account.viewFullHistory')}</Text>
            <AppIcon name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => void logout()}
          accessibilityRole="button"
          accessibilityLabel={t('common.signOut')}
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
        >
          <AppIcon name="log-out-outline" size={18} color={colors.textMuted} />
          <Text style={styles.signOutText}>{t('common.signOut')}</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm },
  sections: { gap: spacing.xl },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  profileCopy: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.heading, fontSize: 18 },
  email: { ...typography.caption },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  settingsBody: { flex: 1, minWidth: 0 },
  historyBlock: { gap: spacing.sm },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  previewKicker: { ...typography.label, color: colors.textMuted },
  previewTitle: { ...typography.body, fontWeight: '600' },
  previewTotal: { ...typography.caption, fontWeight: '600', color: colors.primary },
  historyMeta: { ...typography.caption },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingVertical: spacing.sm,
  },
  historyLabel: {
    ...typography.body,
    flex: 1,
    minWidth: 0,
    fontWeight: '500',
  },
  retryHit: { minHeight: 44, justifyContent: 'center' },
  retry: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  signOut: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  signOutText: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '500',
  },
  pressed: { opacity: 0.7 },
});
