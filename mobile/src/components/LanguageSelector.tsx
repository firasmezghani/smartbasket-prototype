import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import type { Language } from '../i18n/translations';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();

  const options: { id: Language; label: string }[] = [
    { id: 'en', label: t('account.languageEnglish') },
    { id: 'fr', label: t('account.languageFrench') },
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('account.language')}</Text>
      <View style={styles.row}>
        {options.map((opt) => {
          const active = language === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => void setLanguage(opt.id)}
              hitSlop={4}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={2}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.label },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flex: 1,
    minWidth: 88,
    minHeight: 36,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  chipTextActive: { color: colors.textOnPrimary },
});
