import { StyleSheet, Text, View } from 'react-native';
import { AppIcon, type IconName } from './AppIcon';
import { DecorBackdrop } from './DecorBackdrop';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { shadows } from '../theme/shadows';
import { typography } from '../theme/typography';

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon?: IconName;
  compact?: boolean;
};

// Green header card with an icon, a small label, a title and a subtitle.
export function IdentityCard({ eyebrow, title, subtitle, icon = 'basket', compact = false }: Props) {
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <DecorBackdrop
        from={colors.surface}
        to={colors.primaryLight}
        accent={colors.primary}
        secondary={colors.decorClay}
      />
      <View style={styles.accentBar} />
      <View style={styles.dots} pointerEvents="none">
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={styles.dot} />
        ))}
      </View>

      <View style={[styles.mark, compact && styles.markCompact]}>
        <AppIcon name={icon} size={compact ? 22 : 26} color={colors.primary} />
      </View>

      <View style={styles.copy}>
        <Text style={styles.eyebrow} numberOfLines={1}>
          {eyebrow}
        </Text>
        {/* No line clamps: the card height is driven by the wrapped title and subtitle so nothing is cut off in EN, FR, or at large font sizes. */}
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    // Baseline size only, content (wrapped title + subtitle) drives the real
    // height. No `height` / `maxHeight` anywhere.
    minHeight: 88,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
    ...shadows.soft,
  },
  cardCompact: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, minHeight: 76 },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: spacing.lg,
    bottom: spacing.lg,
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: colors.primary,
  },
  dots: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    width: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    opacity: 0.6,
  },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  // Fixed-size icon square; the text column sizes itself.
  mark: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: `${colors.primary}33`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markCompact: { width: 44, height: 44 },
  // Leave space on the right for the decorative dots.
  copy: { flex: 1, minWidth: 0, paddingRight: 30 },
  eyebrow: { ...typography.eyebrow, color: colors.primary, marginBottom: spacing.xs },
  title: { ...typography.display, fontSize: 22, lineHeight: 27 },
  subtitle: { ...typography.bodyMuted, marginTop: spacing.xs },
});
