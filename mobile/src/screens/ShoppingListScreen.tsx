import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { AppIcon } from '../components/AppIcon';
import { EmptyState } from '../components/EmptyState';
import { FormField } from '../components/FormField';
import { LoadingState } from '../components/LoadingState';
import { PersonalNoteEditHost, type PersonalNoteEditSession } from '../components/PersonalNoteEditHost';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { useShoppingList } from '../context/ShoppingListContext';
import { useChecklistDraftSuggestions } from '../hooks/useChecklistDraftSuggestions';
import { useI18n } from '../i18n/I18nContext';
import { captureAccountScope, isCurrentAccountScope } from '../lib/accountScope';
import {
  formatPrice,
  isPriceOnRequest,
  productCategoryText,
  safeTrim,
} from '../lib/catalogDisplay';
import {
  indexOfChecklistItem,
  shouldAcceptDraftAddStart,
  shouldScrollChecklistAfterAdd,
  type ChecklistAddResult,
} from '../lib/checklistAddVisibility';
import {
  formatDraftSuggestionDetail,
  linkedInputFromCatalogueProduct,
  personalNoteActionMode,
  shouldCommitDraftListAdd,
  shouldShowDraftSuggestionPanel,
} from '../lib/checklistDraftSearch';
import {
  genericTypeLabelKey,
  genericTypesOfferedForDraft,
  isUncheckedGenericItem,
  type GenericChecklistType,
} from '../lib/genericChecklist';
import { contentMaxWidth } from '../lib/layout';
import { listProgressWordKeys } from '../lib/listProgress';
import { formatProductName, plainProductName, shouldShowBrandEyebrow } from '../lib/productName';
import { createChecklistScanParams } from '../lib/scannerSession';
import { isManualPersonalNote, isUncheckedManualItem } from '../lib/shoppingListBatch';
import type { Product } from '../types/catalog';
import type { ShoppingListProps } from '../types/navigation';
import type { ShoppingListItem } from '../types/shoppingList';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { friendlyErrorMessage } from '../lib/errors';

