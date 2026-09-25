import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../api/http';
import { fetchRecipeRecommendationById } from '../api/recommendations';
import { Badge } from '../components/Badge';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { PrimaryButton } from '../components/PrimaryButton';
import { RecipeImage } from '../components/RecipeImage';
import { ScreenCard } from '../components/ScreenCard';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { useShoppingList } from '../context/ShoppingListContext';
import { useI18n } from '../i18n/I18nContext';
import { friendlyErrorMessage } from '../lib/errors';
import { classifyRecommendationErrorStatus } from '../lib/recommendations';
import {
  buildRecipeCardSummary,
  buildRequirementView,
  difficultyKey,
  evidenceBadgeKey,
  isHistoryAvailability,
  isNeutralRequirementSet,
  parseRequirements,
  partitionRequirements,
  resolveAvailabilitySemantics,
} from '../lib/recipeRequirements';
import { buildRecipeChecklistAdditionsFromSelection } from '../lib/recipeChecklist';
import type { RecipeDetailProps } from '../types/navigation';
import type {
  MissingLinkedProduct,
  RecipeRecommendationCard,
  RecommendationDetailData,
} from '../types/recommendations';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

function isAddableLink(item: MissingLinkedProduct): boolean {
  return typeof item.productId === 'string' && item.productId.trim() !== '';
}

