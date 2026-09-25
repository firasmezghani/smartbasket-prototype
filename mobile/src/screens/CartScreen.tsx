import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { fetchProducts } from '../api/catalog';
import { createQrSession } from '../api/smartBasket';
import { AppIcon } from '../components/AppIcon';
import { Badge } from '../components/Badge';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProductImage } from '../components/ProductImage';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useI18n } from '../i18n/I18nContext';
import {
  cartLineDisplayName,
  cartLineImageProduct,
  cartLinePackageDetail,
  catalogProductForCartLine,
  indexCatalogProductsById,
} from '../lib/cartLinePresentation';
import { friendlyErrorMessage } from '../lib/errors';
import { contentMaxWidth } from '../lib/layout';
import { getPriceInStoreLabel } from '../lib/valueDisplay';
import type { TranslationKey } from '../i18n/translations';
import {
  countUniqueProductIds,
  isSmartBasketFull,
  SMART_BASKET_UNIQUE_PRODUCT_LIMIT,
} from '../lib/smartBasket';
import type { CartItem } from '../types/cart';
import type { Product } from '../types/catalog';
import type { CartListProps } from '../types/navigation';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

function linePriceLabel(
  item: CartItem,
  t: (key: TranslationKey, p?: Record<string, string | number>) => string,
): string {
  const inStore = getPriceInStoreLabel();
  if (item.priceDisplayMode === 'request' || item.unitPrice == null) {
    return inStore;
  }
  const unit = item.salePrice ?? item.unitPrice;
  if (unit == null) return inStore;
  return t('basket.priceEach', { amount: Number(unit).toFixed(3) });
}

function itemNeedsStaffPrice(item: CartItem): boolean {
  return (
    item.priceDisplayMode === 'request' ||
    (item.unitPrice == null && item.salePrice == null)
  );
}

