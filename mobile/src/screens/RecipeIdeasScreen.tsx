import { useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { PrimaryButton } from '../components/PrimaryButton';
import { RecipeImage } from '../components/RecipeImage';
import { ScreenCard } from '../components/ScreenCard';
import { ScreenContainer } from '../components/ScreenContainer';
import { AppIcon } from '../components/AppIcon';
import { useRecipeRecommendations } from '../hooks/useRecipeRecommendations';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { contentMaxWidth } from '../lib/layout';
import {
  buildRecipeCardSummary,
  difficultyKey,
  evidenceBadgeKey,
  type RecipeReadinessKind,
} from '../lib/recipeRequirements';
import type { RecipeIdeasProps } from '../types/navigation';
import type {
  RecipeRecommendationCard,
  RecommendationEvidenceSource,
} from '../types/recommendations';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

function ideasIntroKey(source: RecommendationEvidenceSource): TranslationKey {
  if (source === 'basket') return 'recipe.ideasIntroBasket';
  if (source === 'history') return 'recipe.ideasIntroHistory';
  return 'recipe.ideasIntroPopularity';
}

function statusColor(kind: RecipeReadinessKind): string {
  if (kind === 'ready') return colors.success;
  if (kind === 'missing' || kind === 'insufficient') return colors.error;
  if (kind === 'check_quantity') return colors.warning;
  return colors.text;
}

export function RecipeIdeasScreen({ navigation }: RecipeIdeasProps) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const { status, data, error, refreshing, retry, refresh } = useRecipeRecommendations();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const goSignIn = useCallback(() => {
    navigation.getParent()?.navigate('Insights', { screen: 'Login', params: { returnTo: 'recipeIdeas' } });
  }, [navigation]);

  const goRegister = useCallback(() => {
    navigation.getParent()?.navigate('Insights', { screen: 'Register', params: { returnTo: 'recipeIdeas' } });
  }, [navigation]);

  const myRecipesCard = (
    <Pressable
      onPress={() => navigation.navigate('MyRecipes')}
      accessibilityRole="button"
      accessibilityLabel={t('myRecipes.entryTitle')}
      accessibilityHint={t('myRecipes.entryHint')}
      style={({ pressed }) => [styles.myCard, pressed && styles.pressed]}
    >
      <View style={styles.myIcon}>
        <AppIcon name="bookmark-outline" size={22} color={colors.primary} />
      </View>
      <View style={styles.myBody}>
        <Text style={styles.cardName}>{t('myRecipes.entryTitle')}</Text>
        <Text style={styles.detail}>{t('myRecipes.entryBody')}</Text>
        <Text style={styles.meta}>{t('myRecipes.deviceNote')}</Text>
      </View>
    </Pressable>
  );

  const errorMessage = useMemo(() => {
    if (!error) return t('recipe.errorGeneric');
    if (error.kind === 'rateLimited') return t('recipe.errorRateLimited');
    if (error.kind === 'unavailable') return t('recipe.errorUnavailable');
    return error.message || t('recipe.errorGeneric');
  }, [error, t]);

  if (status === 'authRequired') {
    return (
      <ScreenContainer>
        {myRecipesCard}
        <ScreenCard>
          <Text style={styles.title} accessibilityRole="header">
            {t('recipe.signInTitle')}
          </Text>
          <Text style={styles.body}>{t('recipe.signInBody')}</Text>
        </ScreenCard>
        <PrimaryButton label={t('common.signIn')} onPress={goSignIn} />
        <View style={styles.gap} />
        <PrimaryButton label={t('common.createAccount')} variant="outline" onPress={goRegister} />
      </ScreenContainer>
    );
  }

  if (status === 'loading' && !data) {
    return <LoadingState message={t('recipe.loading')} />;
  }

  if (status === 'error' && !data) {
    return (
      <ScreenContainer>
        {myRecipesCard}
        <ErrorState
          message={errorMessage}
          onRetry={retry}
          retryLabel={t('common.retry')}
          retryLoading={refreshing}
        />
      </ScreenContainer>
    );
  }

  if (status === 'empty') {
    return (
      <ScreenContainer refreshing={refreshing} onRefresh={() => void refresh()}>
        {myRecipesCard}
        <EmptyState
          title={t('recipe.emptyTitle')}
          message={t('recipe.emptyBody')}
          action={
            <PrimaryButton label={t('common.retry')} variant="outline" onPress={retry} />
          }
        />
      </ScreenContainer>
    );
  }

  const recommendations = data?.recommendations ?? [];
  const listSource = data?.evidenceSource ?? 'popularity';
  const maxWidth = contentMaxWidth(width);

  return (
    <FlatList
      style={styles.root}
      data={recommendations}
      keyExtractor={(item) => item.recipeId}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />
      }
      contentContainerStyle={[styles.listContent, { maxWidth, width: '100%', alignSelf: 'center' }]}
      ListHeaderComponent={
        <View>
          {myRecipesCard}
          {status === 'error' ? <Text style={styles.error}>{errorMessage}</Text> : null}
          <Text style={styles.intro}>{t(ideasIntroKey(listSource))}</Text>
        </View>
      }
      ListEmptyComponent={
        <EmptyState title={t('recipe.emptyTitle')} message={t('recipe.emptyBody')} />
      }
      renderItem={({ item }) => (
        <RecipeIdeaRow
          card={item}
          onPress={() => navigation.navigate('RecipeDetail', { recipeId: item.recipeId })}
          t={t}
        />
      )}
    />
  );
}

