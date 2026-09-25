import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from './AppIcon';
import type { Product } from '../types/catalog';
import { useI18n } from '../i18n/I18nContext';
import { safeTrim } from '../lib/catalogDisplay';
import { getProductImageCandidates } from '../lib/productImages';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = {
  product: Product | null | undefined;
  // 'card' = results grid (square), 'preview' = compact landing card (shorter), 'detail' = product page, 'thumb' = basket row.
  size?: 'card' | 'preview' | 'detail' | 'thumb';
};

// Product image. Tries each image URL in turn and shows a placeholder if none loads.
export function ProductImage({ product, size = 'card' }: Props) {
  const { t } = useI18n();
  const candidates = useMemo(() => getProductImageCandidates(product), [product]);
  const candidatesKey = candidates.join('|');

  // Reset to the first candidate whenever the product / candidate list changes.
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
  }, [candidatesKey]);

  const dim =
    size === 'detail'
      ? styles.detail
      : size === 'preview'
        ? styles.preview
        : size === 'thumb'
          ? styles.thumb
          : styles.card;
  const name = safeTrim(product?.name) || t('common.product');
  const uri = index < candidates.length ? candidates[index] : null;

  if (!uri) {
    return (
      <View
        style={[dim, styles.placeholder]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('product.noImage')}
      >
        <View style={styles.placeholderMark}>
          <AppIcon name="pricetags-outline" size={size === 'detail' ? 28 : size === 'thumb' ? 18 : 22} color={colors.textSubtle} />
        </View>
        {size !== 'preview' && size !== 'thumb' ? (
          <Text style={styles.placeholderText}>{t('product.noImage')}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <Image
      // Keyed by the active URI so a failed source is fully unmounted before the
      // next one mounts (avoids a stuck error state on some RN versions).
      key={uri}
      source={{ uri }}
      style={dim}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel={t('product.imageAlt', { name })}
      onError={() => setIndex((i) => (i < candidates.length ? i + 1 : i))}
    />
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceMuted },
  // Compact landing preview: a shorter image band than the square grid card,
  // but still tall enough to read a real product photo once one is supplied.
  preview: { width: '100%', height: 116, backgroundColor: colors.surfaceMuted },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  detail: {
    width: '100%',
    height: 200,
    backgroundColor: colors.surfaceMuted,
  },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  placeholderMark: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { ...typography.caption, color: colors.textSubtle },
});
