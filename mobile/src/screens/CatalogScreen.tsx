import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { fetchCatalogSections, fetchProducts, fetchPublicSettings } from '../api/catalog';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProductCard } from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/ProductCardSkeleton';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { friendlyErrorMessage } from '../lib/errors';
import {
  catalogChipSelection,
  catalogColumnCount,
  catalogFilterLabel,
  catalogQueryForFilter,
  resolveCatalogView,
  selectionFromSectionKey,
  type CatalogSelection,
} from '../lib/catalogBrowse';
import { CATALOG_SECTION_KEYS, catalogSectionTitleKey, productCountKey } from '../lib/catalogSections';
import { contentMaxWidth, screenHorizontalPadding } from '../lib/layout';
import { createRequestGeneration } from '../lib/requestGeneration';
import type { CatalogSection, CatalogSectionKey, Product } from '../types/catalog';
import type { CatalogListProps } from '../types/navigation';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

const PAGE_SIZE = 20;

export function CatalogScreen({ navigation }: CatalogListProps) {
  const { t } = useI18n();
  const { width, fontScale } = useWindowDimensions();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selection, setSelection] = useState<CatalogSelection | null>({ kind: 'all' });
  const [siteFilter, setSiteFilter] = useState<string | undefined>(undefined);

  const [sections, setSections] = useState<CatalogSection[] | null>(null);
  const [sectionsError, setSectionsError] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const view = resolveCatalogView(debouncedSearch, selection);
  const chipKey = catalogChipSelection(view);

  useEffect(() => {
    (async () => {
      try {
        const settings = await fetchPublicSettings();
        if (settings.show_site_only_products === 'true') setSiteFilter('true');
      } catch {
        // optional
      }
    })();
  }, []);

  const loadSections = useCallback(async () => {
    setSectionsError(false);
    try {
      const list = await fetchCatalogSections();
      setSections(list);
    } catch {
      setSections(null);
      setSectionsError(true);
    }
  }, []);

  useEffect(() => {
    void loadSections();
  }, [loadSections]);

  const resultsQuery = useMemo(
    () =>
      view.mode === 'results'
        ? catalogQueryForFilter(view.filter, debouncedSearch)
        : { featured: true as const },
    [view.mode, view.mode === 'results' ? JSON.stringify(view.filter) : '', debouncedSearch],
  );
  const resultsKey = JSON.stringify(resultsQuery);

  const gen = useRef(createRequestGeneration()).current;

  const loadResultsPage = useCallback(
    async (nextOffset: number, append: boolean, token: number) => {
      const res = await fetchProducts({
        ...resultsQuery,
        site: siteFilter,
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      if (!gen.isCurrent(token)) return;
      setProducts((prev) => (append ? [...prev, ...res.data] : res.data));
      setOffset(nextOffset + res.data.length);
      setHasMore(res.pagination.hasMore);
      setTotal(res.pagination.total);
      setError(null);
    },
    [resultsQuery, siteFilter, gen],
  );

  useEffect(() => {
    const token = gen.next();
    setResultsLoading(true);
    setLoadingMore(false);
    setError(null);
    setProducts([]);
    setOffset(0);
    setHasMore(false);
    (async () => {
      try {
        await loadResultsPage(0, false, token);
      } catch (e) {
        if (gen.isCurrent(token)) {
          setError(friendlyErrorMessage(e));
          setProducts([]);
        }
      } finally {
        if (gen.isCurrent(token)) setResultsLoading(false);
      }
    })();
    return () => {
      gen.next();
    };
  }, [resultsKey, loadResultsPage, gen]);

  const loadMore = async () => {
    if (!hasMore || loadingMore || resultsLoading || error) return;
    const token = gen.current();
    setLoadingMore(true);
    try {
      await loadResultsPage(offset, true, token);
    } catch (e) {
      if (gen.isCurrent(token)) setError(friendlyErrorMessage(e));
    } finally {
      if (gen.isCurrent(token)) setLoadingMore(false);
    }
  };

  const retryResults = () => {
    const token = gen.next();
    setResultsLoading(true);
    setLoadingMore(false);
    setError(null);
    setProducts([]);
    setOffset(0);
    setHasMore(false);
    loadResultsPage(0, false, token)
      .catch((e) => {
        if (gen.isCurrent(token)) setError(friendlyErrorMessage(e));
      })
      .finally(() => {
        if (gen.isCurrent(token)) setResultsLoading(false);
      });
  };

  const openProduct = (product: Product) => {
    navigation.navigate('ProductDetail', { productId: String(product.id) });
  };

  const backToLanding = () => {
    gen.next();
    setSelection({ kind: 'all' });
    setSearch('');
    setDebouncedSearch('');
    setError(null);
    setLoadingMore(false);
  };

  const selectChip = (key: CatalogSectionKey | 'all') => {
    if (key === 'all') {
      setSelection({ kind: 'all' });
      return;
    }
    setSelection(selectionFromSectionKey(key));
  };

  const cols = catalogColumnCount(width, fontScale);
  const gap = spacing.md;
  const hPad = screenHorizontalPadding(width);
  const contentWidth = Math.min(width, contentMaxWidth(width)) - hPad * 2;
  const cardWidth = Math.floor((contentWidth - gap * (cols - 1)) / cols);

  const countByKey = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of sections ?? []) map[s.key] = s.count;
    return map;
  }, [sections]);

  const searchChrome = (
    <View style={[styles.searchChrome, { paddingHorizontal: hPad }]}>
      <FormField
        label={t('catalog.searchLabel')}
        hideLabel
        icon="search-outline"
        value={search}
        onChangeText={setSearch}
        placeholder={t('catalog.searchPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        containerStyle={styles.searchField}
      />
    </View>
  );

  const chips = (
    <View style={[styles.chipWrap, { paddingHorizontal: hPad }]}>
      {CATALOG_SECTION_KEYS.map((key) => {
        const count = countByKey[key];
        const disabled = sections != null && count === 0;
        const selected = chipKey === key;
        return (
          <Pressable
            key={key}
            onPress={() => selectChip(key)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled, selected }}
            accessibilityLabel={t(catalogSectionTitleKey(key) as TranslationKey)}
            hitSlop={4}
            style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
          >
            <Text
              style={[
                styles.chipText,
                selected && styles.chipTextSelected,
                disabled && styles.chipTextDisabled,
              ]}
            >
              {t(catalogSectionTitleKey(key) as TranslationKey)}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={() => selectChip('all')}
        accessibilityRole="button"
        accessibilityState={{ selected: chipKey === 'all' }}
        accessibilityLabel={t('catalog.allProducts')}
        hitSlop={4}
        style={[styles.chip, chipKey === 'all' && styles.chipSelected]}
      >
        <Text style={[styles.chipText, chipKey === 'all' && styles.chipTextSelected]}>
          {t('catalog.allProducts')}
        </Text>
      </Pressable>
    </View>
  );

  const activeLabel =
    view.mode === 'results'
      ? (() => {
          const l = catalogFilterLabel(view.filter);
          return t(l.key as TranslationKey, l.params);
        })()
      : t('catalog.allProducts');

  const listHeader = (
    <View style={styles.resultsHeader}>
      {sectionsError ? (
        <View style={styles.sectionErrorCard}>
          <Text style={styles.sectionErrorText}>{t('errors.generic')}</Text>
          <Pressable onPress={() => void loadSections()} accessibilityRole="button">
            <Text style={styles.inlineRetry}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel} numberOfLines={2}>
          {t('catalog.showing', { label: activeLabel })}
        </Text>
        {!resultsLoading && total > 0 ? (
          <Text style={styles.resultCount}>{t(productCountKey(total), { count: total })}</Text>
        ) : null}
      </View>
      {error && products.length > 0 ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>{error}</Text>
          <Pressable onPress={retryResults} accessibilityRole="button">
            <Text style={styles.inlineRetry}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const showSkeletons = resultsLoading && products.length === 0 && !error;
  const showFullError = Boolean(error) && !resultsLoading && products.length === 0;

  const grid = (() => {
    if (showSkeletons) {
      return (
        <View style={styles.flex}>
          {listHeader}
          <View style={[styles.skeletonGrid, { paddingHorizontal: hPad, gap }]}>
            {Array.from({ length: cols * 3 }).map((_, i) => (
              <ProductCardSkeleton key={i} width={cardWidth} />
            ))}
          </View>
        </View>
      );
    }
    if (showFullError) {
      return (
        <View style={styles.flex}>
          {listHeader}
          <ErrorState message={error!} onRetry={retryResults} />
        </View>
      );
    }
    return (
      <FlatList
        key={`cols-${cols}`}
        style={styles.flex}
        data={products}
        keyExtractor={(item) => String(item.id)}
        numColumns={cols}
        columnWrapperStyle={cols > 1 ? { gap } : undefined}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={retryResults} tintColor={colors.primary} />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          !resultsLoading ? (
            <EmptyState
              iconName="search-outline"
              tone="catalogue"
              title={t('catalog.empty')}
              action={
                <PrimaryButton
                  label={t('catalog.backToBrowse')}
                  onPress={backToLanding}
                  variant="outline"
                />
              }
            />
          ) : null
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.footerText}>{t('catalog.loadingMore')}</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <ProductCard product={item} onPress={() => openProduct(item)} width={cardWidth} />
        )}
        contentContainerStyle={[
          styles.list,
          {
            paddingHorizontal: hPad,
            gap,
            maxWidth: contentMaxWidth(width),
            alignSelf: 'center',
            width: '100%',
          },
        ]}
      />
    );
  })();

  return (
    <View style={styles.root}>
      {searchChrome}
      {chips}
      {grid}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  flex: { flex: 1 },
  searchChrome: {
    paddingTop: spacing.md,
    backgroundColor: colors.cream,
    zIndex: 1,
  },
  searchField: { marginBottom: spacing.sm },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    backgroundColor: colors.cream,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipDisabled: { backgroundColor: colors.surfaceMuted, opacity: 0.55 },
  chipText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  chipTextSelected: { color: colors.textOnPrimary },
  chipTextDisabled: { color: colors.textSubtle, fontWeight: '400' },
  resultsHeader: { paddingBottom: spacing.sm, backgroundColor: colors.cream },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  filterLabel: { ...typography.caption, flex: 1, color: colors.text },
  resultCount: { ...typography.caption },
  list: { paddingTop: spacing.sm, paddingBottom: spacing.xxl * 2 },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: spacing.sm },
  footer: { padding: spacing.lg, alignItems: 'center', gap: spacing.sm },
  footerText: { ...typography.caption },
  sectionErrorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.errorBg,
    borderRadius: radius.sm,
  },
  sectionErrorText: { flex: 1, fontSize: 13, color: colors.error },
  inlineError: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.errorBg,
    borderRadius: radius.sm,
  },
  inlineErrorText: { flex: 1, fontSize: 13, color: colors.error },
  inlineRetry: { fontSize: 13, fontWeight: '700', color: colors.primary },
});
