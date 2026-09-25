import { useEffect, useMemo, useRef, useState } from 'react';
import { usePreventRemove, type NavigationAction } from '@react-navigation/native';
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenCard } from '../components/ScreenCard';
import { ScreenContainer } from '../components/ScreenContainer';
import { AppIcon } from '../components/AppIcon';
import { useAuth } from '../context/AuthContext';
import { usePersonalRecipes } from '../context/PersonalRecipesContext';
import { useI18n } from '../i18n/I18nContext';
import { captureAccountScope, isCurrentAccountScope } from '../lib/accountScope';
import {
  addDraftIngredient,
  draftFromRecipe,
  emptyPersonalRecipeDraft,
  hasUnsavedPersonalRecipeChanges,
  personalRecipeDraftIssue,
  removeDraftIngredient,
} from '../lib/personalRecipes';
import type { PersonalRecipeDraft } from '../types/personalRecipes';
import type { MyRecipeEditorProps } from '../types/navigation';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export function MyRecipeEditorScreen({ navigation, route }: MyRecipeEditorProps) {
  const recipeId = route.params?.recipeId;
  const { t } = useI18n();
  const { customer, accountGeneration } = useAuth();
  const { recipeById, recipes, saveRecipe, status } = usePersonalRecipes();
  const saved = recipeId ? recipeById(recipeId) : null;
  const [draft, setDraft] = useState<PersonalRecipeDraft>(() =>
    saved ? draftFromRecipe(saved) : emptyPersonalRecipeDraft(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(captureAccountScope(customer?.id != null ? String(customer.id) : null, accountGeneration));
  const [allowLeave, setAllowLeave] = useState(false);
  const pendingLeaveAction = useRef<NavigationAction | null>(null);
  const currentScope = captureAccountScope(customer?.id != null ? String(customer.id) : null, accountGeneration);
  const staleAccount = !isCurrentAccountScope(startedRef.current, currentScope);

  useEffect(() => {
    if (staleAccount) navigation.goBack();
  }, [staleAccount, navigation]);

  const dirty = useMemo(() => hasUnsavedPersonalRecipeChanges(draft, saved), [draft, saved]);

  usePreventRemove(Boolean(dirty && !saving && !allowLeave && !staleAccount), ({ data }) => {
    Alert.alert(t('myRecipes.discardTitle'), t('myRecipes.discardBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('myRecipes.discardConfirm'),
        style: 'destructive',
        onPress: () => {
          pendingLeaveAction.current = data.action;
          setAllowLeave(true);
        },
      },
    ]);
  });

  useEffect(() => {
    if (!allowLeave || !pendingLeaveAction.current) return;
    const action = pendingLeaveAction.current;
    pendingLeaveAction.current = null;
    navigation.dispatch(action);
  }, [allowLeave, navigation]);

  const issueMessage = (reason: string | null | undefined) => {
    if (reason === 'empty_title') return t('myRecipes.needTitle');
    if (reason === 'empty_ingredients') return t('myRecipes.needIngredient');
    if (reason === 'collection_full') return t('myRecipes.collectionFull');
    if (reason === 'too_many_ingredients') return t('myRecipes.tooManyIngredients');
    if (reason === 'removed') return t('myRecipes.removed');
    if (reason === 'stale_account') return t('myRecipes.staleAccount');
    return t('myRecipes.saveFailed');
  };

  const onSave = async () => {
    if (saving) return;
    const issue = personalRecipeDraftIssue(draft, recipes.length, draft.id ? 'update' : 'create');
    if (issue) {
      setError(issueMessage(issue));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await saveRecipe(draft);
      if (!result.ok) {
        setError(issueMessage(result.reason));
        return;
      }
      AccessibilityInfo.announceForAccessibility(t('myRecipes.saved'));
      setAllowLeave(true);
      if (result.recipe) {
        navigation.replace('MyRecipeDetail', { recipeId: result.recipe.id });
      } else {
        navigation.goBack();
      }
    } catch {
      setError(t('myRecipes.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (status === 'signedOut') {
    return (
      <ScreenContainer background={colors.cream}>
        <Text style={styles.body}>{t('myRecipes.signedOutBody')}</Text>
      </ScreenContainer>
    );
  }

  if (recipeId && !saved && status === 'ready') {
    return (
      <ScreenContainer background={colors.cream}>
        <Text style={styles.body}>{t('myRecipes.removed')}</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer background={colors.cream} adjustKeyboardInsets>
        <Text style={styles.note}>{t('myRecipes.deviceNote')}</Text>
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <FormField
          label={t('myRecipes.titleLabel')}
          value={draft.title}
          onChangeText={(title) => setDraft((prev) => ({ ...prev, title }))}
          maxLength={80}
        />
        <Text style={styles.heading}>{t('myRecipes.ingredientsHeading')}</Text>
        {draft.ingredients.map((row, index) => (
          <ScreenCard key={row.id}>
            <FormField
              label={`${t('myRecipes.ingredientName')} ${index + 1}`}
              value={row.name}
              onChangeText={(name) =>
                setDraft((prev) => ({
                  ...prev,
                  ingredients: prev.ingredients.map((item) => (item.id === row.id ? { ...item, name } : item)),
                }))
              }
              maxLength={80}
            />
            <FormField
              label={t('myRecipes.ingredientAmount')}
              hint={t('myRecipes.ingredientAmountHint')}
              value={row.amount}
              onChangeText={(amount) =>
                setDraft((prev) => ({
                  ...prev,
                  ingredients: prev.ingredients.map((item) => (item.id === row.id ? { ...item, amount } : item)),
                }))
              }
              maxLength={40}
            />
            <Pressable
              onPress={() => setDraft((prev) => removeDraftIngredient(prev, row.id))}
              accessibilityRole="button"
              accessibilityLabel={t('myRecipes.removeIngredient')}
              hitSlop={8}
              style={styles.removeHit}
            >
              <AppIcon name="close-circle-outline" size={20} color={colors.error} />
              <Text style={styles.remove}>{t('myRecipes.removeIngredient')}</Text>
            </Pressable>
          </ScreenCard>
        ))}
        <PrimaryButton
          label={t('myRecipes.addIngredient')}
          variant="outline"
          onPress={() => setDraft((prev) => addDraftIngredient(prev))}
        />
        <View style={styles.gap} />
        <FormField
          label={t('myRecipes.instructionsLabel')}
          hint={t('myRecipes.instructionsHint')}
          value={draft.instructions}
          onChangeText={(instructions) => setDraft((prev) => ({ ...prev, instructions }))}
          multiline
          maxLength={2000}
          style={styles.instructions}
        />
        <PrimaryButton label={t('common.save')} onPress={() => void onSave()} loading={saving} disabled={saving} />
        <View style={styles.gap} />
        <PrimaryButton label={t('common.cancel')} variant="outline" onPress={() => navigation.goBack()} />
        <View style={styles.bottomPad} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  note: { ...typography.caption, marginBottom: spacing.lg },
  heading: { ...typography.heading, marginBottom: spacing.md },
  body: { ...typography.bodyMuted },
  error: { ...typography.body, color: colors.error, marginBottom: spacing.md },
  gap: { height: spacing.md },
  bottomPad: { height: spacing.xxl * 5 },
  removeHit: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  remove: { ...typography.body, color: colors.error },
  instructions: { minHeight: 96, textAlignVertical: 'top' },
});
