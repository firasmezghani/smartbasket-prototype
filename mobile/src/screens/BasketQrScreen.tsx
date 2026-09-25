import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import {
  cancelSmartBasketSession,
  fetchSmartBasketSession,
  type SmartBasketSession,
} from '../api/smartBasket';
import { Badge, type BadgeTone } from '../components/Badge';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenCard } from '../components/ScreenCard';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { captureAccountScope } from '../lib/accountScope';
import { friendlyErrorMessage } from '../lib/errors';
import { contentMaxWidth } from '../lib/layout';
import {
  classifyRemoteSession,
  commitDisplayedQrSession,
  createQrStatusPoller,
  createRequestGeneration,
  hideUsableQr,
  isForegroundAppState,
  isTerminalSessionStatus,
  retainTerminalAgainstRoute,
  runQrStatusPollTick,
  sessionSnapshotFromRoute,
  shouldAnnounceTerminal,
  shouldPollQrStatus,
} from '../lib/qrSessionStatus';
import type { BasketQrProps } from '../types/navigation';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

function secondsRemaining(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.floor(ms / 1000));
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type DisplayStatus = 'active' | 'validated' | 'rejected' | 'cancelled' | 'expired' | 'superseded';

const STATUS_KEY: Record<DisplayStatus, TranslationKey> = {
  active: 'basketQr.statusActive',
  validated: 'basketQr.outcomeValidated',
  rejected: 'basketQr.outcomeRejected',
  cancelled: 'basketQr.outcomeCancelled',
  expired: 'basketQr.outcomeExpired',
  superseded: 'basketQr.outcomeSuperseded',
};

const STATUS_TONE: Record<DisplayStatus, BadgeTone> = {
  active: 'info',
  validated: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
  expired: 'warning',
  superseded: 'warning',
};