export function CartScreen({ navigation }: CartListProps) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const { customer } = useAuth();
  const {
    cart,
    loading,
    error,
    refresh,
    updateQuantity,
    removeItem,
    clearCart,
    staleBasketPending,
    resolveStaleBasketPrompt,
  } = useCart();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [catalogById, setCatalogById] = useState<Map<string, Product>>(() => new Map());
  // Do not show the idle-basket prompt again while one is already open.
  const stalePromptOpen = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const products: Product[] = [];
        let offset = 0;
        const limit = 100;
        for (;;) {
          const res = await fetchProducts({ limit, offset });
          products.push(...res.data);
          if (!res.pagination.hasMore || res.data.length === 0) break;
          offset += res.data.length;
        }
        if (!cancelled) setCatalogById(indexCatalogProductsById(products));
      } catch {
        if (!cancelled) setCatalogById(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Idle basket: ask the customer to resume it or start a new one.
  const promptStartNewBasket = useCallback(() => {
    Alert.alert(t('basket.staleStartNewTitle'), t('basket.staleStartNewBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('basket.staleStartNew'),
        style: 'destructive',
        onPress: async () => {
          try {
            await clearCart();
          } catch (e) {
            Alert.alert(t('basket.staleClearFailed'), friendlyErrorMessage(e));
          } finally {
            resolveStaleBasketPrompt();
          }
        },
      },
    ]);
  }, [clearCart, resolveStaleBasketPrompt, t]);

  useEffect(() => {
    if (!staleBasketPending || stalePromptOpen.current) return;
    stalePromptOpen.current = true;
    Alert.alert(
      t('basket.staleTitle'),
      t('basket.staleBody'),
      [
        {
          text: t('basket.staleStartNew'),
          style: 'destructive',
          onPress: () => {
            stalePromptOpen.current = false;
            promptStartNewBasket();
          },
        },
        {
          text: t('basket.staleResume'),
          onPress: () => {
            stalePromptOpen.current = false;
            resolveStaleBasketPrompt();
          },
        },
      ],
      {
        cancelable: true,
        // Android back / tap-outside counts as "resume" (keep the basket).
        onDismiss: () => {
          stalePromptOpen.current = false;
          resolveStaleBasketPrompt();
        },
      },
    );
  }, [staleBasketPending, promptStartNewBasket, resolveStaleBasketPrompt, t]);

  const hasStaffPricing = useMemo(
    () => cart.items.some(itemNeedsStaffPrice),
    [cart.items],
  );

  const showEstimatedTotal = cart.grandTotal > 0 && !hasStaffPricing;
  const uniqueProductCount = useMemo(() => countUniqueProductIds(cart), [cart]);
  const basketFull = useMemo(() => isSmartBasketFull(cart), [cart]);
  const maxWidth = contentMaxWidth(width);

  const onGenerateCashierQr = async () => {
    if (!customer) {
      Alert.alert(t('basketQr.signInTitle'), t('basketQr.signInBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.signIn'),
          onPress: () => navigation.getParent()?.navigate('Insights', { screen: 'Login' }),
        },
      ]);
      return;
    }
    setGeneratingQr(true);
    try {
      const data = await createQrSession();
      const qrValue = (data.qrValue ?? data.token).trim();
      navigation.navigate('BasketQr', {
        sessionId: data.sessionId,
        qrValue,
        expiresAt: data.expiresAt,
        itemCount: data.itemCount,
        uniqueProductCount: data.uniqueProductCount,
        status: data.status,
      });
    } catch (e) {
      Alert.alert(t('basketQr.generateFailed'), friendlyErrorMessage(e));
    } finally {
      setGeneratingQr(false);
    }
  };

  const onRetry = async () => {
    setRetrying(true);
    try {
      await refresh();
    } finally {
      setRetrying(false);
    }
  };

  const changeQty = async (item: CartItem, delta: number) => {
    const next = item.quantity + delta;
    if (next < 1) {
      confirmRemove(item);
      return;
    }
    setBusyId(item.id);
    try {
      await updateQuantity(item.id, next);
    } catch (e) {
      Alert.alert(t('basket.updateFailed'), friendlyErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = (item: CartItem) => {
    const catalog = catalogProductForCartLine(catalogById, item.productId);
    const name = cartLineDisplayName(item, catalog, t('common.product'));
    Alert.alert(t('basket.removeTitle'), name || t('basket.removeThis'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: async () => {
          setBusyId(item.id);
          try {
            await removeItem(item.id);
          } catch (e) {
            Alert.alert(t('basket.removeFailed'), friendlyErrorMessage(e));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  if (loading && cart.items.length === 0 && !error) {
    return <LoadingState message={t('basket.loading')} />;
  }

  if (error && cart.items.length === 0) {
    return (
      <ErrorState message={error} onRetry={onRetry} retryLoading={retrying} />
    );
  }

  const isEmpty = cart.items.length === 0;

  return (
    <View style={styles.root}>
      {error && cart.items.length > 0 ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={onRetry} disabled={retrying} accessibilityRole="button">
            <Text style={styles.retryLink}>{retrying ? t('common.retrying') : t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        style={styles.flex}
        data={cart.items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[
          isEmpty ? styles.listEmpty : styles.list,
          { maxWidth, width: '100%', alignSelf: 'center' },
        ]}
        ListHeaderComponent={
          !isEmpty ? (
            <View style={styles.capacityHeader}>
              <Text style={styles.uniqueCount}>
                {t('basket.differentProducts', {
                  count: uniqueProductCount,
                  max: SMART_BASKET_UNIQUE_PRODUCT_LIMIT,
                })}
              </Text>
              <View
                style={styles.progressRow}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: SMART_BASKET_UNIQUE_PRODUCT_LIMIT, now: uniqueProductCount }}
              >
                {Array.from({ length: SMART_BASKET_UNIQUE_PRODUCT_LIMIT }).map((_, i) => (
                  <View
                    key={i}
                    style={[styles.progressDot, i < uniqueProductCount && styles.progressDotOn]}
                  />
                ))}
              </View>
              {basketFull ? (
                <Text style={styles.limitWarning}>{t('basket.limitWarning')}</Text>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap} accessibilityRole="summary">
            <View style={styles.emptyTop} />
            <View style={styles.emptyGroup}>
              <AppIcon name="basket-outline" size={48} color={colors.primary} />
              <Text style={styles.emptyTitle}>{t('basket.emptyTitle')}</Text>
              <Text style={styles.emptyBody}>{t('basket.emptyBody')}</Text>
              <View style={styles.emptyActions}>
                <PrimaryButton
                  label={t('basket.scanBarcode')}
                  onPress={() => navigation.getParent()?.navigate('Scan')}
                />
                <Pressable
                  onPress={() =>
                    navigation.getParent()?.navigate('Home', { screen: 'ShoppingList' })
                  }
                  style={styles.emptyListLink}
                  accessibilityRole="button"
                  accessibilityLabel={t('basket.openShoppingList')}
                >
                  <AppIcon name="list-outline" size={18} color={colors.primary} />
                  <Text style={styles.emptyListLinkText}>{t('basket.openShoppingList')}</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.emptyBottom} />
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const busy = busyId === item.id;
          const onRequest = itemNeedsStaffPrice(item);
          const catalog = catalogProductForCartLine(catalogById, item.productId);
          const name = cartLineDisplayName(item, catalog, t('common.product'));
          const pack = cartLinePackageDetail(catalog);
          const atMin = item.quantity <= 1;

          return (
            <View style={styles.row}>
              <ProductImage product={cartLineImageProduct(item, catalog)} size="thumb" />
              <View style={styles.rowBody}>
                <Text style={styles.name}>{name}</Text>
                {pack ? <Text style={styles.pack}>{pack}</Text> : null}
                {onRequest ? (
                  <View style={styles.priceRow}>
                    <Text style={styles.linePriceMuted}>{linePriceLabel(item, t)}</Text>
                    <Badge label={t('price.toBeConfirmed')} tone="neutral" />
                  </View>
                ) : (
                  <>
                    {item.lineTotal != null ? (
                      <Text style={styles.lineTotal}>
                        {t('basket.lineTotal', { amount: Number(item.lineTotal).toFixed(3) })}
                      </Text>
                    ) : null}
                    <Text style={styles.linePrice}>{linePriceLabel(item, t)}</Text>
                  </>
                )}
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => changeQty(item, -1)}
                    disabled={busy}
                    style={[styles.qtyBtn, busy && styles.qtyBtnBusy]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      atMin
                        ? t('basket.removeItemA11y', { name })
                        : t('basket.qtyDecrease', { name })
                    }
                    accessibilityState={{ disabled: busy }}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={styles.qtyBtnText}>−</Text>
                    )}
                  </Pressable>
                  <Text
                    style={styles.qtyVal}
                    accessibilityLabel={t('product.quantityValueA11y', { quantity: item.quantity })}
                    accessibilityLiveRegion="polite"
                  >
                    {item.quantity}
                  </Text>
                  <Pressable
                    onPress={() => changeQty(item, 1)}
                    disabled={busy}
                    style={[styles.qtyBtn, busy && styles.qtyBtnBusy]}
                    accessibilityRole="button"
                    accessibilityLabel={t('basket.qtyIncrease', { name })}
                    accessibilityState={{ disabled: busy }}
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
      />

      {!isEmpty ? (
        <View style={[styles.footer, { maxWidth, width: '100%', alignSelf: 'center' }]}>
          <View style={styles.totalRow}>
            <View style={styles.totalCopy}>
              <Text style={styles.totalValue}>
                {t('basket.compactCounts', {
                  products: uniqueProductCount,
                  units: cart.totalQuantity,
                })}
              </Text>
              {showEstimatedTotal ? (
                <Text style={styles.grandTotal}>{cart.grandTotal.toFixed(3)} TND</Text>
              ) : null}
            </View>
          </View>
          {hasStaffPricing ? <Text style={styles.staffNote}>{t('basket.staffNote')}</Text> : null}
          {!showEstimatedTotal && !hasStaffPricing ? (
            <Text style={styles.grandNote}>{t('basket.finalAtCashier')}</Text>
          ) : null}
          <PrimaryButton
            label={t('basket.generateCashierQr')}
            onPress={onGenerateCashierQr}
            loading={generatingQr}
            disabled={generatingQr}
          />
          <Text style={styles.footerNote}>{t('basket.cashierOnlyNote')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  flex: { flex: 1 },
  errorBanner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.error },
  retryLink: { fontSize: 13, fontWeight: '600', color: colors.primary },
  capacityHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.cream,
  },
  uniqueCount: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  progressRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceMuted,
  },
  progressDotOn: { backgroundColor: colors.primary },
  limitWarning: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.error,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  list: { paddingBottom: 120, backgroundColor: colors.surface },
  listEmpty: { flexGrow: 1 },
  emptyWrap: {
    flexGrow: 1,
    width: '100%',
    paddingHorizontal: spacing.lg,
  },
  emptyTop: { flexGrow: 2, minHeight: spacing.sm },
  emptyBottom: { flexGrow: 3, minHeight: spacing.sm },
  emptyGroup: {
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: { ...typography.heading, textAlign: 'center' },
  emptyBody: { ...typography.bodyMuted, textAlign: 'center' },
  emptyActions: {
    width: '100%',
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  emptyListLink: {
    minHeight: 44,
    maxWidth: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: 'center',
  },
  emptyListLinkText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 15,
    textAlign: 'center',
    flexShrink: 1,
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  rowBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '500', color: colors.text, lineHeight: 22 },
  pack: { ...typography.caption, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  linePrice: { ...typography.caption, marginTop: 2 },
  linePriceMuted: { ...typography.caption, color: colors.textMuted },
  lineTotal: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 4 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnBusy: { opacity: 0.7 },
  qtyBtnText: { fontSize: 22, color: colors.primary, fontWeight: '600', lineHeight: 24 },
  qtyVal: {
    minWidth: 36,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.cream,
    gap: spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  totalCopy: { flex: 1, minWidth: 0 },
  totalValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  grandTotal: { fontSize: 20, fontWeight: '700', color: colors.primary, marginTop: 2 },
  grandNote: { ...typography.caption },
  staffNote: { ...typography.caption, color: colors.primaryDark },
  footerNote: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    textAlign: 'center',
  },
});