export function RecipeDetailScreen({ navigation, route }: RecipeDetailProps) {
  const { recipeId } = route.params;
  const { t, language } = useI18n();
  const { customer, loading: authLoading } = useAuth();
  const { addProductItems } = useShoppingList();

  const [status, setStatus] = useState<'loading' | 'authRequired' | 'success' | 'error'>('loading');
  const [data, setData] = useState<RecommendationDetailData | null>(null);
  const [errorKind, setErrorKind] = useState<string>('unknown');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (mode: 'initial' | 'retry' | 'refresh' = 'initial') => {
      if (authLoading) return;
      if (!customer?.id) {
        requestIdRef.current += 1;
        if (mountedRef.current) {
          setStatus('authRequired');
          setData(null);
          setRefreshing(false);
        }
        return;
      }
      const requestId = ++requestIdRef.current;
      if (mode === 'refresh') {
        // Pull-to-refresh: keep the current recipe on screen while reloading,
        // instead of swapping the whole screen to the full loading state.
        if (mountedRef.current) setRefreshing(true);
      } else if (mountedRef.current) {
        setStatus('loading');
        setErrorMessage(null);
      }
      try {
        const result = await fetchRecipeRecommendationById(recipeId, language);
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        setData(result);
        setSelected(new Set());
        setStatus('success');
      } catch (err) {
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        const kind = classifyRecommendationErrorStatus(err instanceof ApiError ? err.status : undefined);
        if (kind === 'auth') {
          setStatus('authRequired');
          setData(null);
          return;
        }
        setErrorKind(kind);
        setErrorMessage(kind === 'unknown' ? friendlyErrorMessage(err) : null);
        setStatus('error');
      } finally {
        if (mountedRef.current && requestIdRef.current === requestId) {
          setRefreshing(false);
        }
      }
    },
    [authLoading, customer?.id, recipeId, language],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load('refresh');
    }, [load]),
  );

  const goSignIn = () => {
    navigation.getParent()?.navigate('Insights', { screen: 'Login', params: { returnTo: 'recipeIdeas' } });
  };

  const recipe: RecipeRecommendationCard | null = data?.recommendation ?? null;
  const requirements = useMemo(() => parseRequirements(recipe?.requirements), [recipe]);
  const neutralRequirements = useMemo(() => isNeutralRequirementSet(requirements), [requirements]);
  const partitioned = useMemo(() => partitionRequirements(requirements), [requirements]);
  const summary = useMemo(
    () => (recipe ? buildRecipeCardSummary(recipe, t) : null),
    [recipe, t],
  );
  const neutralOrderedRequirements = useMemo(
    () =>
      [...requirements].sort(
        (a, b) => (b.essential ? 1 : 0) - (a.essential ? 1 : 0),
      ),
    [requirements],
  );
  const addable = useMemo(
    () => (recipe?.missingLinkedProducts ?? []).filter(isAddableLink),
    [recipe],
  );
  const addableKeys = useMemo(() => new Set(addable.map((item) => item.ingredientKey)), [addable]);

  const toggleKey = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(addableKeys));
  const clearSelection = () => setSelected(new Set());

  const onAddSelected = async () => {
    if (!recipe || adding) return;
    if (selected.size === 0) {
      Alert.alert(t('recipe.noneSelected'));
      return;
    }
    const conversion = buildRecipeChecklistAdditionsFromSelection(
      recipe.recipeId,
      recipe.missingLinkedProducts,
      selected,
    );
    if (conversion.additions.length === 0) {
      Alert.alert(t('recipe.noneSelected'));
      return;
    }
    setAdding(true);
    try {
      const addedSummary = await addProductItems(conversion.additions);
      Alert.alert(
        t('recipe.addedTitle'),
        t('recipe.addedBody', {
          added: addedSummary.added,
          merged: addedSummary.merged,
          skipped: addedSummary.skipped + conversion.skipped.length,
        }),
        [
          { text: t('common.ok'), style: 'cancel' },
          { text: t('recipe.openList'), onPress() { navigation.navigate('ShoppingList'); } },
        ],
      );
      setSelected(new Set());
    } catch (err) {
      Alert.alert(t('recipe.addFailed'), friendlyErrorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  if (authLoading || status === 'loading') {
    return <LoadingState message={t('recipe.loadingDetail')} />;
  }

  if (status === 'authRequired') {
    return (
      <ScreenContainer>
        <ScreenCard>
          <Text style={styles.heading} accessibilityRole="header">
            {t('recipe.signInTitle')}
          </Text>
          <Text style={styles.body}>{t('recipe.signInBody')}</Text>
        </ScreenCard>
        <PrimaryButton label={t('common.signIn')} onPress={goSignIn} />
        <View style={styles.gap} />
        <PrimaryButton
          label={t('common.createAccount')}
          variant="outline"
          onPress={() =>
            navigation.getParent()?.navigate('Insights', { screen: 'Register', params: { returnTo: 'recipeIdeas' } })
          }
        />
      </ScreenContainer>
    );
  }

  if (status === 'error' || !recipe) {
    const message =
      errorKind === 'notFound'
        ? t('recipe.errorNotFound')
        : errorKind === 'rateLimited'
          ? t('recipe.errorRateLimited')
          : errorKind === 'unavailable'
            ? t('recipe.errorUnavailable')
            : errorMessage || t('recipe.errorGeneric');
    return (
      <ErrorState
        message={message}
        onRetry={() => void load('retry')}
        retryLabel={t('common.retry')}
      />
    );
  }

  const isPopular = recipe.evidenceSource === 'popularity' || recipe.personalised === false;
  const history = isHistoryAvailability(recipe);
  const semantics = resolveAvailabilitySemantics(recipe);
  const prep =
    recipe.prepTimeMinutes != null ? t('recipe.prepTime', { minutes: recipe.prepTimeMinutes }) : null;
  const difficulty = recipe.difficulty ? t(difficultyKey(recipe.difficulty)) : null;
  const whyNote = isPopular
    ? t('recipe.popularityNote')
    : history
      ? t('recipe.historyNote')
      : t('recipe.personalisedNote');

  const renderRequirement = (req: (typeof requirements)[number], prefix: string) => {
    const view = buildRequirementView(req, t, semantics);
    const tone =
      history || view.neutral
        ? styles.requirementNeutral
        : view.status === 'sufficient' || view.status === 'matched'
          ? styles.requirementOk
          : view.status === 'insufficient' || view.status === 'missing'
            ? styles.requirementBad
            : styles.requirementNeutral;
    return (
      <View
        key={`${prefix}-${view.key}`}
        style={styles.requirementBlock}
        accessible
        accessibilityLabel={[
          view.titleLabel,
          view.matchedWithLine,
          view.detectedLine,
          view.requiresLine,
          view.remainingLine,
          view.statusLine,
        ]
          .filter(Boolean)
          .join('. ')}
      >
        <Text style={styles.requirementTitle}>{view.titleLabel}</Text>
        {view.matchedWithLine ? <Text style={styles.requirementLine}>{view.matchedWithLine}</Text> : null}
        {view.detectedLine ? <Text style={styles.requirementLine}>{view.detectedLine}</Text> : null}
        {view.requiresLine ? <Text style={styles.requirementLine}>{view.requiresLine}</Text> : null}
        {view.remainingLine ? <Text style={styles.requirementLine}>{view.remainingLine}</Text> : null}
        <Text style={[styles.requirementStatus, tone]}>{view.statusLine}</Text>
        {!addableKeys.has(view.key) && view.status === 'missing' ? (
          <Text style={styles.unlinked}>{t('recipe.unlinkedNote')}</Text>
        ) : null}
      </View>
    );
  };

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={() => void load('refresh')}>
      <ScreenCard>
        <RecipeImage recipeId={recipe.recipeId} name={recipe.name} size="detail" />
        <View style={styles.titleRow}>
          <Text style={styles.title} accessibilityRole="header">
            {recipe.name}
          </Text>
          <Badge
            label={t(evidenceBadgeKey(recipe.evidenceSource))}
            tone={isPopular ? 'neutral' : 'primary'}
          />
        </View>
        {recipe.description ? <Text style={styles.body}>{recipe.description}</Text> : null}
        <Text style={styles.meta}>{[prep, difficulty].filter(Boolean).join(' · ')}</Text>
        {summary ? (
          <Text
            style={styles.coverage}
            accessibilityRole="header"
            accessibilityLabel={summary.a11yStatus}
          >
            {summary.overallLine}
          </Text>
        ) : null}
        {summary?.statusLine && summary.statusLine !== summary.overallLine ? (
          <Text style={styles.body}>{summary.statusLine}</Text>
        ) : null}
        <Pressable
          onPress={() => setWhyOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: whyOpen }}
          accessibilityLabel={t('recipe.whySuggestion')}
          style={styles.whyHit}
        >
          <Text style={styles.whyLabel}>{t('recipe.whySuggestion')}</Text>
        </Pressable>
        {whyOpen ? <Text style={styles.limitNote}>{whyNote}</Text> : null}
      </ScreenCard>

      {neutralRequirements ? (
        <ScreenCard>
          <Text style={styles.heading} accessibilityRole="header">
            {t('recipe.recipeRequirementsHeading')}
          </Text>
          {neutralOrderedRequirements.map((req) => renderRequirement(req, 'nreq'))}
        </ScreenCard>
      ) : history ? (
        <>
          <ScreenCard>
            <Text style={styles.heading} accessibilityRole="header">
              {t('recipe.associatedHistoryHeading')}
            </Text>
            {partitioned.associatedHistory.length === 0 ? (
              <Text style={styles.body}>{t('recipe.requirementsNoneMatchedHistory')}</Text>
            ) : (
              partitioned.associatedHistory.map((req) => renderRequirement(req, 'hist-have'))
            )}
          </ScreenCard>
          <ScreenCard>
            <Text style={styles.heading} accessibilityRole="header">
              {t('recipe.notAssociatedHistoryHeading')}
            </Text>
            {partitioned.notAssociatedHistory.length === 0 ? (
              <Text style={styles.body}>{t('recipe.missingEssentialNoneHistory')}</Text>
            ) : (
              partitioned.notAssociatedHistory.map((req) => renderRequirement(req, 'hist-need'))
            )}
          </ScreenCard>
          {partitioned.optionalAdditions.length > 0 ? (
            <ScreenCard>
              <Text style={styles.heading} accessibilityRole="header">
                {t('recipe.optionalAdditions')}
              </Text>
              {partitioned.optionalAdditions.map((req) => renderRequirement(req, 'hist-opt'))}
            </ScreenCard>
          ) : null}
        </>
      ) : (
        <>
          <ScreenCard>
            <Text style={styles.heading} accessibilityRole="header">
              {t('recipe.youHaveNow')}
            </Text>
            {partitioned.youHaveNow.length === 0 ? (
              <Text style={styles.body}>{t('recipe.requirementsNoneMatched')}</Text>
            ) : (
              partitioned.youHaveNow.map((req) => renderRequirement(req, 'have'))
            )}
          </ScreenCard>
          <ScreenCard>
            <Text style={styles.heading} accessibilityRole="header">
              {t('recipe.stillNeeded')}
            </Text>
            {partitioned.stillNeeded.length === 0 ? (
              <Text style={styles.body}>{t('recipe.missingEssentialNone')}</Text>
            ) : (
              partitioned.stillNeeded.map((req) => renderRequirement(req, 'need'))
            )}
          </ScreenCard>
          {partitioned.optionalAdditions.length > 0 ? (
            <ScreenCard>
              <Text style={styles.heading} accessibilityRole="header">
                {t('recipe.optionalAdditions')}
              </Text>
              {partitioned.optionalAdditions.map((req) => renderRequirement(req, 'opt'))}
            </ScreenCard>
          ) : null}
        </>
      )}

      {addable.length > 0 ? (
        <ScreenCard>
          <Text style={styles.heading} accessibilityRole="header">
            {t('recipe.addableHeading')}
          </Text>
          <Text style={styles.body}>{t('recipe.addableIntro')}</Text>
          <View style={styles.selectRow}>
            <Pressable
              onPress={selectAll}
              accessibilityRole="button"
              accessibilityLabel={t('recipe.selectAll')}
              style={styles.selectHit}
            >
              <Text style={styles.selectLink}>{t('recipe.selectAll')}</Text>
            </Pressable>
            <Pressable
              onPress={clearSelection}
              accessibilityRole="button"
              accessibilityLabel={t('recipe.clearSelection')}
              style={styles.selectHit}
            >
              <Text style={styles.selectLink}>{t('recipe.clearSelection')}</Text>
            </Pressable>
          </View>
          {addable.map((item) => {
            const checked = selected.has(item.ingredientKey);
            const name = item.productName || item.label;
            return (
              <Pressable
                key={item.ingredientKey}
                onPress={() => toggleKey(item.ingredientKey)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={t('recipe.checkboxA11y', { name })}
                style={styles.checkRow}
              >
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                  <Text style={styles.checkmark}>{checked ? '✓' : ''}</Text>
                </View>
                <View style={styles.checkBody}>
                  <Text style={styles.checkTitle}>{name}</Text>
                  <Text style={styles.caption}>{item.label}</Text>
                </View>
              </Pressable>
            );
          })}
          <Text style={styles.selectedCount}>
            {t('recipe.selectedCount', { count: selected.size })}
          </Text>
          <PrimaryButton
            label={adding ? t('recipe.adding') : t('recipe.addSelected')}
            onPress={() => void onAddSelected()}
            loading={adding}
            disabled={adding || selected.size === 0}
          />
        </ScreenCard>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  gap: { height: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm },
  whyHit: { minHeight: 44, justifyContent: 'center', marginTop: spacing.sm },
  whyLabel: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  title: { ...typography.title, fontSize: 22, flex: 1, flexShrink: 1 },
  heading: { ...typography.heading, marginBottom: spacing.sm },
  body: { ...typography.bodyMuted, marginBottom: spacing.sm },
  caption: { ...typography.caption, marginBottom: spacing.sm },
  meta: { ...typography.caption, marginTop: spacing.xs },
  coverage: { ...typography.body, fontWeight: '700', marginTop: spacing.md },
  limitNote: { ...typography.caption, marginTop: spacing.sm, fontStyle: 'italic' },
  requirementBlock: { marginBottom: spacing.md },
  requirementTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  requirementLine: { ...typography.caption, marginTop: 2 },
  requirementStatus: { ...typography.caption, fontWeight: '700', marginTop: spacing.xs },
  requirementNeutral: { color: colors.textMuted, fontWeight: '600' },
  requirementOk: { color: colors.primary },
  requirementBad: { color: colors.error },
  unlinked: { ...typography.caption, marginTop: spacing.xs },
  selectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginVertical: spacing.md },
  selectHit: { minHeight: 44, justifyContent: 'center' },
  selectLink: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary },
  checkmark: { color: colors.textOnPrimary, fontWeight: '800', fontSize: 17 },
  checkBody: { flex: 1, marginLeft: spacing.md },
  checkTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  selectedCount: { ...typography.caption, fontWeight: '600', marginBottom: spacing.sm },
});
