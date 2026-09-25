import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon, type IconName } from './AppIcon';
import type { AddChecklistNoticeTone } from '../lib/manualListMatch';
import { colors } from '../theme/colors';
import { shadows } from '../theme/shadows';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = {
  tone: AddChecklistNoticeTone;
  heading: string;
  details: string;
  onClose: () => void;
  closeLabel: string;
  action?: ReactNode;
};

const TONE_ICON: Record<AddChecklistNoticeTone, { name: IconName; color: string }> = {
  success: { name: 'checkmark-circle', color: colors.success },
  partial: { name: 'alert-circle', color: colors.warning },
  unresolved: { name: 'help-circle', color: colors.info },
};

export function FeedbackNotice({ tone, heading, details, onClose, closeLabel, action }: Props) {
  const icon = TONE_ICON[tone];
  const announcement = details ? `${heading}. ${details}` : heading;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AppIcon name={icon.name} size={28} color={icon.color} />
        </View>
        <View
          style={styles.copy}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={announcement}
        >
          <Text style={styles.heading} accessibilityRole="header">
            {heading}
          </Text>
          {details ? <Text style={styles.details}>{details}</Text> : null}
        </View>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          hitSlop={4}
        >
          <AppIcon name="close" size={22} color={colors.text} />
        </Pressable>
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  copy: { flex: 1, minWidth: 0 },
  heading: {
    ...typography.heading,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  details: {
    ...typography.body,
    color: colors.text,
    marginTop: spacing.xs,
    flexShrink: 1,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
    marginRight: -8,
  },
  closePressed: { opacity: 0.7 },
  action: { marginTop: spacing.md },
});
