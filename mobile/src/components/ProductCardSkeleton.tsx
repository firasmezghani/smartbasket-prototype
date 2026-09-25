import { StyleSheet, View, type DimensionValue } from 'react-native';
import { Skeleton } from './Skeleton';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';

type Props = { width?: DimensionValue; variant?: 'grid' | 'preview' };

// Loading placeholder shaped like `ProductCard` (matches the compact preview when asked).
export function ProductCardSkeleton({ width, variant = 'grid' }: Props) {
  const preview = variant === 'preview';
  return (
    <View style={[styles.card, width != null ? { width } : styles.flex]}>
      {preview ? (
        <Skeleton height={116} round={0} />
      ) : (
        <View style={styles.image}>
          <Skeleton height="100%" round={0} />
        </View>
      )}
      <View style={[styles.body, preview && styles.bodyCompact]}>
        <Skeleton width="55%" height={9} />
        <Skeleton width="90%" height={13} style={styles.gap} />
        <Skeleton width="45%" height={13} style={preview ? styles.gap : styles.gapWide} />
      </View>
    </View>
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
  flex: { flex: 1 },
  image: { width: '100%', aspectRatio: 1 },
  body: { padding: spacing.md },
  bodyCompact: { padding: spacing.sm },
  gap: { marginTop: spacing.sm },
  gapWide: { marginTop: spacing.md },
});
