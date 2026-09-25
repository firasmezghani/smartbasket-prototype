import { StyleSheet, Text, View } from 'react-native';
import { Badge } from './Badge';
import { useI18n } from '../i18n/I18nContext';
import { formatPrice, isPriceOnRequest, parseSalePrice } from '../lib/catalogDisplay';
import type { Product } from '../types/catalog';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = {
  product: Product;
  size?: 'card' | 'detail';
};

// Product price, with the regular price and a deal badge during a promotion.
export function PriceTag({ product, size = 'card' }: Props) {
  const { t } = useI18n();
  const onRequest = isPriceOnRequest(product);
  const current = parseSalePrice(product);
  const priceText = onRequest || current == null ? formatPrice(product) : `${current.toFixed(3)} TND`;

  const oldPrice = Number(product.oldPrice);
  const showPromo =
    !onRequest &&
    current != null &&
    product.hasPromo === true &&
    Number.isFinite(oldPrice) &&
    oldPrice > current;

  const detail = size === 'detail';

  return (
    <View style={styles.row}>
      <Text
        style={[detail ? styles.priceDetail : styles.priceCard, onRequest && styles.muted]}
        numberOfLines={2}
      >
        {priceText}
      </Text>
      {showPromo ? (
        <Text style={styles.old} numberOfLines={1}>
          {t('product.wasPrice', { amount: oldPrice.toFixed(3) })}
        </Text>
      ) : null}
      {showPromo ? <Badge label={t('product.promoBadge')} tone="warning" /> : null}
      {onRequest && detail ? <Badge label={t('price.toBeConfirmed')} tone="neutral" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  priceCard: { ...typography.price, fontSize: 15 },
  priceDetail: { fontSize: 22, fontWeight: '800', color: colors.primary },
  muted: { color: colors.textMuted, fontWeight: '600' },
  old: { ...typography.caption, textDecorationLine: 'line-through' },
});
