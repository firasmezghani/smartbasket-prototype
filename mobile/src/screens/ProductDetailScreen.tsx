import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchProductById } from '../api/catalog';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { PriceTag } from '../components/PriceTag';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProductImage } from '../components/ProductImage';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useI18n } from '../i18n/I18nContext';
import { useShoppingList } from '../context/ShoppingListContext';
import { captureAccountScope, isCurrentAccountScope } from '../lib/accountScope';
import { listCollectMeta } from '../lib/cartAddOutcome';
import { friendlyErrorMessage } from '../lib/errors';
import { catalogAllowsDirectBasketAdd } from '../lib/catalogActionPolicy';
import { hasCatalogueDescription, isPriceOnRequest, productCategoryText, safeTrim } from '../lib/catalogDisplay';
import { formatProductName, plainProductName } from '../lib/productName';
import { packageChoiceParts } from '../lib/genericChecklist';
import type { Product } from '../types/catalog';
import type { ProductDetailProps } from '../types/navigation';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

const MIN_QTY = 1;
const MAX_QTY = 99;

export function ProductDetailScreen({ route }: ProductDetailProps) {
  const { productId } = route.params;
  const { addItem } = useCart();
  const { t } = useI18n();
  const { customer, accountGeneration } = useAuth();
  const { addProductItem, presentAddFeedback } = useShoppingList();
  const accountRef = useRef(
    captureAccountScope(customer?.id != null ? String(customer.id) : null, accountGeneration),
  );
  accountRef.current = captureAccountScope(
    customer?.id != null ? String(customer.id) : null,
    accountGeneration,
  );
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addingToList, setAddingToList] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await fetchProductById(productId);
      setProduct(p);
    } catch (e) {
      setError(friendlyErrorMessage(e));
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const onAdd = async () => {
    setAdding(true);
    const name = safeTrim(product?.name) || t('common.product');
    const started = accountRef.current;
    try {
      const result = await addItem(productId, quantity);
      if (!isCurrentAccountScope(started, accountRef.current)) return;
      const collect = listCollectMeta(result.listSync);
      presentAddFeedback({
        started,
        addConfirmed: true,
        productName: name,
        productId,
        listSynced: result.listSync.status === 'ok',
        collectKind: collect.collectKind,
        remainingUnchecked: collect.remainingUnchecked,
        eligibleManualCount: collect.eligibleManualCount,
        extraMarked: collect.extraMarked,
        extraDecremented: collect.extraDecremented,
        productCanonicalType: product?.canonicalType,
        classificationStatus: product?.classificationStatus,
        packageLabel: product ? packageChoiceParts(product).join(' · ') || name : name,
      });
    } catch (e) {
      if (isCurrentAccountScope(started, accountRef.current)) {
        Alert.alert(t('product.couldNotAdd'), friendlyErrorMessage(e));
      }
    } finally {
      if (isCurrentAccountScope(started, accountRef.current)) setAdding(false);
    }
  };

  const onAddToList = async () => {
    const name = safeTrim(product?.name) || t('common.product');
    setAddingToList(true);
    try {
      await addProductItem({ productId, label: name, quantity });
      Alert.alert(t('list.addedTitle'), t('list.addedProduct', { name }));
    } catch (e) {
      Alert.alert(t('list.addFailed'), friendlyErrorMessage(e));
    } finally {
      setAddingToList(false);
    }
  };

  if (loading) {
    return <LoadingState message={t('product.loading')} />;
  }

  if (error || !product) {
    return <ErrorState message={error || t('product.notFound')} onRetry={load} />;
  }

  const brand = safeTrim(product.brand);
  const rawName = safeTrim(product.name) || t('common.product');
  const displayName = formatProductName(rawName);
  // Detail has room: keep the full "Main category · Subcategory".
  const cat = productCategoryText(product, t);
  const dbDesc = safeTrim(product.description);
  const onRequest = isPriceOnRequest(product);
  const busy = adding || addingToList;
  // Customers add products to their list here; scanning in store adds them to
  // the basket. The direct add button is for demos only.
  const showDemoAddToBasket = catalogAllowsDirectBasketAdd();

  return (
    <ScreenContainer background={colors.cream} contentContainerStyle={styles.scroll}>
      <View style={styles.content}>
      <View style={styles.stage}>
        <ProductImage product={product} size="detail" />
      </View>

      <View style={styles.headerBlock}>
        {brand ? <Text style={styles.brand}>{brand}</Text> : null}
        <Text
          style={styles.title}
          accessibilityRole="header"
          accessibilityLabel={plainProductName(rawName)}
        >
          {displayName}
        </Text>
        {cat ? <Text style={styles.category}>{cat}</Text> : null}
        <View style={styles.priceBlock}>
          <PriceTag product={product} size="detail" />
        </View>
        {onRequest ? <Text style={styles.priceNote}>{t('product.priceNote')}</Text> : null}
      </View>

      {hasCatalogueDescription(dbDesc) ? (
        <Text style={styles.description}>{dbDesc}</Text>
      ) : null}

      <View style={styles.actionBlock}>
        <View style={styles.qtyRow}>
          <Text style={styles.qtyLabel}>{t('product.quantity')}</Text>
          <View style={styles.qtyControls}>
            <Pressable
              style={[styles.qtyBtn, quantity <= MIN_QTY && styles.qtyBtnDisabled]}
              onPress={() => setQuantity((q) => Math.max(MIN_QTY, q - 1))}
              disabled={quantity <= MIN_QTY}
              accessibilityRole="button"
              accessibilityLabel={t('product.quantityDecrease')}
              accessibilityState={{ disabled: quantity <= MIN_QTY }}
            >
              <Text style={styles.qtyBtnText}>−</Text>
            </Pressable>
            <Text
              style={styles.qtyValue}
              accessibilityLabel={t('product.quantityValueA11y', { quantity })}
              accessibilityLiveRegion="polite"
            >
              {quantity}
            </Text>
            <Pressable
              style={[styles.qtyBtn, quantity >= MAX_QTY && styles.qtyBtnDisabled]}
              onPress={() => setQuantity((q) => Math.min(MAX_QTY, q + 1))}
              disabled={quantity >= MAX_QTY}
              accessibilityRole="button"
              accessibilityLabel={t('product.quantityIncrease')}
              accessibilityState={{ disabled: quantity >= MAX_QTY }}
            >
              <Text style={styles.qtyBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        <PrimaryButton
          label={t('product.addToShoppingList')}
          onPress={onAddToList}
          loading={addingToList}
          disabled={busy}
          accessibilityHint={t('product.addToShoppingListHint')}
        />
        <Text style={styles.scanHint}>{t('product.scanInStoreHint')}</Text>
      </View>
      {showDemoAddToBasket ? (
        <View style={styles.demoAction}>
          <Text style={styles.demoNote}>{t('product.demoAddToBasketNote')}</Text>
          <PrimaryButton
            label={t('product.demoAddToBasket')}
            onPress={onAdd}
            loading={adding}
            disabled={busy}
            variant="outline"
            accessibilityHint={t('product.demoAddToBasketHint')}
          />
        </View>
      ) : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl * 2 },
  content: { gap: spacing.lg },
  stage: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  headerBlock: { gap: spacing.xs },
  brand: { ...typography.eyebrow, color: colors.textMuted },
  title: { ...typography.heading, fontSize: 20, lineHeight: 26 },
  category: { ...typography.caption },
  priceBlock: { marginTop: spacing.xs },
  priceNote: { ...typography.caption },
  description: typography.bodyMuted,
  actionBlock: { gap: spacing.md },
  scanHint: { ...typography.caption },
  demoAction: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  demoNote: { ...typography.caption, color: colors.textMuted },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  qtyLabel: { ...typography.body, fontWeight: '600' },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qtyBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDisabled: { opacity: 0.4 },
  qtyBtnText: { fontSize: 22, color: colors.primary, fontWeight: '600' },
  qtyValue: { fontSize: 18, fontWeight: '600', minWidth: 36, textAlign: 'center', color: colors.text },
});
