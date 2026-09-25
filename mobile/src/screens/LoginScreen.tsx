import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FormField } from '../components/FormField';
import { IdentityCard } from '../components/IdentityCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { friendlyErrorMessage } from '../lib/errors';
import type { LoginProps } from '../types/navigation';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { shadows } from '../theme/shadows';
import { typography } from '../theme/typography';

export function LoginScreen({ navigation, route }: LoginProps) {
  const { login } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const returnTo = route.params?.returnTo;

  const onSubmit = async () => {
    setError(null);
    if (!email.trim()) {
      setError(t('auth.errorEmailRequired'));
      return;
    }
    if (!password) {
      setError(t('auth.errorPasswordRequired'));
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      // After sign-in, remove the login screens so Back does not return to them.
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

  return (
    <ScreenContainer background={colors.cream} adjustKeyboardInsets contentContainerStyle={styles.content}>
        <IdentityCard
          eyebrow={t('home.eyebrow')}
          title={t('auth.signInTitle')}
          subtitle={t('auth.signInSubtitle')}
        />

        <View style={styles.card}>
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

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
          <FormField
            label={t('auth.password')}
            icon="lock-closed-outline"
            secureToggle
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            editable={!loading}
          />

          <PrimaryButton
            label={t('common.signIn')}
            onPress={onSubmit}
            loading={loading}
            disabled={loading}
          />
        </View>

        <Pressable
          accessibilityRole="link"
          onPress={() => navigation.replace('Register', returnTo ? { returnTo } : undefined)}
          style={styles.linkHit}
        >
          <Text style={styles.link}>{t('auth.needAccount')}</Text>
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
