import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FormField } from '../components/FormField';
import { IdentityCard } from '../components/IdentityCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { friendlyErrorMessage } from '../lib/errors';
import { findRegistrationProblem, type RegistrationProblem } from '../lib/authValidation';
import type { RegisterProps } from '../types/navigation';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { shadows } from '../theme/shadows';
import { typography } from '../theme/typography';

const PROBLEM_MESSAGE: Record<RegistrationProblem, TranslationKey> = {
  nameRequired: 'auth.errorNameRequired',
  emailRequired: 'auth.errorEmailRequired',
  emailInvalid: 'auth.errorEmailInvalid',
  passwordRequired: 'auth.errorPasswordRequired',
  passwordMismatch: 'auth.errorPasswordMismatch',
};

export function RegisterScreen({ navigation, route }: RegisterProps) {
  const { register } = useAuth();
  const { t } = useI18n();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const returnTo = route.params?.returnTo;

  const onSubmit = async () => {
    setError(null);
    const problem = findRegistrationProblem({ fullName, email, password, confirmPassword });
    if (problem) {
      setError(t(PROBLEM_MESSAGE[problem]));
      return;
    }
    setLoading(true);
    try {
      // Phone is optional on the server, so the app does not ask for it.
      await register({ fullName: fullName.trim(), email: email.trim(), password });
      // After registering, remove the sign-up screens so Back does not return to them.
      navigation.reset({ index: 0, routes: [{ name: 'InsightsHome' }] });
      if (returnTo === 'recipeIdeas') {
        navigation.getParent()?.navigate('Home', { screen: 'RecipeIdeas' });
      } else if (returnTo === 'myRecipes') {
        navigation.getParent()?.navigate('Home', { screen: 'MyRecipes' });
      } else if (returnTo === 'shoppingList') {
        navigation.getParent()?.navigate('Home', { screen: 'ShoppingList' });
      } else if (returnTo === 'history') {
        navigation.navigate('MyOrders');
      }
    } catch (e) {
      setError(friendlyErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const mismatch =
    confirmPassword.length > 0 && password.length > 0 && confirmPassword !== password;

  return (
    <ScreenContainer background={colors.cream} adjustKeyboardInsets contentContainerStyle={styles.content}>
        <IdentityCard
          eyebrow={t('home.eyebrow')}
          title={t('auth.registerTitle')}
          subtitle={t('auth.registerSubtitle')}
        />

        <View style={styles.card}>
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <Text style={styles.group}>{t('auth.groupDetails')}</Text>
          <FormField
            label={t('auth.fullName')}
            icon="person-outline"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            editable={!loading}
          />
          <FormField
            label={t('auth.email')}
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            editable={!loading}
          />

          <Text style={[styles.group, styles.groupGap]}>{t('auth.groupSecurity')}</Text>
          <FormField
            label={t('auth.password')}
            icon="lock-closed-outline"
            secureToggle
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password-new"
            textContentType="newPassword"
            returnKeyType="next"
            editable={!loading}
          />
          <FormField
            label={t('auth.confirmPassword')}
            icon="lock-closed-outline"
            secureToggle
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="password-new"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            editable={!loading}
            error={mismatch ? t('auth.errorPasswordMismatch') : null}
          />

          <PrimaryButton
            label={t('common.createAccount')}
            onPress={onSubmit}
            loading={loading}
            disabled={loading}
          />
        </View>

        <Pressable
          accessibilityRole="link"
          onPress={() => navigation.replace('Login', returnTo ? { returnTo } : undefined)}
          style={styles.linkHit}
        >
          <Text style={styles.link}>{t('auth.haveAccount')}</Text>
        </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.soft,
  },
  group: { ...typography.eyebrow, color: colors.primary, marginBottom: spacing.sm },
  groupGap: { marginTop: spacing.sm },
  error: {
    ...typography.body,
    color: colors.error,
    backgroundColor: colors.errorBg,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  linkHit: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  link: { ...typography.body, color: colors.primary, fontWeight: '600', textAlign: 'center' },
});