function RecipeIdeaRow({
  card,
  onPress,
  t,
}: {
  card: RecipeRecommendationCard;
  onPress: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const prep =
    card.prepTimeMinutes != null
      ? t('recipe.prepTime', { minutes: card.prepTimeMinutes })
      : '';
  const difficulty = card.difficulty ? t(difficultyKey(card.difficulty)) : '';
  const source = t(evidenceBadgeKey(card.evidenceSource));
  const isPopular = card.evidenceSource === 'popularity' || card.personalised === false;
  const summary = buildRecipeCardSummary(card, t);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('recipe.cardA11y', {
        name: card.name,
        prep,
        difficulty,
        status: summary.a11yStatus,
        source,
      })}
      style={({ pressed }) => [
        styles.card,
        isPopular ? styles.cardPopular : styles.cardPersonal,
        pressed && styles.pressed,
      ]}
    >
      <RecipeImage recipeId={card.recipeId} name={card.name} size="card" />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.cardName}>{card.name}</Text>
          <Badge label={source} tone={isPopular ? 'neutral' : 'primary'} />
        </View>
        <Text style={styles.meta}>{[prep, difficulty].filter(Boolean).join(' · ')}</Text>
        <Text style={[styles.status, { color: statusColor(summary.kind) }]}>{summary.statusLine}</Text>
        {summary.detailLine ? <Text style={styles.detail}>{summary.detailLine}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.screen, paddingBottom: spacing.xxl * 2 },
  gap: { height: spacing.md },
  title: { ...typography.heading, marginBottom: spacing.sm },
  body: { ...typography.bodyMuted },
  intro: { ...typography.bodyMuted, marginBottom: spacing.md },
  error: {
    ...typography.body,
    color: colors.error,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    minHeight: 48,
    overflow: 'hidden',
  },
  cardBody: { padding: spacing.lg },
  cardPersonal: { borderLeftWidth: 4, borderLeftColor: colors.primary },
  cardPopular: { borderLeftWidth: 4, borderLeftColor: colors.border },
  pressed: { opacity: 0.92 },
  myCard: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 48,
  },
  myIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myBody: { flex: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardName: { ...typography.heading, flex: 1, flexShrink: 1 },
  meta: { ...typography.caption, marginTop: spacing.sm, color: colors.text },
  status: { ...typography.body, marginTop: spacing.sm, fontWeight: '700' },
  detail: { ...typography.caption, marginTop: spacing.xs },
});
