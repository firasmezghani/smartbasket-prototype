import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = {
  title: string;
  // Optional small label above the title.
  eyebrow?: string;
  // Optional trailing text link.
  action?: { label: string; onPress: () => void };
};

// A section title (with optional eyebrow) and an optional right-aligned action.
export function SectionHeader({ title, eyebrow, action }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={8}
          style={styles.actionHit}
        >
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  copy: { flexShrink: 1 },
  eyebrow: { ...typography.eyebrow, color: colors.primary, marginBottom: spacing.xs },
  title: { ...typography.heading, flexShrink: 1 },
  actionHit: { minHeight: 44, justifyContent: 'center' },
  actionText: { ...typography.button, fontSize: 14, color: colors.primary },
});
