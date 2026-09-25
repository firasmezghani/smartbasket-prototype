import { forwardRef, useRef, useState, type Ref } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { AppIcon, type IconName } from './AppIcon';
import { useI18n } from '../i18n/I18nContext';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = TextInputProps & {
  // Visible field label, also used as the input's accessibility label.
  label: string;
  // Validation message; when present it replaces the hint and is announced.
  error?: string | null;
  // Optional helper text shown under the input when there is no error.
  hint?: string;
  // Optional leading icon inside the field.
  icon?: IconName;
  // Show an eye toggle for a `secureTextEntry` field.
  secureToggle?: boolean;
  // Keep the label for assistive tech but hide it visually (e.g. a search box).
  hideLabel?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') ref(value);
  else ref.current = value;
}

// Labelled text input with an optional leading icon and password reveal.
export const FormField = forwardRef<TextInput, Props>(function FormField(
  {
    label,
    error,
    hint,
    icon,
    secureToggle,
    hideLabel,
    containerStyle,
    style,
    secureTextEntry,
    onFocus,
    onBlur,
    ...inputProps
  },
  ref,
) {
  const { t } = useI18n();
  const innerRef = useRef<TextInput>(null);
  const [revealed, setRevealed] = useState(false);
  const secure = Boolean(secureTextEntry) && !(secureToggle && revealed);

  const focusInput = () => {
    innerRef.current?.focus();
  };

  return (
    <View style={[styles.wrap, containerStyle]}>
      {hideLabel ? null : <Text style={styles.label}>{label}</Text>}
      <Pressable
        onPress={focusInput}
        style={[styles.field, error ? styles.fieldError : null]}
      >
        {icon ? (
          <AppIcon name={icon} size={18} color={error ? colors.error : colors.textSubtle} />
        ) : null}
        <TextInput
          ref={(node) => {
            innerRef.current = node;
            assignRef(ref, node);
          }}
          placeholderTextColor={colors.textSubtle}
          accessibilityLabel={label}
          secureTextEntry={secure}
          {...inputProps}
          showSoftInputOnFocus
          onFocus={onFocus}
          onBlur={onBlur}
          style={[styles.input, style]}
        />
        {secureToggle && secureTextEntry ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
            style={styles.eye}
          >
            <AppIcon
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={colors.textSubtle}
            />
          </Pressable>
        ) : null}
      </Pressable>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { ...typography.label, marginBottom: spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  fieldError: { borderColor: colors.error, backgroundColor: colors.errorBg },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 22,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  eye: { padding: spacing.xs },
  error: { ...typography.caption, color: colors.error, marginTop: spacing.xs },
  hint: { ...typography.caption, marginTop: spacing.xs },
});
