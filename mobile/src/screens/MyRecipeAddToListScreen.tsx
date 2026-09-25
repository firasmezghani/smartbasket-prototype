import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenCard } from '../components/ScreenCard';
import { ScreenContainer } from '../components/ScreenContainer';
import { AppIcon } from '../components/AppIcon';
import { usePersonalRecipes } from '../context/PersonalRecipesContext';
import { useShoppingList } from '../context/ShoppingListContext';
import { useChecklistDraftSuggestions } from '../hooks/useChecklistDraftSuggestions';
import { useI18n } from '../i18n/I18nContext';
import { genericTypeLabelKey, genericTypesOfferedForDraft } from '../lib/genericChecklist';
import { formatDraftSuggestionDetail } from '../lib/checklistDraftSearch';
import { safeTrim } from '../lib/catalogDisplay';
import {
  buildMixedEntriesFromSelections,
  previewPersonalRecipeListRows,
  selectedIngredientCount,
  selectionFingerprint,
  shouldRefuseDuplicateSubmit,
  type PersonalIngredientSelection,
  type PersonalListChoice,
  defaultSelectionsForRecipe,
} from '../lib/personalRecipeChecklist';
import type { MyRecipeAddToListProps } from '../types/navigation';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { friendlyErrorMessage } from '../lib/errors';

