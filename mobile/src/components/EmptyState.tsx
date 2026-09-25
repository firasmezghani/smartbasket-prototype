import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FeatureIcon } from './FeatureIcon';
import type { IconName } from './AppIcon';
import type { FeatureKey } from '../theme/features';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = {
  title: string;
  message?: string;
  // Feature-toned icon stage (preferred).
  iconName?: IconName;
  tone?: FeatureKey;
  // Or any custom leading node.
  icon?: ReactNode;
  // Optional call to action, typically a button.
  action?: ReactNode;
};

// Centred "nothing here yet" block with a polished icon stage.
export function EmptyState({ title, message, iconName, tone = 'catalogue', icon, action }: Props) {
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      {iconName ? (
        <View style={styles.stage}>
          <FeatureIcon name={iconName} tone={tone} size={56} />
        </View>
      ) : icon ? (
        <View style={styles.stage}>{icon}</View>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  stage: {
    marginBottom: spacing.lg,
    padding: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceAlt,
  },
  title: { ...typography.heading, textAlign: 'center' },
  message: {
    ...typography.bodyMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 320,
  },
  action: { marginTop: spacing.xl, alignSelf: 'stretch', maxWidth: 320 },
});
