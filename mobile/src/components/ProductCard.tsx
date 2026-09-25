import { Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import type { Product } from '../types/catalog';
import { useI18n } from '../i18n/I18nContext';
import { formatPrice, productCategoryText, safeTrim } from '../lib/catalogDisplay';
import { formatProductName, plainProductName, shouldShowBrandEyebrow } from '../lib/productName';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { PriceTag } from './PriceTag';
import { ProductImage } from './ProductImage';

type Props = {
  product: Product;
  onPress: () => void;
  // Explicit width for a calculated responsive grid.
  width?: DimensionValue;
  // 'grid' is the normal card; 'preview' is a smaller card for horizontal lists.
  variant?: 'grid' | 'preview';
};

export function ProductCard({ product, onPress, width, variant = 'grid' }: Props) {
  const { t } = useI18n();
  const preview = variant === 'preview';

  const rawName =
    safeTrim(product.name) || safeTrim(product.sourceName) || t('common.product');
  const name = formatProductName(rawName);
  const brand = safeTrim(product.brand);
  const showBrand = shouldShowBrandEyebrow(brand, rawName);
  // Card = narrow context: subcategory alone (or main category), never "Main · Sub".
  const category = productCategoryText(product, t, { compact: true });

  const a11yParts = [plainProductName(rawName)];
  if (showBrand) a11yParts.push(brand);
  if (category) a11yParts.push(category);
  a11yParts.push(formatPrice(product));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        width != null ? { width } : styles.flex,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={a11yParts.join('. ')}
      accessibilityHint={t('product.openHint')}
    >
      <View style={styles.imageWrap}>
        <ProductImage product={product} size={preview ? 'preview' : 'card'} />
      </View>
      <View style={[styles.body, preview && styles.bodyCompact]}>
        <View style={styles.copy}>
          {showBrand ? (
            <Text style={styles.brand} numberOfLines={1}>
              {brand}
            </Text>
          ) : null}
          <Text style={[styles.name, preview && styles.nameCompact]} numberOfLines={2}>
            {name}
          </Text>
          {category ? (
            <Text style={styles.category} numberOfLines={1}>
              {category}
            </Text>
          ) : null}
        </View>
        <View style={[styles.price, preview && styles.priceCompact]}>
          <PriceTag product={product} size="card" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  flex: { flex: 1, marginHorizontal: spacing.xs, marginBottom: spacing.md },
  pressed: { opacity: 0.94 },
  imageWrap: {
    backgroundColor: colors.surfaceMuted,
  },
  body: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  bodyCompact: { padding: spacing.sm, gap: spacing.xs },
  copy: { gap: 2, minHeight: 52 },
  brand: { ...typography.eyebrow, color: colors.textMuted },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 19,
  },
  nameCompact: { fontSize: 13, lineHeight: 17 },
  category: { ...typography.caption },
  price: { marginTop: 'auto' as const },
  priceCompact: { marginTop: spacing.xs },
});
