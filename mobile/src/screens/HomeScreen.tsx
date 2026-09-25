import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchProducts } from '../api/catalog';
import { AppIcon } from '../components/AppIcon';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProductCard } from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/ProductCardSkeleton';
import { RecipeImage } from '../components/RecipeImage';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionHeader } from '../components/SectionHeader';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useShoppingList } from '../context/ShoppingListContext';
import { useRecipeRecommendations } from '../hooks/useRecipeRecommendations';
import { useI18n } from '../i18n/I18nContext';
import {
  HOME_EXPLORE_FETCH_LIMIT,
  HOME_RECIPE_DEBOUNCE_MS,
  HOME_RECIPE_FOCUS_MIN_INTERVAL_MS,
  basketEvidenceKey,
  homeBasketSummaryState,
  homeBasketUnitsDifferFromProducts,
  homeGreetingFirstName,
  homeListCardState,
  selectHomeExploreProducts,
  shouldHideBasketRecipeWhileRefreshing,
  shouldSkipFocusRefresh,
} from '../lib/homePreview';
import { createRequestGeneration } from '../lib/requestGeneration';
import { buildRecipeCardSummary, evidenceBadgeKey } from '../lib/recipeRequirements';
import { formatTnd } from '../lib/valueDisplay';
import type { Product } from '../types/catalog';
import type { HomeProps } from '../types/navigation';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

const EXPLORE_CARD_WIDTH = 148;

type ExploreStatus = 'loading' | 'ready' | 'error';