export function MyRecipeAddToListScreen({ navigation, route }: MyRecipeAddToListProps) {
  const { recipeId } = route.params;
  const { t } = useI18n();
  const { recipeById } = usePersonalRecipes();
  const { items, signedIn, addMixedChecklistEntries } = useShoppingList();
  const recipe = recipeById(recipeId);
  const [selections, setSelections] = useState<PersonalIngredientSelection[]>(() =>
    defaultSelectionsForRecipe(recipe?.ingredients ?? []),
  );
  const [searchingId, setSearchingId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [adding, setAdding] = useState(false);
  const [lastFingerprint, setLastFingerprint] = useState<string | null>(null);
  const [lastSucceeded, setLastSucceeded] = useState(false);

  const suggestions = useChecklistDraftSuggestions(searchText, Boolean(searchingId) && signedIn && !adding);

  const labelForGeneric = (type: Parameters<typeof genericTypeLabelKey>[0]) =>
    t('list.genericChoice', { name: t(genericTypeLabelKey(type)) });

  const previews = useMemo(
    () => previewPersonalRecipeListRows(items, selections, (type) => t(genericTypeLabelKey(type))),
    [items, selections, t],
  );
  const fingerprint = selectionFingerprint(selections);
  const selectedCount = selectedIngredientCount(selections);

  const updateRow = (ingredientId: string, patch: Partial<PersonalIngredientSelection>) => {
    setSelections((prev) => prev.map((row) => (row.ingredientId === ingredientId ? { ...row, ...patch } : row)));
  };

  const setChoice = (ingredientId: string, choice: PersonalListChoice | null) => {
    updateRow(ingredientId, { choice, selected: true });
    setSearchingId(null);
    setSearchText('');
  };

  const onApply = async () => {
    if (!recipe || !signedIn) return;
    if (selectedCount === 0) {
      Alert.alert(t('myRecipes.noneSelected'));
      return;
    }
    if (shouldRefuseDuplicateSubmit({ adding, lastFingerprint, lastSucceeded, currentFingerprint: fingerprint })) {
      Alert.alert(t('myRecipes.alreadyApplied'));
      return;
    }
    setAdding(true);
    try {
      const entries = buildMixedEntriesFromSelections(selections, (type) => t(genericTypeLabelKey(type)));
      const summary = await addMixedChecklistEntries(entries);
      setLastFingerprint(fingerprint);
      setLastSucceeded(true);
      Alert.alert(
        t('myRecipes.appliedTitle'),
        t('myRecipes.appliedBody', {
          added: summary.added,
          merged: summary.merged,
          skipped: summary.skipped,
        }),
        [
          { text: t('common.ok'), style: 'cancel' },
          { text: t('myRecipes.openList'), onPress: () => navigation.navigate('ShoppingList') },
        ],
      );
    } catch (err) {
      setLastSucceeded(false);
      const message = err instanceof Error && err.message ? friendlyErrorMessage(err) : t('myRecipes.applyFailed');
      Alert.alert(t('myRecipes.applyFailed'), message);
    } finally {
      setAdding(false);
    }
  };

  if (!recipe) {
    return (
      <ScreenContainer background={colors.cream}>
        <Text style={styles.body}>{t('myRecipes.removed')}</Text>
      </ScreenContainer>
    );
  }

  if (!signedIn) {
    return (
      <ScreenContainer background={colors.cream}>
        <Text style={styles.body}>{t('list.signedOutBody')}</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer background={colors.cream}>
      <Text style={styles.title} accessibilityRole="header">
        {recipe.title}
      </Text>
      <Text style={styles.body}>{t('myRecipes.reviewIntro')}</Text>
      <Text style={styles.note}>{t('myRecipes.quantityNote')}</Text>
      {selections.map((row) => {
        const offered = genericTypesOfferedForDraft(row.name);
        const preview = previews.find((item) => item.ingredientId === row.ingredientId);
        return (
          <ScreenCard key={row.ingredientId}>
            <Pressable
              onPress={() => updateRow(row.ingredientId, { selected: !row.selected })}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: row.selected }}
              accessibilityLabel={row.name}
              style={styles.checkHit}
            >
              <AppIcon
                name={row.selected ? 'checkbox' : 'square-outline'}
                size={22}
                color={colors.primary}
              />
              <View style={styles.checkBody}>
                <Text style={styles.ingName}>{row.name}</Text>
                {row.amount ? (
                  <Text style={styles.meta}>
                    {row.amount} · {t('myRecipes.packageQty')}
                  </Text>
                ) : (
                  <Text style={styles.meta}>{t('myRecipes.packageQty')}</Text>
                )}
              </View>
            </Pressable>
            {row.selected ? (
              <>
                {row.choice?.kind === 'exact' ? (
                  <Text style={styles.choice}>{t('myRecipes.choiceExact', { name: row.choice.label })}</Text>
                ) : row.choice?.kind === 'generic' ? (
                  <Text style={styles.choice}>
                    {t('myRecipes.choiceGeneric', { name: t(genericTypeLabelKey(row.choice.genericType)) })}
                  </Text>
                ) : (
                  <Text style={styles.choice}>
                    {t('myRecipes.choiceNote', { name: preview?.listLabel || row.name })}
                  </Text>
                )}
                {offered.length === 1 ? (
                  <PrimaryButton
                    label={labelForGeneric(offered[0])}
                    variant="outline"
                    onPress={() => setChoice(row.ingredientId, { kind: 'generic', genericType: offered[0] })}
                  />
                ) : offered.length > 1 ? (
                  <View style={styles.gapSm}>
                    <Text style={styles.meta}>{t('myRecipes.severalTypes')}</Text>
                    {offered.map((type) => (
                      <PrimaryButton
                        key={type}
                        label={labelForGeneric(type)}
                        variant="outline"
                        onPress={() => setChoice(row.ingredientId, { kind: 'generic', genericType: type })}
                      />
                    ))}
                  </View>
                ) : null}
                <View style={styles.gapSm} />
                <PrimaryButton
                  label={t('myRecipes.findProduct')}
                  variant="outline"
                  onPress={() => {
                    setSearchingId(row.ingredientId);
                    setSearchText(row.name);
                  }}
                />
                <View style={styles.gapSm} />
                <PrimaryButton
                  label={t('myRecipes.asNote')}
                  variant="outline"
                  onPress={() => setChoice(row.ingredientId, { kind: 'note' })}
                />
                {row.choice ? (
                  <>
                    <View style={styles.gapSm} />
                    <Pressable onPress={() => setChoice(row.ingredientId, null)} style={styles.textHit}>
                      <Text style={styles.link}>{t('myRecipes.clearChoice')}</Text>
                    </Pressable>
                  </>
                ) : null}
                {searchingId === row.ingredientId ? (
                  <View style={styles.search}>
                    <FormField
                      label={t('myRecipes.searchProduct')}
                      value={searchText}
                      onChangeText={setSearchText}
                      autoCorrect={false}
                    />
                    {suggestions.status === 'loading' ? (
                      <Text style={styles.meta}>{t('list.suggestionsSearching')}</Text>
                    ) : suggestions.status === 'error' ? (
                      <Text style={styles.meta}>{t('list.suggestionsFailed')}</Text>
                    ) : suggestions.status === 'empty' ? (
                      <Text style={styles.meta}>{t('list.suggestionsEmpty')}</Text>
                    ) : (
                      suggestions.products.map((product) => {
                        const name = safeTrim(product.name) || safeTrim(product.sourceName) || row.name;
                        return (
                        <Pressable
                          key={product.id}
                          onPress={() =>
                            setChoice(row.ingredientId, {
                              kind: 'exact',
                              productId: product.id,
                              label: name,
                            })
                          }
                          accessibilityRole="button"
                          accessibilityLabel={name}
                          style={styles.productHit}
                        >
                          <Text style={styles.ingName}>{name}</Text>
                          <Text style={styles.meta}>
                            {formatDraftSuggestionDetail([product.brand, product.familyName])}
                          </Text>
                        </Pressable>
                        );
                      })
                    )}
                  </View>
                ) : null}
                {preview ? (
                  <Text style={styles.preview}>
                    {preview.action === 'update'
                      ? t('myRecipes.willUpdate', {
                          name: preview.listLabel,
                          from: String(preview.existingQuantity ?? 1),
                          to: String(preview.nextQuantity ?? 2),
                        })
                      : preview.existingQuantity
                        ? t('myRecipes.alreadyListed', { name: preview.listLabel })
                        : t('myRecipes.willAdd', { name: preview.listLabel })}
                  </Text>
                ) : null}
              </>
            ) : null}
          </ScreenCard>
        );
      })}
      <PrimaryButton
        label={t('myRecipes.apply')}
        onPress={() => void onApply()}
        loading={adding}
        disabled={adding || selectedCount === 0}
      />
      <View style={styles.gap} />
      <PrimaryButton label={t('common.cancel')} variant="outline" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, marginBottom: spacing.sm },
  body: { ...typography.bodyMuted, marginBottom: spacing.sm },
  note: { ...typography.caption, marginBottom: spacing.lg },
  checkHit: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, minHeight: 48 },
  checkBody: { flex: 1 },
  ingName: { ...typography.heading },
  meta: { ...typography.caption, marginTop: 2 },
  choice: { ...typography.body, marginTop: spacing.md, marginBottom: spacing.sm },
  preview: { ...typography.caption, marginTop: spacing.md },
  gap: { height: spacing.md },
  gapSm: { height: spacing.sm },
  textHit: { minHeight: 44, justifyContent: 'center' },
  link: { ...typography.body, color: colors.primary },
  search: { marginTop: spacing.md },
  productHit: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    minHeight: 48,
  },
});
