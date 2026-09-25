import { Alert, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../components/AppIcon';
import { ErrorState } from '../components/ErrorState';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenCard } from '../components/ScreenCard';
import { ScreenContainer } from '../components/ScreenContainer';
import { usePersonalRecipes } from '../context/PersonalRecipesContext';
import { useI18n } from '../i18n/I18nContext';
import type { MyRecipeDetailProps } from '../types/navigation';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export function MyRecipeDetailScreen({ navigation, route }: MyRecipeDetailProps) {
  const { recipeId } = route.params;
  const { t } = useI18n();
  const { recipeById, deleteRecipe, status } = usePersonalRecipes();
  const recipe = recipeById(recipeId);

  const onDelete = () => {
    Alert.alert(t('myRecipes.deleteTitle'), t('myRecipes.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const result = await deleteRecipe(recipeId);
            if (!result.ok) {
              Alert.alert(t('myRecipes.saveFailed'));
              return;
            }
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('MyRecipes');
            }
          })();
        },
      },
    ]);
  };

  if (status === 'error') {
    return <ErrorState message={t('myRecipes.loadError')} />;
  }

  if (!recipe) {
    return (
      <ScreenContainer background={colors.cream}>
        <ErrorState message={t('myRecipes.removed')} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer background={colors.cream}>
      <ScreenCard>
        <View style={styles.iconStage}>
          <AppIcon name="restaurant-outline" size={28} color={colors.primary} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {recipe.title}
        </Text>
        <Text style={styles.note}>{t('myRecipes.deviceNote')}</Text>
      </ScreenCard>
      <ScreenCard>
        <Text style={styles.heading}>{t('myRecipes.ingredientsHeading')}</Text>
        {recipe.ingredients.map((row) => (
          <View key={row.id} style={styles.ingRow}>
            <Text style={styles.ingName}>{row.name}</Text>
            {row.amount ? <Text style={styles.ingAmount}>{row.amount}</Text> : null}
          </View>
        ))}
      </ScreenCard>
      {recipe.instructions ? (
        <ScreenCard>
          <Text style={styles.heading}>{t('myRecipes.instructionsLabel')}</Text>
          <Text style={styles.body}>{recipe.instructions}</Text>
        </ScreenCard>
      ) : null}
      <PrimaryButton
        label={t('myRecipes.addToList')}
        onPress={() => navigation.navigate('MyRecipeAddToList', { recipeId: recipe.id })}
      />
      <View style={styles.gap} />
      <PrimaryButton
        label={t('myRecipes.edit')}
        variant="outline"
        onPress={() => navigation.navigate('MyRecipeEditor', { recipeId: recipe.id })}
      />
      <View style={styles.gap} />
      <PrimaryButton label={t('myRecipes.delete')} variant="secondary" onPress={onDelete} />
      <View style={styles.bottomPad} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  iconStage: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.title, marginBottom: spacing.sm },
  note: { ...typography.caption },
  heading: { ...typography.heading, marginBottom: spacing.md },
  body: { ...typography.body },
  ingRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ingName: { ...typography.body },
  ingAmount: { ...typography.caption, marginTop: 2 },
  gap: { height: spacing.md },
  bottomPad: { height: spacing.xxl },
});