export function BasketQrScreen({ navigation, route }: BasketQrProps) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const { customer, accountGeneration } = useAuth();
  const { refresh } = useCart();
  const routeSession = route.params;
  const routeSessionId = routeSession?.sessionId;
  const customerId = customer?.id ?? null;

  const [session, setSession] = useState<SmartBasketSession | null>(() =>
    sessionSnapshotFromRoute(routeSession, customerId),
  );
  const [qrValue, setQrValue] = useState(routeSession?.qrValue ?? '');
  const [loading, setLoading] = useState(!routeSession);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [tick, setTick] = useState(0);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reconnect, setReconnect] = useState(false);
  const [basketRefreshFailed, setBasketRefreshFailed] = useState(false);
  const [refreshingBasket, setRefreshingBasket] = useState(false);

  const focusedRef = useRef(false);
  const appActiveRef = useRef(isForegroundAppState(AppState.currentState));
  const sessionRef = useRef<SmartBasketSession | null>(session);
  const qrValueRef = useRef(qrValue);
  const generationRef = useRef(createRequestGeneration());
  const pollerRef = useRef<ReturnType<typeof createQrStatusPoller> | null>(null);
  const announcedRef = useRef<{ sessionId: number; status: string } | null>(null);
  const accountRef = useRef(
    captureAccountScope(customer?.id != null ? String(customer.id) : null, accountGeneration),
  );
  accountRef.current = captureAccountScope(
    customer?.id != null ? String(customer.id) : null,
    accountGeneration,
  );
  qrValueRef.current = qrValue;

  const remaining = useMemo(() => {
    if (!session?.expiresAt) return 0;
    return secondsRemaining(session.expiresAt);
  }, [session?.expiresAt, tick]);

  const displayStatus: DisplayStatus = useMemo(() => {
    if (!session) return 'active';
    if (session.superseded) return 'superseded';
    if (session.status === 'validated') return 'validated';
    if (session.status === 'rejected') return 'rejected';
    if (session.status === 'cancelled') return 'cancelled';
    if (session.status === 'expired') return 'expired';
    return 'active';
  }, [session]);

  const refreshBasketAfterApproval = useCallback(async () => {
    try {
      await refresh();
      setBasketRefreshFailed(false);
      return true;
    } catch {
      setBasketRefreshFailed(true);
      return false;
    }
  }, [refresh]);

  const applyIncoming = useCallback(
    async (incoming: SmartBasketSession) => {
      const displayed = sessionRef.current;
      if (!displayed) return;
      const kind = classifyRemoteSession({
        displayedSessionId: displayed.id,
        incomingId: incoming.id,
        incomingStatus: incoming.status,
        superseded: incoming.superseded === true,
      });
      if (kind === 'ignore') return;
      const next: SmartBasketSession =
        kind === 'superseded' ? { ...incoming, superseded: true } : incoming;
      commitDisplayedQrSession(sessionRef, next);
      setSession(next);
      setError(null);
      setReconnect(false);
      if (next.status === 'validated') {
        await refreshBasketAfterApproval();
      }
    },
    [refreshBasketAfterApproval],
  );

  const pollOnce = useCallback(async (): Promise<'ok' | 'fail' | 'stop'> => {
    return runQrStatusPollTick({
      displayed: sessionRef.current,
      generation: generationRef.current,
      accountId: accountRef.current.accountId,
      accountGeneration: accountRef.current.generation,
      latestDisplayed: () => sessionRef.current,
      currentScope: () => accountRef.current,
      fetchSession: fetchSmartBasketSession,
      applyIncoming,
      onNetworkError: () => setReconnect(true),
    });
  }, [applyIncoming]);

  const pollOnceRef = useRef(pollOnce);
  pollOnceRef.current = pollOnce;

  const ensurePoller = useCallback(() => {
    if (pollerRef.current) return pollerRef.current;
    const poller = createQrStatusPoller({
      shouldRun: () =>
        shouldPollQrStatus({
          focused: focusedRef.current,
          appActive: appActiveRef.current,
          status: sessionRef.current?.status,
        }),
      poll: () => pollOnceRef.current(),
    });
    pollerRef.current = poller;
    return poller;
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (customerId == null) return undefined;
      focusedRef.current = true;
      const seeded = sessionSnapshotFromRoute(routeSession, customerId);
      const displayed = sessionRef.current;
      const keepTerminal =
        seeded != null &&
        displayed != null &&
        retainTerminalAgainstRoute({
          confirmedSessionId: displayed.id,
          confirmedStatus: displayed.status,
          routeSessionId: seeded.id,
          routeStatus: routeSession?.status,
        });
      if (seeded && !keepTerminal) {
        commitDisplayedQrSession(sessionRef, seeded);
        setSession(seeded);
        const nextQr = routeSession?.qrValue ?? '';
        qrValueRef.current = nextQr;
        setQrValue(nextQr);
      }
      setLoading(false);
      setError(null);
      const poller = ensurePoller();
      poller.start();
      return () => {
        focusedRef.current = false;
        poller.stop();
      };
    }, [customerId, ensurePoller, routeSessionId]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const active = isForegroundAppState(next);
      appActiveRef.current = active;
      const poller = pollerRef.current;
      if (!poller || !focusedRef.current) return;
      if (active) void poller.checkNow();
      else poller.stop();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!session || isTerminalSessionStatus(session.status)) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [session]);

  useEffect(() => {
    if (!session || session.status !== 'active') return;
    if (remaining > 0) return;
    void pollerRef.current?.checkNow();
  }, [remaining, session]);

  useEffect(() => {
    return () => {
      pollerRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const status = displayStatus === 'superseded' ? 'cancelled' : session.status;
    if (
      shouldAnnounceTerminal({
        sessionId: session.id,
        status,
        lastAnnounced: announcedRef.current,
      })
    ) {
      announcedRef.current = { sessionId: session.id, status };
    }
  }, [displayStatus, session]);

  const statusText = t(STATUS_KEY[displayStatus]);
  const liveStatus =
    session &&
    announcedRef.current?.sessionId === session.id &&
    (displayStatus === 'superseded' || isTerminalSessionStatus(session.status));

  const onCancel = () => {
    if (!session || session.status !== 'active') return;
    Alert.alert(t('basketQr.cancelTitle'), t('basketQr.cancelBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('basketQr.cancelConfirm'),
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
          const updated = await cancelSmartBasketSession(session.id);
          const next = { ...session, ...updated, status: 'cancelled' as const };
          commitDisplayedQrSession(sessionRef, next);
          setSession(next);
          pollerRef.current?.stop();
          } catch (e) {
            Alert.alert(t('basketQr.cancelTitle'), friendlyErrorMessage(e));
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  const onCopy = async () => {
    const value = qrValueRef.current;
    if (!value) return;
    try {
      await Clipboard.setStringAsync(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const onRefreshBasket = async () => {
    setRefreshingBasket(true);
    try {
      await refreshBasketAfterApproval();
    } finally {
      setRefreshingBasket(false);
    }
  };

  if (!customer) {
    return (
      <ScreenContainer>
        <ScreenCard>
          <Text style={styles.body}>{t('basketQr.signInBody')}</Text>
        </ScreenCard>
        <PrimaryButton
          label={t('common.signIn')}
          onPress={() => navigation.getParent()?.navigate('Insights', { screen: 'Login' })}
        />
      </ScreenContainer>
    );
  }

  if (loading && !session) {
    return <LoadingState message={t('basketQr.loading')} />;
  }

  if (error && !session) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setLoading(true);
          void pollerRef.current?.checkNow().finally(() => setLoading(false));
        }}
      />
    );
  }

  if (!session) {
    return <ErrorState message={t('basketQr.noActiveSession')} onRetry={() => navigation.goBack()} />;
  }

  const showQr = !hideUsableQr({
    status: session.status,
    remainingSeconds: remaining,
    qrValue,
  });
  const itemCount = session.itemCount ?? session.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const uniqueCount =
    session.uniqueProductCount ??
    new Set((session.items ?? []).map((i) => i.productId.toLowerCase())).size;
  const itemsLabel =
    itemCount === 1 ? t('basketQr.itemOne') : t('basketQr.itemOther', { count: itemCount });
  const productsLabel =
    uniqueCount === 1
      ? t('basketQr.productOne')
      : t('basketQr.productOther', { count: uniqueCount });
  const qrSize = Math.max(
    180,
    Math.min(260, Math.min(contentMaxWidth(width), width) - spacing.screen * 2 - spacing.lg * 2),
  );

  return (
    <ScreenContainer>
      {session.status === 'active' ? (
      <ScreenCard>
        <View style={styles.statusRow}>
          <Badge label={statusText} tone={STATUS_TONE[displayStatus]} />
        </View>
        {liveStatus ? (
          <Text style={styles.statusAnnounce} accessibilityLiveRegion="polite">
            {t('basketQr.statusA11y', { status: statusText })}
          </Text>
        ) : (
          <Text style={styles.statusAnnounce} accessibilityElementsHidden>
            {t('basketQr.statusA11y', { status: statusText })}
          </Text>
        )}
        {remaining > 0 ? (
          <Text style={styles.countdown}>{t('basketQr.expiresIn', { time: formatCountdown(remaining) })}</Text>
        ) : (
          <Text style={styles.countdown}>{t('basketQr.checkingExpiry')}</Text>
        )}
        {reconnect ? (
          <Text style={styles.reconnect} accessibilityLiveRegion="polite">
            {t('basketQr.reconnecting')}
          </Text>
        ) : null}
      </ScreenCard>
      ) : (
        <Text style={styles.statusAnnounce} accessibilityLiveRegion={liveStatus ? 'polite' : 'none'}>
          {t('basketQr.statusA11y', { status: statusText })}
        </Text>
      )}

      {showQr ? (
        <ScreenCard tone="accent" style={styles.qrCard}>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('basketQr.qrA11y')}
            style={styles.qrInner}
          >
            <QRCode value={qrValue.trim()} size={qrSize} />
          </View>
          <Pressable
            onPress={() => setShowCode((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={showCode ? t('basketQr.hideCode') : t('basketQr.showCode')}
            style={styles.codeToggle}
          >
            <Text style={styles.codeToggleText}>
              {showCode ? t('basketQr.hideCode') : t('basketQr.showCode')}
            </Text>
          </Pressable>
          {showCode ? (
            <View style={styles.codeBox}>
              <Text style={styles.codeHint}>{t('basketQr.codeHint')}</Text>
              <Text selectable style={styles.codeValue}>
                {qrValue}
              </Text>
              <PrimaryButton
                label={copied ? t('basketQr.copied') : t('basketQr.copyCode')}
                onPress={() => void onCopy()}
                variant="secondary"
              />
            </View>
          ) : null}
        </ScreenCard>
      ) : null}

      {displayStatus === 'validated' ? (
        <ScreenCard>
          <Text style={styles.outcome}>{t('basketQr.outcomeValidated')}</Text>
          {basketRefreshFailed ? <Text style={styles.body}>{t('basketQr.refreshBasketFailed')}</Text> : null}
          <PrimaryButton
            label={t('basketQr.viewHistory')}
            onPress={() => navigation.getParent()?.navigate('Insights', { screen: 'MyOrders' })}
          />
          {basketRefreshFailed ? (
            <PrimaryButton
              label={t('basketQr.refreshBasket')}
              onPress={() => void onRefreshBasket()}
              disabled={refreshingBasket}
              variant="secondary"
            />
          ) : null}
          <PrimaryButton label={t('basketQr.done')} onPress={() => navigation.goBack()} variant="outline" />
        </ScreenCard>
      ) : null}

      {displayStatus === 'rejected' ? (
        <ScreenCard>
          <Text style={styles.outcome}>{t('basketQr.outcomeRejected')}</Text>
          <PrimaryButton label={t('basketQr.reviewBasket')} onPress={() => navigation.goBack()} />
        </ScreenCard>
      ) : null}

      {displayStatus === 'expired' || displayStatus === 'cancelled' || displayStatus === 'superseded' ? (
        <ScreenCard>
          <Text style={styles.outcome}>{statusText}</Text>
          <PrimaryButton label={t('basketQr.backToBasket')} onPress={() => navigation.goBack()} />
        </ScreenCard>
      ) : null}

      <ScreenCard>
        <Text style={styles.summaryTitle}>{t('basketQr.summary')}</Text>
        <Text style={styles.summaryLine}>{t('basketQr.itemsLine', { items: itemsLabel, products: productsLabel })}</Text>
      </ScreenCard>

      {session.status === 'active' && remaining > 0 ? (
        <PrimaryButton
          label={t('basketQr.cancelSession')}
          onPress={onCancel}
          disabled={cancelling}
          variant="secondary"
        />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: { ...typography.body, lineHeight: 22 },
  statusRow: { flexDirection: 'row', marginBottom: spacing.xs },
  statusAnnounce: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  countdown: { marginTop: spacing.sm, fontSize: 15, fontWeight: '600', color: colors.text },
  reconnect: { marginTop: spacing.sm, ...typography.caption, color: colors.primaryDark },
  qrCard: { alignItems: 'center', paddingVertical: spacing.xl },
  qrInner: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  codeToggle: { marginTop: spacing.md, minHeight: 44, justifyContent: 'center' },
  codeToggleText: { color: colors.primaryDark, fontWeight: '700', fontSize: 15 },
  codeBox: { width: '100%', marginTop: spacing.md, gap: spacing.sm },
  codeHint: { ...typography.caption, textAlign: 'center' },
  codeValue: {
    ...typography.body,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  summaryTitle: { ...typography.heading, fontSize: 16, marginBottom: spacing.sm },
  summaryLine: { ...typography.bodyMuted },
  outcome: { ...typography.heading, fontSize: 18, marginBottom: spacing.md },
});