export function HomeScreen({ navigation }: HomeProps) {
  const { t } = useI18n();
  const { customer, accountGeneration } = useAuth();
  const { items, signedIn, ready } = useShoppingList();
  const { cart, loading: cartLoading, error: cartError } = useCart();
  const evidenceKey = basketEvidenceKey(cart);
  const {
    status: recipeStatus,
    data: recipeData,
    error: recipeError,
    retry: retryRecipes,
    refresh: refreshRecipes,
    refreshing: recipeRefreshing,
    evidenceStale,
    lastFetchedAt,
    lastEvidenceKey,
    lastGeneration,
  } = useRecipeRecommendations({
    limit: 1,
    evidenceKey,
    debounceMs: HOME_RECIPE_DEBOUNCE_MS,
  });

  const skipFirstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (skipFirstFocusRef.current) {
        skipFirstFocusRef.current = false;
        return;
      }
      if (
        shouldSkipFocusRefresh({
          lastFetchedAt,
          lastEvidenceKey,
          currentEvidenceKey: evidenceKey,
          now: Date.now(),
          minIntervalMs: HOME_RECIPE_FOCUS_MIN_INTERVAL_MS,
          lastGeneration,
          currentGeneration: accountGeneration,
        })
      ) {
        return;
      }
      void refreshRecipes();
    }, [
      accountGeneration,
      evidenceKey,
      lastEvidenceKey,
      lastFetchedAt,
      lastGeneration,
      refreshRecipes,
    ]),
  );

  const [exploreStatus, setExploreStatus] = useState<ExploreStatus>('loading');
  const [exploreProducts, setExploreProducts] = useState<Product[]>([]);
  const exploreGen = useRef(createRequestGeneration()).current;

  const loadExplore = useCallback(async () => {
    const token = exploreGen.next();
    setExploreStatus('loading');
    try {
      const res = await fetchProducts({ limit: HOME_EXPLORE_FETCH_LIMIT });
      if (!exploreGen.isCurrent(token)) return;
      setExploreProducts(selectHomeExploreProducts(res.data));
      setExploreStatus('ready');
    } catch {
      if (!exploreGen.isCurrent(token)) return;
      setExploreProducts([]);
      setExploreStatus('error');
    }
  }, [exploreGen]);

  useEffect(() => {
    void loadExplore();
  }, [loadExplore]);

  const basketKnown = !cartLoading && !cartError && Array.isArray(cart.items);
  const listState = homeListCardState({
    ready,
    signedIn,
    items,
    basketUnits: cart.totalQuantity,
    basketKnown,
  });
  const basketState = homeBasketSummaryState({
    signedIn,
    loading: cartLoading,
    error: cartError,
    cart,
  });
  const listPct = listState.total > 0 ? Math.round((listState.completed / listState.total) * 100) : 0;

  const recipe = recipeData?.recommendations[0] ?? null;
  const recipeSummary = recipe ? buildRecipeCardSummary(recipe, t) : null;
  const hideStaleRecipe = shouldHideBasketRecipeWhileRefreshing({
    refreshing: recipeRefreshing || recipeStatus === 'loading',
    evidenceStale,
    evidenceSource: recipe?.evidenceSource,
  });
  const showRecipePreview = Boolean(recipe && recipeSummary) && !hideStaleRecipe;

  const firstName = homeGreetingFirstName(customer?.fullName);
  const greeting = firstName ? t('home.helloNamed', { name: firstName }) : t('home.helloNeutral');

  const openShoppingList = () => navigation.navigate('ShoppingList');
  const openRecipeIdeas = () => navigation.navigate('RecipeIdeas');
  const openBasket = () => navigation.navigate('Cart', { screen: 'CartList' });
  const goSignIn = () =>
    navigation.navigate('Insights', { screen: 'Login', params: { returnTo: 'shoppingList' } });
  const goRecipeSignIn = () =>
    navigation.navigate('Insights', { screen: 'Login', params: { returnTo: 'recipeIdeas' } });
  const openRecipe = (recipeId: string) => navigation.navigate('RecipeDetail', { recipeId });
  const openCatalogue = () => navigation.navigate('Catalog', { screen: 'CatalogList' });
  const openProduct = (productId: string) =>
    navigation.navigate('Catalog', { screen: 'ProductDetail', params: { productId } });

  const remainingLabel =
    listState.remaining === 1
      ? t('home.itemsLeftOne')
      : t('home.itemsLeft', { count: listState.remaining });

  const basketA11yParts = [t('home.basketSummaryTitle')];
  if (basketState.kind === 'loading') basketA11yParts.push(t('home.basketLoading'));
  else if (basketState.kind === 'unavailable') basketA11yParts.push(t('home.basketUnavailable'));
  else if (basketState.kind === 'empty') basketA11yParts.push(t('home.basketSummaryEmpty'));
  else {
    basketA11yParts.push(
      basketState.uniqueProducts === 1
        ? t('home.basketProductsOne')
        : t('home.basketProducts', { count: basketState.uniqueProducts }),
    );
    basketA11yParts.push(
      basketState.units === 1
        ? t('home.basketUnitsOne')
        : t('home.basketUnits', { count: basketState.units }),
    );
    if (basketState.amount != null) {
      basketA11yParts.push(`${t('home.estimatedTotalLabel')} ${formatTnd(basketState.amount)}`);
    }
  }

  return (
    <ScreenContainer
      edges={['top', 'left', 'right']}
      background={colors.cream}
      responsivePadding
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={styles.greeting} accessibilityRole="header">
          {greeting}
        </Text>
        <Text style={styles.subtitle}>{t('home.readySubtitle')}</Text>
      </View>

      <View style={styles.sections}>
        <Text style={styles.sectionLabel}>{t('home.nextShopTitle')}</Text>
        <View style={styles.listCard}>
          {listState.kind === 'loading' ? (
            <Text style={styles.body}>{t('common.loading')}</Text>
          ) : listState.kind === 'signedOut' ? (
            <>
              <Text style={styles.body}>{t('home.signedOutList')}</Text>
              <PrimaryButton
                label={t('common.signIn')}
                onPress={goSignIn}
                accessibilityHint={t('home.openListHint')}
              />
            </>
          ) : listState.kind === 'empty' ? (
            <>
              <Text style={styles.body}>{t('home.listSummaryEmpty')}</Text>
              <PrimaryButton
                label={t('home.createList')}
                onPress={openShoppingList}
                accessibilityHint={t('home.openListHint')}
              />
            </>
          ) : listState.kind === 'incomplete' ? (
            <>
              <Text style={styles.listStatus}>{remainingLabel}</Text>
              <View
                style={styles.track}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: listState.total, now: listState.completed }}
              >
                <View style={[styles.fill, { width: `${listPct}%` }]} />
              </View>
              {listState.preview.map((item) => (
                <Text key={item.id} style={styles.previewItem}>
                  {item.label}
                </Text>
              ))}
              {listState.moreUnchecked > 0 ? (
                <Text style={styles.meta}>{t('home.moreUnchecked', { count: listState.moreUnchecked })}</Text>
              ) : null}
              <PrimaryButton
                label={t('home.openShoppingList')}
                onPress={openShoppingList}
                accessibilityHint={t('home.openListHint')}
              />
            </>
          ) : (
            <>
              <Text style={styles.listStatus} accessibilityRole="text">
                {t('home.listComplete')}
              </Text>
              <PrimaryButton
                label={t('home.openShoppingList')}
                onPress={openShoppingList}
                accessibilityHint={t('home.openListHint')}
              />
            </>
          )}
        </View>

        {basketState.kind === 'hidden' ? null : (
          <Pressable
            onPress={openBasket}
            accessibilityRole="button"
            accessibilityLabel={basketA11yParts.join('. ')}
            accessibilityHint={t('home.openBasketHint')}
            style={styles.basketCard}
          >
            <AppIcon name="basket-outline" size={20} color={colors.primary} />
            <View style={styles.basketBody}>
              <Text style={styles.basketTitle}>{t('home.basketSummaryTitle')}</Text>
              {basketState.kind === 'loading' ? (
                <Text style={styles.meta}>{t('home.basketLoading')}</Text>
              ) : basketState.kind === 'unavailable' ? (
                <Text style={styles.meta}>{t('home.basketUnavailable')}</Text>
              ) : basketState.kind === 'empty' ? (
                <Text style={styles.meta}>{t('home.basketSummaryEmpty')}</Text>
              ) : (
                <>
                  <Text style={styles.basketCounts}>
                    {basketState.uniqueProducts === 1
                      ? t('home.basketProductsOne')
                      : t('home.basketProducts', { count: basketState.uniqueProducts })}
                    {homeBasketUnitsDifferFromProducts(basketState)
                      ? ` · ${
                          basketState.units === 1
                            ? t('home.basketUnitsOne')
                            : t('home.basketUnits', { count: basketState.units })
                        }`
                      : ''}
                  </Text>
                  {basketState.amount != null ? (
                    <Text style={styles.total}>
                      {t('home.estimatedTotalLabel')} {formatTnd(basketState.amount)}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
            <AppIcon name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        )}

        <View>
          <SectionHeader
            title={t('home.exploreProducts')}
            action={{ label: t('home.browseAll'), onPress: openCatalogue }}
          />
          {exploreStatus === 'loading' ? (
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.exploreRow}
            >
              {[0, 1, 2, 3].map((key) => (
                <View key={key} style={styles.exploreCard}>
                  <ProductCardSkeleton width={EXPLORE_CARD_WIDTH} variant="preview" />
                </View>
              ))}
            </ScrollView>
          ) : exploreStatus === 'error' ? (
            <>
              <Text style={styles.body}>{t('home.exploreUnavailable')}</Text>
              <Pressable
                onPress={() => void loadExplore()}
                accessibilityRole="button"
                accessibilityLabel={t('common.retry')}
                hitSlop={8}
                style={styles.textActionHit}
              >
                <Text style={styles.textAction}>{t('common.retry')}</Text>
              </Pressable>
            </>
          ) : exploreProducts.length === 0 ? (
            <Text style={styles.body}>{t('home.exploreEmpty')}</Text>
          ) : (
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.exploreRow}
            >
              {exploreProducts.map((product) => (
                <View key={product.id} style={styles.exploreCard}>
                  <ProductCard
                    product={product}
                    width={EXPLORE_CARD_WIDTH}
                    variant="preview"
                    onPress={() => openProduct(product.id)}
                  />
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.recipeCard}>
          <View style={styles.recipeHeader}>
            <AppIcon name="restaurant-outline" size={18} color={colors.textMuted} />
            <Text style={styles.recipeSectionTitle}>{t('home.recipeInspiration')}</Text>
          </View>
          {recipeStatus === 'loading' && !showRecipePreview ? (
            <Text style={styles.meta}>{t('home.recipeLoading')}</Text>
          ) : recipeStatus === 'authRequired' ? (
            <>
              <Text style={styles.body}>{t('recipe.signInBody')}</Text>
              <PrimaryButton label={t('common.signIn')} onPress={goRecipeSignIn} variant="outline" />
            </>
          ) : hideStaleRecipe ? (
            <Text style={styles.meta}>{t('home.recipeUpdating')}</Text>
          ) : recipeStatus === 'error' && !showRecipePreview ? (
            <>
              <Text style={styles.body}>
                {recipeError?.kind === 'rateLimited'
                  ? t('recipe.errorRateLimited')
                  : recipeError?.kind === 'unavailable'
                    ? t('recipe.errorUnavailable')
                    : t('home.recipeUnavailable')}
              </Text>
              <PrimaryButton label={t('common.retry')} onPress={retryRecipes} variant="outline" />
              <Pressable
                onPress={openRecipeIdeas}
                accessibilityRole="button"
                accessibilityLabel={t('home.allRecipes')}
                hitSlop={8}
                style={styles.textActionHit}
              >
                <Text style={styles.textAction}>{t('home.allRecipes')}</Text>
              </Pressable>
            </>
          ) : showRecipePreview && recipe && recipeSummary ? (
            <>
              <Pressable
                onPress={() => openRecipe(recipe.recipeId)}
                accessibilityRole="button"
                accessibilityLabel={recipe.name}
                accessibilityHint={t('home.openRecipeCardHint')}
                style={styles.recipePreviewHit}
              >
                <View style={styles.recipeImageWrap}>
                  <RecipeImage recipeId={recipe.recipeId} name={recipe.name} size="home" />
                </View>
                <Text style={styles.recipeName}>{recipe.name}</Text>
                <Text style={styles.recipeBadge}>{t(evidenceBadgeKey(recipe.evidenceSource))}</Text>
                <Text style={styles.body}>{recipeSummary.statusLine}</Text>
                {recipeSummary.detailLine ? <Text style={styles.meta}>{recipeSummary.detailLine}</Text> : null}
              </Pressable>
              <Pressable
                onPress={openRecipeIdeas}
                accessibilityRole="button"
                accessibilityLabel={t('home.allRecipes')}
                hitSlop={8}
                style={styles.textActionHit}
              >
                <Text style={styles.textActionSecondary}>{t('home.allRecipes')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.body}>{t('home.recipeEmpty')}</Text>
              <Pressable
                onPress={openRecipeIdeas}
                accessibilityRole="button"
                accessibilityLabel={t('home.allRecipes')}
                hitSlop={8}
                style={styles.textActionHit}
              >
                <Text style={styles.textAction}>{t('home.allRecipes')}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xl },
  header: { gap: 2, paddingTop: spacing.xs },
  greeting: { ...typography.heading, fontSize: 22 },
  subtitle: { ...typography.bodyMuted },
  sections: { gap: spacing.md, marginTop: spacing.lg },
  sectionLabel: { ...typography.label, color: colors.textMuted },
  listCard: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  listStatus: { ...typography.body, fontWeight: '600' },
  basketCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  basketBody: { flex: 1, minWidth: 0, gap: 2 },
  basketTitle: { ...typography.label, color: colors.text },
  basketCounts: { ...typography.caption },
  recipeCard: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  recipeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  recipeSectionTitle: { ...typography.label, color: colors.textMuted, flex: 1 },
  recipePreviewHit: { gap: spacing.sm },
  recipeImageWrap: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  recipeBadge: { ...typography.caption, color: colors.textMuted },
  body: { ...typography.body },
  previewItem: { ...typography.body },
  meta: { ...typography.caption },
  total: { ...typography.caption, fontWeight: '600', color: colors.primary },
  textAction: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  textActionSecondary: { color: colors.primary, fontWeight: '500', fontSize: 14 },
  textActionHit: { paddingVertical: spacing.xs, minHeight: 36, justifyContent: 'center' },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
  recipeName: { ...typography.heading, fontSize: 16 },
  exploreRow: { gap: spacing.sm, paddingRight: spacing.md },
  exploreCard: { width: EXPLORE_CARD_WIDTH },
});
