import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = {
  // Overrides the default localised "Loading…" label.
  message?: string;
};

export function LoadingState({ message }: Props) {
  const { t } = useI18n();
  const label = message ?? t('common.loading');

  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.message}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  message: { ...typography.caption, marginTop: spacing.md, textAlign: 'center' },
});
