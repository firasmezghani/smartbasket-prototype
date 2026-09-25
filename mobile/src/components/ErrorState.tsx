import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { useI18n } from '../i18n/I18nContext';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = {
  message: string;
  onRetry?: () => void;
  // Overrides the default localised "Retry" label.
  retryLabel?: string;
  retryLoading?: boolean;
};

export function ErrorState({ message, onRetry, retryLabel, retryLoading }: Props) {
  const { t } = useI18n();
  const label = retryLabel ?? t('common.retry');

  return (
    <View style={styles.wrap}>
      <Text style={styles.message} accessibilityRole="alert">
        {message}
      </Text>
      {onRetry ? (
        <View style={styles.btn}>
          <PrimaryButton
            label={label}
            onPress={onRetry}
            variant="outline"
            loading={retryLoading}
            disabled={retryLoading}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  message: {
    ...typography.body,
    textAlign: 'center',
    color: colors.error,
    backgroundColor: colors.errorBg,
    padding: spacing.lg,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  btn: { marginTop: spacing.lg, width: '100%', maxWidth: 220 },
});