export function ShoppingListScreen({ navigation }: ShoppingListProps) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const { customer, accountGeneration } = useAuth();
  const {
    items,
    signedIn,
    ready,
    draftLabel,
    setDraftLabel,
    addManualItem,
    addGenericItem,
    addProductItem,
    toggleItem,
    removeItem,
    clearCompleted,
    offerBasketMatch,
  } = useShoppingList();
  const [adding, setAdding] = useState(false);
  const [addConfirm, setAddConfirm] = useState<ChecklistAddResult | null>(null);
  const [noteEdit, setNoteEdit] = useState<PersonalNoteEditSession | null>(null);
  const addingRef = useRef(false);
  const listRef = useRef<FlatList<ShoppingListItem>>(null);
  const pendingScrollId = useRef<string | null>(null);
  const suggestions = useChecklistDraftSuggestions(draftLabel, signedIn && !adding);
  const showSuggestions = shouldShowDraftSuggestionPanel({ draft: draftLabel, adding });
  const offeredGenericTypes = adding ? [] : genericTypesOfferedForDraft(draftLabel);
  const noteMode = personalNoteActionMode({
    draft: draftLabel,
    adding,
    suggestionStatus: suggestions.status,
    genericCount: offeredGenericTypes.length,
  });

  const completed = useMemo(() => items.filter((item) => item.checked).length, [items]);
  const remaining = items.length - completed;
  const canAdd = Boolean(draftLabel.trim()) && !adding;
  const maxWidth = contentMaxWidth(width);
  const liveScope = () =>
    captureAccountScope(customer?.id != null ? String(customer.id) : null, accountGeneration);

  useEffect(() => {
    setNoteEdit(null);
  }, [accountGeneration]);

  const goToAuth = (screen: 'Login' | 'Register') =>
    navigation
      .getParent()
      ?.navigate('Insights', { screen, params: { returnTo: 'shoppingList' } });

  const openCatalogue = () => navigation.getParent()?.navigate('Catalog', { screen: 'CatalogList' });

  const openChecklistScan = (item?: ShoppingListItem) => {
    if (!item) {
      navigation.navigate('ChecklistScan', createChecklistScanParams());
      return;
    }
    const expected =
      typeof item.productId === 'string' && item.productId.trim() ? item.productId.trim() : undefined;
    navigation.navigate('ChecklistScan', createChecklistScanParams(item.id, expected));
  };

  const changeDraft = (value: string) => {
    setDraftLabel(value);
    if (value.trim()) setAddConfirm(null);
  };

  useEffect(() => {
    const id = pendingScrollId.current;
    if (!id) return;
    if (!shouldScrollChecklistAfterAdd({ typing: Boolean(draftLabel.trim()), itemId: id })) return;
    const index = indexOfChecklistItem(items, id);
    if (index < 0) return;
    pendingScrollId.current = null;
    const handle = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, viewPosition: 0.15, animated: true });
    });
    return () => cancelAnimationFrame(handle);
  }, [addConfirm, draftLabel, items]);

  const revealAdd = (result: ChecklistAddResult) => {
    setDraftLabel('');
    setAddConfirm(result);
    Keyboard.dismiss();
    pendingScrollId.current = result.id;
  };

  const finishAdd = (result: ChecklistAddResult, started: ReturnType<typeof liveScope>) => {
    if (!shouldCommitDraftListAdd({ adding: false, started, current: liveScope() })) return;
    revealAdd(result);
  };

  const onAddPersonalNote = async () => {
    const started = liveScope();
    if (
      !draftLabel.trim() ||
      !shouldAcceptDraftAddStart({
        inFlight: addingRef.current,
        startedAccountCurrent: isCurrentAccountScope(started, liveScope()),
      }) ||
      !shouldCommitDraftListAdd({ adding, started, current: liveScope() })
    ) {
      return;
    }
    addingRef.current = true;
    setAdding(true);
    try {
      if (!shouldCommitDraftListAdd({ adding: false, started, current: liveScope() })) return;
      const result = await addManualItem(draftLabel);
      finishAdd(result, started);
    } catch (error) {
      if (shouldCommitDraftListAdd({ adding: false, started, current: liveScope() })) {
        Alert.alert(t('list.addFailed'), friendlyErrorMessage(error));
      }
    } finally {
      addingRef.current = false;
      if (shouldCommitDraftListAdd({ adding: false, started, current: liveScope() })) {
        setAdding(false);
      }
    }
  };

  const onAddGenericType = async (type: GenericChecklistType) => {
    const started = liveScope();
    if (
      !type ||
      !shouldAcceptDraftAddStart({
        inFlight: addingRef.current,
        startedAccountCurrent: isCurrentAccountScope(started, liveScope()),
      }) ||
      !shouldCommitDraftListAdd({ adding, started, current: liveScope() })
    ) {
      return;
    }
    addingRef.current = true;
    setAdding(true);
    try {
      if (!shouldCommitDraftListAdd({ adding: false, started, current: liveScope() })) return;
      const result = await addGenericItem(type);
      finishAdd(result, started);
    } catch (error) {
      if (shouldCommitDraftListAdd({ adding: false, started, current: liveScope() })) {
        Alert.alert(t('list.addFailed'), friendlyErrorMessage(error));
      }
    } finally {
      addingRef.current = false;
      if (shouldCommitDraftListAdd({ adding: false, started, current: liveScope() })) {
        setAdding(false);
      }
    }
  };

  const onSelectSuggestion = async (product: Product) => {
    const started = liveScope();
    const input = linkedInputFromCatalogueProduct(product);
    if (
      !input ||
      !shouldAcceptDraftAddStart({
        inFlight: addingRef.current,
        startedAccountCurrent: isCurrentAccountScope(started, liveScope()),
      }) ||
      !shouldCommitDraftListAdd({ adding, started, current: liveScope() })
    ) {
      return;
    }
    addingRef.current = true;
    setAdding(true);
    try {
      if (!shouldCommitDraftListAdd({ adding: false, started, current: liveScope() })) return;
      const result = await addProductItem(input);
      finishAdd(result, started);
    } catch (error) {
      if (shouldCommitDraftListAdd({ adding: false, started, current: liveScope() })) {
        Alert.alert(t('list.addFailed'), friendlyErrorMessage(error));
      }
    } finally {
      addingRef.current = false;
      if (shouldCommitDraftListAdd({ adding: false, started, current: liveScope() })) {
        setAdding(false);
      }
    }
  };

  const confirmRemove = (item: ShoppingListItem) => {
    Alert.alert(t('list.removeTitle'), item.label, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.remove'), style: 'destructive', onPress: () => void removeItem(item.id) },
    ]);
  };

  const openRowMenu = (item: ShoppingListItem) => {
    const buttons: {
      text: string;
      style?: 'cancel' | 'destructive';
      onPress?: () => void;
    }[] = [];
    if (isManualPersonalNote(item)) {
      buttons.push({
        text: t('list.editNote'),
        onPress: () =>
          setNoteEdit({
            entryId: item.id,
            initialLabel: item.label,
            started: liveScope(),
          }),
      });
    }
    if (isUncheckedManualItem(item)) {
      buttons.push({
        text: t('list.matchWithBasket'),
        onPress: () => {
          if (!offerBasketMatch(item.id)) {
            Alert.alert(t('list.addFailed'), t('list.matchEntryGone'));
          }
        },
      });
    }
    buttons.push({
      text: t('common.remove'),
      style: 'destructive',
      onPress: () => confirmRemove(item),
    });
    buttons.push({ text: t('common.cancel'), style: 'cancel' });
    Alert.alert(item.label, undefined, buttons);
  };

  const confirmClear = () => {
    if (!completed) return;
    Alert.alert(t('list.clearTitle'), t('list.clearBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('list.clearCompleted'), style: 'destructive', onPress: () => void clearCompleted() },
    ]);
  };

  const showListHelp = () => {
    Alert.alert(t('list.autoCheckTitle'), t('list.autoCheckBody'), [
      { text: t('common.ok') },
    ]);
  };

  if (!ready) {
    return <LoadingState message={t('common.loading')} />;
  }

  if (!signedIn) {
    return (
      <ScreenContainer background={colors.cream} contentContainerStyle={styles.signedOutContent}>
        <EmptyState
          iconName="list-outline"
          tone="list"
          title={t('list.signedOutTitle')}
          message={t('list.signedOutBody')}
          action={
            <View style={styles.signedOutActions}>
              <PrimaryButton label={t('common.signIn')} onPress={() => goToAuth('Login')} />
              <View style={styles.signedOutGap} />
              <PrimaryButton
                label={t('common.createAccount')}
                variant="outline"
                onPress={() => goToAuth('Register')}
              />
            </View>
          }
        />
      </ScreenContainer>
    );
  }

  const scanBarPad = spacing.sm;
  const confirmCopy = addConfirm
    ? addConfirm.kind === 'updated'
      ? t('list.updatedInlineNamed', { name: addConfirm.label })
      : t('list.addedInlineNamed', { name: addConfirm.label })
    : null;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.composer, { maxWidth, width: '100%', alignSelf: 'center' }]}>
        <View style={styles.toolbar}>
          <Text style={styles.progress} accessibilityRole="header">
            {items.length
              ? t('list.progress', {
                  completed,
                  total: items.length,
                  remaining,
                  collectedWord: t(listProgressWordKeys(completed, remaining).collectedKey),
                  remainingWord: t(listProgressWordKeys(completed, remaining).remainingKey),
                })
              : t('list.emptyScanHint')}
          </Text>
          <View style={styles.toolbarActions}>
            <Pressable
              onPress={openCatalogue}
              accessibilityRole="button"
              accessibilityLabel={t('list.browseCatalog')}
              accessibilityHint={t('list.browseCatalogHint')}
              style={styles.browseHit}
            >
              <AppIcon name="grid-outline" size={18} color={colors.primary} />
              <Text style={styles.toolbarLink}>{t('list.browseCatalog')}</Text>
            </Pressable>
            <Pressable
              onPress={showListHelp}
              accessibilityRole="button"
              accessibilityLabel={t('list.helpA11y')}
              style={styles.iconHit}
            >
              <AppIcon name="help-circle-outline" size={22} color={colors.primary} />
            </Pressable>
          </View>
        </View>
        <FormField
          label={t('list.addItem')}
          hideLabel
          value={draftLabel}
          onChangeText={changeDraft}
          placeholder={t('list.placeholder')}
          returnKeyType="done"
          onSubmitEditing={() => void onAddPersonalNote()}
          editable={!adding}
          maxLength={120}
          containerStyle={styles.addField}
        />
        {confirmCopy ? (
          <Text style={styles.confirm} accessibilityLiveRegion="polite" accessibilityRole="text">
            {confirmCopy}
          </Text>
        ) : null}
        {offeredGenericTypes.length === 1 && offeredGenericTypes[0] ? (
          <View style={styles.genericRow}>
            <Text style={styles.genericLabel}>
              {t('list.genericChoice', { name: t(genericTypeLabelKey(offeredGenericTypes[0])) })}
            </Text>
            <Pressable
              onPress={() => void onAddGenericType(offeredGenericTypes[0])}
              disabled={!canAdd}
              accessibilityRole="button"
              accessibilityLabel={t('list.addGenericAction')}
              accessibilityHint={t('list.genericChoiceHint')}
              style={styles.genericAddHit}
            >
              <Text style={styles.genericAdd}>{t('list.addGenericAction')}</Text>
            </Pressable>
          </View>
        ) : offeredGenericTypes.length > 1 ? (
          <View style={styles.genericChoice}>
            <Text style={styles.chooseType}>{t('list.chooseGenericType')}</Text>
            {offeredGenericTypes.map((type) => (
              <View key={type} style={styles.genericRow}>
                <Text style={styles.genericLabel}>
                  {t('list.genericChoice', { name: t(genericTypeLabelKey(type)) })}
                </Text>
                <Pressable
                  onPress={() => void onAddGenericType(type)}
                  disabled={!canAdd}
                  accessibilityRole="button"
                  accessibilityLabel={t('list.addGenericAction')}
                  accessibilityHint={t('list.genericChoiceHint')}
                  style={styles.genericAddHit}
                >
                  <Text style={styles.genericAdd}>{t('list.addGenericAction')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {showSuggestions ? (
          <View>
            {offeredGenericTypes.length === 1 ? (
              <Text style={styles.chooseSpecific}>{t('list.chooseSpecific')}</Text>
            ) : null}
            <View
              style={styles.suggestPanel}
              accessibilityRole="list"
              accessibilityLabel={t('list.suggestionsA11y')}
            >
              {suggestions.status === 'loading' ? (
                <Text style={styles.suggestStatus}>{t('list.suggestionsSearching')}</Text>
              ) : suggestions.status === 'error' ? (
                <Text style={styles.suggestStatus}>{t('list.suggestionsFailed')}</Text>
              ) : suggestions.status === 'empty' ? (
                <Text style={styles.suggestStatus}>{t('list.suggestionsEmpty')}</Text>
              ) : (
                suggestions.products.map((product) => {
                  const rawName =
                    safeTrim(product.name) || safeTrim(product.sourceName) || t('common.product');
                  const name = formatProductName(rawName);
                  const brand = shouldShowBrandEyebrow(product.brand, rawName)
                    ? safeTrim(product.brand)
                    : '';
                  const price = isPriceOnRequest(product)
                    ? formatPrice(product)
                    : `${formatPrice(product)} TND`;
                  const category = productCategoryText(product, t, { compact: true });
                  const detail = formatDraftSuggestionDetail([brand, category, price]);
                  return (
                    <Pressable
                      key={product.id}
                      onPress={() => void onSelectSuggestion(product)}
                      disabled={adding}
                      style={styles.suggestRow}
                      accessibilityRole="button"
                      accessibilityLabel={[plainProductName(rawName), detail].filter(Boolean).join('. ')}
                      accessibilityHint={t('list.suggestionHint')}
                    >
                      <Text style={styles.suggestName}>{name}</Text>
                      {detail ? <Text style={styles.suggestDetail}>{detail}</Text> : null}
                    </Pressable>
                  );
                })
              )}
            </View>
          </View>
        ) : null}
        {noteMode === 'unmatched' ? (
          <View style={styles.noteChoice}>
            <Pressable
              onPress={() => void onAddPersonalNote()}
              disabled={!canAdd}
              accessibilityRole="button"
              accessibilityLabel={t('list.addUnmatched', { text: draftLabel.trim() })}
              accessibilityHint={t('list.addUnmatchedHint')}
              style={styles.unmatchedHit}
            >
              <Text style={styles.unmatchedTitle}>
                {t('list.addUnmatched', { text: draftLabel.trim() })}
              </Text>
            </Pressable>
            <Text style={styles.noteHint}>{t('list.addUnmatchedHint')}</Text>
          </View>
        ) : noteMode === 'quiet' ? (
          <Pressable
            onPress={() => void onAddPersonalNote()}
            disabled={!canAdd}
            accessibilityRole="button"
            accessibilityLabel={t('list.addAsNoteQuiet')}
            accessibilityHint={t('list.addPersonalNoteHint')}
            style={styles.quietNoteHit}
          >
            <Text style={styles.quietNote}>{t('list.addAsNoteQuiet')}</Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        ref={listRef}
        style={styles.list}
        data={items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({
            offset: Math.max(0, info.averageItemLength * info.index),
            animated: true,
          });
        }}
        contentContainerStyle={[
          styles.content,
          { maxWidth, width: '100%', alignSelf: 'center', paddingBottom: 64 + scanBarPad },
        ]}
        ItemSeparatorComponent={
          items.length
            ? () => (
                <View style={styles.separatorTrack}>
                  <View style={styles.separator} />
                </View>
              )
            : null
        }
        ListHeaderComponent={
          items.length ? (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('list.items')}</Text>
              {completed ? (
                <Pressable
                  onPress={confirmClear}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('list.clearCompleted')}
                  style={styles.clearHit}
                >
                  <Text style={styles.clearLink}>{t('list.clearCompleted')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={<EmptyState title={t('list.emptyTitle')} message={t('list.emptyBody')} />}
        renderItem={({ item, index }) => {
          const showScan = item.checked !== true;
          const highlighted = addConfirm?.id === item.id;
          const generic = isUncheckedGenericItem(item);
          const personal = isUncheckedManualItem(item);
          const first = index === 0;
          const last = index === items.length - 1;
          return (
            <View
              style={[
                styles.itemRow,
                first && styles.itemRowFirst,
                last && styles.itemRowLast,
                highlighted && styles.itemRowHighlight,
              ]}
            >
              <Pressable
                style={styles.checkboxHit}
                onPress={() => void toggleItem(item.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.checked }}
                accessibilityLabel={item.label}
                accessibilityHint={t('list.toggleHint')}
              >
                <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                  {item.checked ? <AppIcon name="checkmark" size={16} color={colors.textOnPrimary} /> : null}
                </View>
              </Pressable>
              <View style={styles.itemRest}>
                <View style={styles.itemHeadline}>
                  <Pressable
                    style={styles.itemBody}
                    onPress={() => void toggleItem(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                  >
                    <Text style={[styles.itemLabel, item.checked && styles.itemLabelChecked]}>
                      {item.label}
                    </Text>
                  </Pressable>
                  <View style={styles.rowActions}>
                    {showScan ? (
                      <Pressable
                        onPress={() => openChecklistScan(item)}
                        style={styles.rowScan}
                        accessibilityRole="button"
                        accessibilityLabel={t('list.scanRow')}
                        accessibilityHint={t('list.scanRowHint', { label: item.label })}
                      >
                        <AppIcon name="barcode-outline" size={16} color={colors.primary} />
                        <Text style={styles.rowScanText}>{t('list.scanRow')}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => openRowMenu(item)}
                      style={styles.iconHit}
                      accessibilityRole="button"
                      accessibilityLabel={t('list.rowMenuA11y', { label: item.label })}
                      accessibilityHint={t('list.rowMenuHint', { label: item.label })}
                    >
                      <AppIcon name="ellipsis-horizontal" size={22} color={colors.textMuted} />
                    </Pressable>
                  </View>
                </View>
                <View style={styles.itemMetaRow}>
                  {item.checked ? <Text style={styles.metaCollected}>{t('list.collected')}</Text> : null}
                  {generic ? <Text style={styles.metaGeneric}>{t('list.genericBadge')}</Text> : null}
                  {personal ? <Text style={styles.metaNote}>{t('list.personalNoteBadge')}</Text> : null}
                  <Text style={styles.itemMeta}>
                    {item.quantity > 1
                      ? t('list.quantity', { quantity: item.quantity })
                      : t('list.quantityOne')}
                  </Text>
                </View>
              </View>
            </View>
          );
        }}
      />
      <View style={[styles.scanBar, { paddingBottom: scanBarPad }]} accessibilityRole="toolbar">
        <PrimaryButton
          label={t('list.scanProduct')}
          onPress={() => openChecklistScan()}
          accessibilityHint={t('list.scanProductHint')}
        />
      </View>
      <PersonalNoteEditHost session={noteEdit} onClose={() => setNoteEdit(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  list: { flex: 1, backgroundColor: colors.cream },
  composer: {
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  content: { paddingHorizontal: spacing.screen, backgroundColor: colors.cream },
  signedOutContent: { flexGrow: 1, justifyContent: 'center' },
  signedOutActions: { width: '100%' },
  signedOutGap: { height: spacing.md },
  toolbar: {
    gap: spacing.xs,
  },
  toolbarActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  progress: { ...typography.body, fontWeight: '600', color: colors.text },
  browseHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    flexShrink: 1,
  },
  toolbarLink: { color: colors.primary, fontWeight: '600', fontSize: 14, flexShrink: 1 },
  iconHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addField: { marginBottom: 0 },
  confirm: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.success,
  },
  suggestPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    maxHeight: 220,
  },
  suggestStatus: { ...typography.caption, padding: spacing.md },
  suggestRow: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestName: { ...typography.body, fontWeight: '600' },
  suggestDetail: { ...typography.caption, marginTop: 2 },
  genericChoice: { marginBottom: 0, gap: spacing.sm },
  genericRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  genericLabel: { ...typography.body, flex: 1, minWidth: 0, fontWeight: '500' },
  genericAddHit: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  genericAdd: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  chooseType: { ...typography.label, color: colors.text },
  chooseSpecific: { ...typography.caption, marginBottom: spacing.xs },
  noteChoice: { gap: spacing.xs },
  noteHint: { ...typography.caption },
  unmatchedHit: { minHeight: 44, justifyContent: 'center' },
  unmatchedTitle: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  quietNoteHit: { minHeight: 36, justifyContent: 'center', paddingVertical: spacing.xs },
  quietNote: { color: colors.textMuted, fontWeight: '500', fontSize: 14 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.cream,
  },
  sectionTitle: { ...typography.label, color: colors.text },
  clearHit: { minHeight: 44, justifyContent: 'center' },
  clearLink: { color: colors.error, fontSize: 13, fontWeight: '600' },
  separatorTrack: { backgroundColor: colors.surface },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 56 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingRight: spacing.xs,
  },
  itemRowFirst: {
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  itemRowLast: {
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  itemRowHighlight: { backgroundColor: colors.primaryLight },
  itemRest: { flex: 1, minWidth: 0 },
  itemHeadline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  itemBody: { flexGrow: 1, flexShrink: 1, minWidth: 0, paddingVertical: spacing.xs },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  checkboxHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  itemLabel: { fontSize: 16, lineHeight: 22, fontWeight: '500', color: colors.text },
  itemLabelChecked: { textDecorationLine: 'line-through', color: colors.textMuted, fontWeight: '400' },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 0,
  },
  itemMeta: { ...typography.caption },
  metaCollected: { ...typography.caption, color: colors.success, fontWeight: '400' },
  metaGeneric: { ...typography.caption, color: colors.info, fontWeight: '400' },
  metaNote: { ...typography.caption, color: colors.textMuted, fontWeight: '400' },
  rowScan: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  rowScanText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  scanBar: {
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.sm,
    backgroundColor: colors.cream,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
