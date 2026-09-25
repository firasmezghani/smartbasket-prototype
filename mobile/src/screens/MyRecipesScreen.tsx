import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenCard } from '../components/ScreenCard';
import { ScreenContainer } from '../components/ScreenContainer';
import { AppIcon } from '../components/AppIcon';
import { usePersonalRecipes } from '../context/PersonalRecipesContext';
import { useI18n } from '../i18n/I18nContext';
import type { MyRecipesProps } from '../types/navigation';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export function MyRecipesScreen({ navigation }: MyRecipesProps) {
  const { t } = useI18n();
  const { status, recipes, retry } = usePersonalRecipes();

  const goSignIn = () => {
    navigation.getParent()?.navigate('Insights', { screen: 'Login', params: { returnTo: 'myRecipes' } });
  };
  const goRegister = () => {
    navigation.getParent()?.navigate('Insights', { screen: 'Register', params: { returnTo: 'myRecipes' } });
  };

  if (status === 'signedOut') {
    return (
      <ScreenContainer background={colors.cream}>
        <ScreenCard>
          <Text style={styles.title} accessibilityRole="header">
            {t('myRecipes.signedOutTitle')}
          </Text>
          <Text style={styles.body}>{t('myRecipes.signedOutBody')}</Text>
          <Text style={styles.note}>{t('myRecipes.deviceNote')}</Text>
        </ScreenCard>
        <PrimaryButton label={t('common.signIn')} onPress={goSignIn} />
        <View style={styles.gap} />
        <PrimaryButton label={t('common.createAccount')} variant="outline" onPress={goRegister} />
      </ScreenContainer>
    );
  }

  if (status === 'loading') {
    return <LoadingState message={t('common.loading')} />;
  }

  if (status === 'error') {
    return (
      <ErrorState message={t('myRecipes.loadError')} onRetry={retry} retryLabel={t('common.retry')} />
    );
  }

  return (
    <ScreenContainer background={colors.cream}>
      <Text style={styles.note}>{t('myRecipes.deviceNote')}</Text>
      <PrimaryButton label={t('myRecipes.create')} onPress={() => navigation.navigate('MyRecipeEditor', {})} />
      <View style={styles.gap} />
      {recipes.length === 0 ? (
        <EmptyState
          title={t('myRecipes.emptyTitle')}
          message={t('myRecipes.emptyBody')}
          iconName="restaurant-outline"
          tone="recipes"
        />
      ) : (
        recipes.map((recipe) => (
          <Pressable
            key={recipe.id}
            onPress={() => navigation.navigate('MyRecipeDetail', { recipeId: recipe.id })}
            accessibilityRole="button"
            accessibilityLabel={recipe.title}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.iconStage}>
              <AppIcon name="restaurant-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{recipe.title}</Text>
              <Text style={styles.meta}>
                {t('myRecipes.ingredientCount', { count: recipe.ingredients.length })}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, marginBottom: spacing.sm },
  body: { ...typography.bodyMuted, marginBottom: spacing.md },
  note: { ...typography.caption, marginBottom: spacing.lg },
  gap: { height: spacing.md },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 48,
  },
  pressed: { opacity: 0.92 },
  iconStage: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  cardTitle: { ...typography.heading },
  meta: { ...typography.caption, marginTop: spacing.xs },
});
