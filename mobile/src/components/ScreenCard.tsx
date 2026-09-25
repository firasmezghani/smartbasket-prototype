import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors } from '../theme/colors';
import { shadows } from '../theme/shadows';
import { radius, spacing } from '../theme/spacing';

type Props = ViewProps & {
  children: ReactNode;
  // Card style: default (white), muted or accent.
  tone?: 'default' | 'muted' | 'accent';
  // Apply a small elevation shadow.
  elevated?: boolean;
};

export function ScreenCard({
  children,
  style,
  tone = 'default',
  elevated = false,
  ...rest
}: Props) {
  return (
    <View
      style={[
        styles.card,
        tone === 'muted' && styles.muted,
        tone === 'accent' && styles.accent,
        elevated && shadows.sm,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  muted: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  accent: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryLight,
  },
});
