import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { fetchProductByBarcode } from '../api/catalog';
import { Badge } from '../components/Badge';
import { ErrorState } from '../components/ErrorState';
import { FormField } from '../components/FormField';
import { LoadingState } from '../components/LoadingState';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProductImage } from '../components/ProductImage';
import { ScreenCard } from '../components/ScreenCard';
import { ScreenContainer } from '../components/ScreenContainer';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { useShoppingList } from '../context/ShoppingListContext';
import { captureAccountScope, isCurrentAccountScope } from '../lib/accountScope';
import { friendlyBarcodeLookupError } from '../lib/barcodeLookup';
import { formatPrice, isPriceOnRequest, productCategoryText, safeTrim } from '../lib/catalogDisplay';
import { isNetworkError } from '../lib/errors';
import { formatProductName, plainProductName } from '../lib/productName';
import { recoverAmbiguousScannerAdd } from '../lib/scannerAddRecovery';
import { listCollectMeta } from '../lib/cartAddOutcome';
import {
  extraItemIdForTargetedAdd,
  evaluateLinkedScanMatch,
  isUncheckedManualItem,
  resolveChecklistRowScanTarget,
  resolveExpectedProductId,
} from '../lib/shoppingListBatch';
import {
  evaluateTargetedGenericScan,
  extraItemIdForTargetedGenericAdd,
  isUncheckedGenericItem,
  onePackageDoesNotCompleteQuantity,
  packageChoiceParts,
} from '../lib/genericChecklist';
import {
  createScannerSessionGuard,
  quantityOfProduct,
  shouldDisableAddSubmit,
  shouldRenderCameraPreview,
  shouldReturnToChecklistAfterAdd,
  shouldShowScanDiagnostics,
  type ScannerMode,
  type ScannerOperation,
  type ScannerSessionGuard,
} from '../lib/scannerSession';
import type { Product } from '../types/catalog';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { friendlyErrorMessage } from '../lib/errors';

type Phase = 'scan' | 'lookup' | 'result' | 'error';

const BARCODE_TYPES = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
  'code39',
  'qr',
] as const;

const SCAN_DEBOUNCE_MS = 2500;

type Props = {
  mode: ScannerMode;
  // Browse uses a constant; checklist uses a fresh serialisable session id.
  sessionId: string;
  // Optional unchecked row; ignored unless it still matches.
  targetItemId?: string;
  // Catalogue product id expected for a linked-row targeted scan.
  expectedProductId?: string;
  onClose?: () => void;
  onViewProduct?: (productId: string) => void;
  onInspectBasket?: () => void;
};

export function BarcodeScannerFlow({
  mode,
  sessionId,
  targetItemId,
  expectedProductId,
  onClose,
  onViewProduct,
  onInspectBasket,
}: Props) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { t } = useI18n();
  const { customer, accountGeneration } = useAuth();
  const { addItem, refresh, cart } = useCart();
  const {
    items,
    addProductItem,
    prepareCollectedMarks,
    commitPreparedCollected,
    setNotice,
    presentAddFeedback,
  } = useShoppingList();
  const scanTarget = mode === 'checklist' ? resolveChecklistRowScanTarget(items, targetItemId) : null;
  const expectedLinkedId = resolveExpectedProductId({
    target: scanTarget,
    sessionExpectedProductId: expectedProductId,
  });
  const [permission, requestPermission] = useCameraPermissions();

  const [phase, setPhase] = useState<Phase>('scan');
  const [scanEnabled, setScanEnabled] = useState(true);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [matchedCodBar, setMatchedCodBar] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [addUnresolved, setAddUnresolved] = useState(false);
  const [addingToList, setAddingToList] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [inputFocused, setInputFocused] = useState(false);

  const lookupInFlight = useRef(false);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const guardRef = useRef<ScannerSessionGuard>(createScannerSessionGuard(sessionId));
  const closedRef = useRef(false);
  const addingRef = useRef(false);
  const addedRef = useRef(false);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const accountId = customer?.id != null ? String(customer.id) : null;
  const accountRef = useRef(captureAccountScope(accountId, accountGeneration));
  accountRef.current = captureAccountScope(accountId, accountGeneration);
  const currentAccount = () => accountRef.current;

  useEffect(() => {
    closedRef.current = false;
    guardRef.current = createScannerSessionGuard(sessionId);
    return () => {
      closedRef.current = true;
      guardRef.current.invalidateAll();
    };
  }, [sessionId]);

  useEffect(() => {
    if (isFocused) return;
    guardRef.current.invalidateBlur();
    lookupInFlight.current = false;
    setLookupBusy(false);
    if (phaseRef.current === 'lookup') {
      setPhase('scan');
      setScanEnabled(true);
    }
  }, [isFocused]);

  const accountReadyRef = useRef(false);
  useEffect(() => {
    if (!accountReadyRef.current) {
      accountReadyRef.current = true;
      return;
    }
    guardRef.current.invalidateAccount();
    lookupInFlight.current = false;
    addingRef.current = false;
    addedRef.current = false;
    setAdding(false);
    setLookupBusy(false);
    setAddedToCart(false);
    setAddUnresolved(false);
    setPhase('scan');
    setScanEnabled(true);
    setProduct(null);
    setErrorMessage(null);
    setMatchedCodBar(null);
    lastScanRef.current = null;
  }, [accountGeneration, accountId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      setAppActive(next === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    addingRef.current = adding;
    navigation.setOptions({ gestureEnabled: !adding });
  }, [adding, navigation]);

  useEffect(() => {
    if (mode !== 'checklist') return;
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (!addingRef.current) return;
      e.preventDefault();
    });
    return unsub;
  }, [mode, navigation]);

  const runLookup = useCallback(
    async (barcode: string) => {
      const code = barcode.trim();
      const op = guardRef.current.beginLookup(currentAccount());
      lookupInFlight.current = true;
      setLookupBusy(true);
      setScanEnabled(false);
      setAddedToCart(false);
      setAddUnresolved(false);
      addedRef.current = false;

      const canCommitLookup = () =>
        guardRef.current.isLookupCurrent(op, currentAccount(), closedRef.current);

      if (!code) {
        if (canCommitLookup()) {
          setErrorMessage(t('scan.enterBarcode'));
          setPhase('error');
        }
        if (canCommitLookup()) {
          lookupInFlight.current = false;
          setLookupBusy(false);
        }
        return;
      }

      setPhase('lookup');
      setErrorMessage(null);
      setProduct(null);
      setMatchedCodBar(null);

      try {
        const { product: p, lookup } = await fetchProductByBarcode(code);
        if (!canCommitLookup()) return;
        setProduct(p);
        setMatchedCodBar(lookup.matchedCodBar || code);
        setPhase('result');
      } catch (e) {
        if (!canCommitLookup()) return;
        setErrorMessage(friendlyBarcodeLookupError(e));
        setPhase('error');
      } finally {
        if (canCommitLookup()) {
          lookupInFlight.current = false;
          setLookupBusy(false);
        }
      }
    },
    [accountGeneration, accountId, t],
  );

  const processing = lookupBusy || adding || phase === 'lookup';
  const cameraGranted = permission?.granted === true;
  const cameraDenied =
    permission != null && !permission.granted && permission.status === 'denied';
  const showCamera = shouldRenderCameraPreview({
    isFocused,
    appActive,
    phase,
    cameraGranted,
    processing,
    inputFocused,
  });

  const onBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (!showCamera || !scanEnabled || lookupInFlight.current || lookupBusy || phase !== 'scan') {
        return;
      }
      const code = data?.trim();
      if (!code) return;

      const last = lastScanRef.current;
      if (last && last.code === code && Date.now() - last.at < SCAN_DEBOUNCE_MS) {
        return;
      }
      lastScanRef.current = { code, at: Date.now() };
      void runLookup(code);
    },
    [showCamera, scanEnabled, lookupBusy, phase, runLookup],
  );

  const onSearchManual = () => {
    if (lookupInFlight.current || lookupBusy || addingRef.current) return;
    void runLookup(manualBarcode);
  };

  const onScanAgain = () => {
    guardRef.current.invalidateBlur();
    lookupInFlight.current = false;
    setPhase('scan');
    setScanEnabled(true);
    setLookupBusy(false);
    setProduct(null);
    setErrorMessage(null);
    setMatchedCodBar(null);
    setAddedToCart(false);
    setAddUnresolved(false);
    addedRef.current = false;
    lastScanRef.current = null;
  };

  const requestClose = () => {
    if (addingRef.current) return;
    guardRef.current.invalidateBlur();
    if (mode === 'checklist') onClose?.();
    else onScanAgain();
  };

  const inspectBasket = () => {
    onInspectBasket?.();
  };

  const isSameAccount = (started: ReturnType<typeof currentAccount>) =>
    isCurrentAccountScope(started, currentAccount());

  const finishChecklistAdd = (op: ScannerOperation) => {
    if (
      !shouldReturnToChecklistAfterAdd({
        mode,
        closed: closedRef.current,
        generationCurrent: guardRef.current.isAddSideEffectCurrent(op, currentAccount(), closedRef.current),
        basketAdded: true,
      })
    ) {
      return;
    }
    onClose?.();
  };

  const offerUnresolvedRecovery = (title: string, message: string) => {
    Alert.alert(title, message, [
      { text: t('scan.viewBasket'), onPress: inspectBasket },
      {
        text: t('scan.refreshBasket'),
        onPress: () => {
          void refresh();
        },
      },
      { text: t('common.ok') },
    ]);
  };

  const onAddToList = async () => {
    if (mode === 'checklist') return;
    if (!product?.id || addingToList) return;
    setAddingToList(true);
    const name = safeTrim(product.name) || t('common.product');
    const started = currentAccount();
    try {
      await addProductItem({ productId: product.id, label: name });
      if (!closedRef.current && isSameAccount(started)) {
        Alert.alert(t('list.addedTitle'), t('list.addedProduct', { name }));
      }
    } catch (e) {
      if (!closedRef.current && isSameAccount(started)) {
        Alert.alert(t('list.addFailed'), friendlyErrorMessage(e));
      }
    } finally {
      if (!closedRef.current && isSameAccount(started)) setAddingToList(false);
    }
  };

  const onAddToCart = async () => {
    if (
      !product?.id ||
      shouldDisableAddSubmit({
        productId: product.id,
        adding,
        alreadyAdded: addedRef.current,
        unresolved: addUnresolved,
      })
    ) {
      return;
    }
    const productId = product.id;
    if (
      evaluateLinkedScanMatch({
        expectedProductId: expectedLinkedId,
        scannedProductId: productId,
      }).kind === 'mismatch'
    ) {
      return;
    }
    addingRef.current = true;
    addedRef.current = true;
    setAdding(true);
    setAddUnresolved(false);
    const op = guardRef.current.beginAdd(currentAccount());
    const name = safeTrim(product.name) || t('common.product');
    const preQuantity = quantityOfProduct(cart.items, productId);
    const intendedDelta = 1;
    const extraItemId = isUncheckedGenericItem(scanTarget)
      ? extraItemIdForTargetedGenericAdd(scanTarget, product)
      : extraItemIdForTargetedAdd(scanTarget);
    if (isUncheckedGenericItem(scanTarget) && !extraItemId) {
      addingRef.current = false;
      addedRef.current = false;
      setAdding(false);
      return;
    }
    const listPlan = prepareCollectedMarks({ productId, extraItemId });

    const sideEffectsCurrent = () =>
      guardRef.current.isAddSideEffectCurrent(op, currentAccount(), closedRef.current);

    const commitSuccess = async (
      listSynced: boolean,
      bodyKey: 'confirmed' | 'observed',
      collect = listCollectMeta(undefined),
    ) => {
      if (!sideEffectsCurrent()) return;
      addingRef.current = false;
      setAdding(false);
      setAddedToCart(true);
      if (bodyKey === 'confirmed') {
        presentAddFeedback({
          started: op.account,
          addConfirmed: true,
          extraItemId,
          targetedScan: Boolean(scanTarget),
          productName: name,
          productId,
          listSynced,
          collectKind: collect.collectKind,
          remainingUnchecked: collect.remainingUnchecked,
          eligibleManualCount: collect.eligibleManualCount,
          extraMarked: listPlan?.extraMarked,
          extraDecremented: listPlan?.extraDecremented,
          productCanonicalType: product.canonicalType,
          classificationStatus: product.classificationStatus,
          packageLabel: packageChoiceParts(product).join(' · ') || name,
        });
      } else {
        setNotice({
          name,
          productId,
          listSynced,
          extraItemId,
          kind: 'unresolved',
          started: op.account,
        });
      }
      if (mode === 'checklist') {
        finishChecklistAdd(op);
      }
    };

    try {
      const result = await addItem(
        productId,
        1,
        listPlan != null ? { collectedPlan: listPlan } : undefined,
      );
      await commitSuccess(result.listSync.status === 'ok', 'confirmed', listCollectMeta(result.listSync));
    } catch (e) {
      if (isNetworkError(e)) {
        const recovery = await recoverAmbiguousScannerAdd({
          productId,
          preQuantity,
          intendedDelta,
          refresh: async () => {
            const latest = await refresh();
            if (!latest.ok) return { status: 'failed' as const };
            return { status: 'ok' as const, items: latest.cart.items };
          },
          isAccountCurrent: () => isCurrentAccountScope(op.account, currentAccount()),
          isOperationCurrent: sideEffectsCurrent,
          markCollected: async () => {
            if (!listPlan) return;
            await commitPreparedCollected(listPlan);
          },
        });
        addedRef.current = true;
        if (recovery.outcome === 'stale') return;
        if (!sideEffectsCurrent()) return;
        if (recovery.outcome === 'observed') {
          await commitSuccess(recovery.listMarked, 'observed');
          return;
        }
        setAddUnresolved(true);
        if (recovery.outcome === 'unresolved') {
          offerUnresolvedRecovery(t('scan.couldNotAdd'), t('scan.addRefreshFailed'));
          return;
        }
        offerUnresolvedRecovery(t('scan.couldNotAdd'), t('scan.addNotConfirmed', { name }));
        return;
      }
      if (!sideEffectsCurrent()) return;
      addedRef.current = false;
      Alert.alert(t('scan.couldNotAdd'), friendlyBarcodeLookupError(e));
    } finally {
      addingRef.current = false;
      if (guardRef.current.isAddGenerationCurrent(op)) setAdding(false);
    }
  };

  const showSimulatorHint = shouldShowScanDiagnostics(process.env.EXPO_PUBLIC_SCAN_DIAGNOSTICS);
  const overlayText = lookupBusy || !scanEnabled ? t('scan.overlayBusy') : t('scan.overlayIdle');
  const addDisabled = shouldDisableAddSubmit({
    productId: product?.id,
    adding,
    alreadyAdded: addedToCart || addedRef.current,
    unresolved: addUnresolved,
  });

  if (phase === 'lookup') {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState message={t('scan.lookingUp')} />
        <PrimaryButton
          label={mode === 'checklist' ? t('list.scanCancel') : t('scan.retryLookup')}
          onPress={requestClose}
          variant="outline"
        />
      </ScreenContainer>
    );
  }

  if (phase === 'result' && product) {
    const cat = productCategoryText(product, t);
    const onRequest = isPriceOnRequest(product);
    const rawName = safeTrim(product.name) || t('common.product');
    const targeted = Boolean(scanTarget);
    const linkedMatch = evaluateLinkedScanMatch({
      expectedProductId: expectedLinkedId,
      scannedProductId: product.id,
    });
    const genericScan = evaluateTargetedGenericScan({ target: scanTarget, product });
    const mismatch = linkedMatch.kind === 'mismatch';
    const genericIncompatible = genericScan.kind === 'incompatible';
    const blocked = mismatch || genericIncompatible;
    return (
      <ScreenContainer>
        <Text style={styles.resultHeading}>
          {genericIncompatible
            ? t('list.genericIncompatibleTitle')
            : mismatch
              ? t('list.scanMismatchTitle')
              : targeted
                ? t('list.scanTargetHeading')
                : t('scan.resultHeading')}
        </Text>
        <ScreenCard style={styles.resultCard}>
          <ProductImage product={product} size="detail" />
          <Text style={styles.resultName} accessibilityLabel={plainProductName(rawName)}>
            {formatProductName(rawName)}
          </Text>
          {cat ? <Text style={styles.resultMeta}>{cat}</Text> : null}
          <View style={styles.priceRow}>
            <Text style={[styles.resultPrice, onRequest && styles.priceMuted]}>
              {formatPrice(product)}
            </Text>
            {onRequest ? <Badge label={t('price.toBeConfirmed')} tone="neutral" /> : null}
          </View>
          {showSimulatorHint && matchedCodBar ? (
            <Text style={styles.barcodeLine}>
              {t('scan.matchedBarcode', { code: matchedCodBar })}
            </Text>
          ) : null}
        </ScreenCard>
        {scanTarget && !blocked && isUncheckedManualItem(scanTarget) ? (
          <ScreenCard style={styles.targetCard}>
            <Text style={styles.pairKicker}>{t('list.matchProductLabel')}</Text>
            <Text style={styles.targetEntry}>{formatProductName(rawName)}</Text>
            {cat ? <Text style={styles.quantityNote}>{cat}</Text> : null}
            <Text style={styles.quantityNote}>
              {onRequest ? formatPrice(product) : `${formatPrice(product)} TND`}
            </Text>
            <Text style={[styles.pairKicker, styles.pairGap]}>{t('list.matchNoteLabel')}</Text>
            <Text style={styles.targetEntry}>{scanTarget.label}</Text>
            <Text style={styles.quantityNote}>{t('list.matchFulfilsNote')}</Text>
            {scanTarget.quantity > 1 ? (
              <Text style={styles.quantityNote}>
                {t('list.scanQuantityNote', {
                  quantity: scanTarget.quantity,
                  label: scanTarget.label,
                })}
              </Text>
            ) : null}
          </ScreenCard>
        ) : scanTarget && !blocked && isUncheckedGenericItem(scanTarget) ? (
          <ScreenCard style={styles.targetCard}>
            <Text style={styles.pairKicker}>{t('list.genericPackageLabel')}</Text>
            <Text style={styles.targetEntry}>{formatProductName(rawName)}</Text>
            {packageChoiceParts(product).length ? (
              <Text style={styles.quantityNote}>{packageChoiceParts(product).join(' · ')}</Text>
            ) : null}
            <Text style={[styles.pairKicker, styles.pairGap]}>{t('list.genericEntryLabel')}</Text>
            <Text style={styles.targetEntry}>{scanTarget.label}</Text>
            {onePackageDoesNotCompleteQuantity(scanTarget.quantity) ? (
              <Text style={styles.quantityNote}>
                {t('list.genericQuantityNote', { quantity: scanTarget.quantity })}
              </Text>
            ) : null}
          </ScreenCard>
        ) : scanTarget && !blocked ? (
          <ScreenCard style={styles.targetCard}>
            <Text style={styles.targetEntry}>
              {t('list.scanTargetEntry', { label: scanTarget.label })}
            </Text>
            {scanTarget.quantity > 1 ? (
              <Text style={styles.quantityNote}>
                {t('list.scanQuantityNote', {
                  quantity: scanTarget.quantity,
                  label: scanTarget.label,
                })}
              </Text>
            ) : null}
          </ScreenCard>
        ) : null}
        {genericIncompatible ? (
          <ScreenCard style={styles.targetCard}>
            <Text style={styles.targetEntry}>
              {t('list.genericIncompatibleBody', {
                product: formatProductName(rawName),
                type: scanTarget?.label ?? '',
              })}
            </Text>
          </ScreenCard>
        ) : mismatch ? (
          <ScreenCard style={styles.targetCard}>
            <Text style={styles.targetEntry}>{t('list.scanMismatchBody')}</Text>
          </ScreenCard>
        ) : null}
        <View style={styles.resultActions}>
          {blocked ? (
            <>
              <PrimaryButton
                label={t('list.scanAgain')}
                onPress={onScanAgain}
                accessibilityHint={t('list.scanAgainHint')}
              />
              <PrimaryButton
                label={t('list.scanCancel')}
                onPress={requestClose}
                variant="outline"
              />
            </>
          ) : mode === 'checklist' && scanTarget ? (
            <>
              <PrimaryButton
                label={t('list.addAndCheck', { label: scanTarget.label })}
                onPress={() => void onAddToCart()}
                loading={adding}
                disabled={addDisabled}
                accessibilityHint={t('list.addAndCheckHint')}
              />
              <PrimaryButton
                label={t('scan.retryLookup')}
                onPress={onScanAgain}
                variant="outline"
                disabled={adding}
              />
              <PrimaryButton
                label={t('list.scanCancel')}
                onPress={requestClose}
                variant="outline"
                disabled={adding}
              />
            </>
          ) : mode === 'checklist' ? (
            <>
              <PrimaryButton
                label={t('list.addAndReturn')}
                onPress={() => void onAddToCart()}
                loading={adding}
                disabled={addDisabled}
                accessibilityHint={t('list.addAndReturnHint')}
              />
              <PrimaryButton
                label={t('scan.retryLookup')}
                onPress={onScanAgain}
                variant="outline"
                disabled={adding}
              />
              <PrimaryButton
                label={t('list.scanCancel')}
                onPress={requestClose}
                variant="outline"
                disabled={adding}
              />
            </>
          ) : (
            <>
              <PrimaryButton
                label={addedToCart ? t('scan.addedToBasket') : t('scan.addToBasket')}
                onPress={() => void onAddToCart()}
                loading={adding}
                disabled={addDisabled}
                accessibilityHint={t('scan.addToBasketHint')}
              />
              <PrimaryButton
                label={t('scan.scanAnother')}
                onPress={onScanAgain}
                variant="outline"
                disabled={adding}
              />
              {showSimulatorHint ? (
                <>
                  <PrimaryButton
                    label={t('scan.addToShoppingList')}
                    onPress={() => void onAddToList()}
                    loading={addingToList}
                    disabled={addingToList || adding}
                    variant="outline"
                    accessibilityHint={t('product.addToShoppingListHint')}
                  />
                  <PrimaryButton
                    label={t('scan.viewDetails')}
                    onPress={() => product.id && onViewProduct?.(product.id)}
                    variant="outline"
                    disabled={adding}
                    accessibilityHint={t('product.openHint')}
                  />
                </>
              ) : null}
            </>
          )}
        </View>
      </ScreenContainer>
    );
  }

  if (phase === 'error' && errorMessage) {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenContainer contentContainerStyle={styles.errorContent}>
          {mode === 'checklist' ? (
            <PrimaryButton
              label={t('list.scanCancel')}
              onPress={requestClose}
              variant="outline"
            />
          ) : null}
          <View style={styles.errorBlock}>
            <ErrorState
              message={errorMessage}
              onRetry={onScanAgain}
              retryLabel={t('scan.retryLookup')}
            />
          </View>
          <ManualBarcodeSection
            value={manualBarcode}
            onChange={setManualBarcode}
            onSubmit={onSearchManual}
            busy={lookupBusy}
            showSimulatorHint={showSimulatorHint}
            t={t}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
        </ScreenContainer>
      </KeyboardAvoidingView>
    );
  }

  if (!cameraGranted) {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenContainer>
          {mode === 'checklist' ? (
            <PrimaryButton
              label={t('list.scanCancel')}
              onPress={requestClose}
              variant="outline"
            />
          ) : null}
          <ScreenCard style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>{t('scan.cameraTitle')}</Text>
            <Text style={styles.permissionBody}>
              {cameraDenied ? t('scan.cameraDenied') : t('scan.cameraPrompt')}
            </Text>
          </ScreenCard>
          <PrimaryButton
            label={cameraDenied ? t('scan.tryCameraAgain') : t('scan.allowCamera')}
            onPress={() => void requestPermission()}
          />
          <ManualBarcodeSection
            value={manualBarcode}
            onChange={setManualBarcode}
            onSubmit={onSearchManual}
            busy={lookupBusy}
            showSimulatorHint={showSimulatorHint}
            t={t}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
        </ScreenContainer>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.flex}>
        <View style={styles.cameraWrap}>
          {showCamera ? (
            <CameraView
              style={styles.camera}
              facing="back"
              active={showCamera}
              barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
              onBarcodeScanned={scanEnabled && !lookupBusy ? onBarcodeScanned : undefined}
              accessibilityLabel={t('scan.cameraA11y')}
            />
          ) : (
            <View style={styles.camera} />
          )}
          <View style={styles.frame} pointerEvents="none">
            <View style={styles.frameBox} />
            <Text style={styles.frameHint}>{t('scan.frameHint')}</Text>
          </View>
          <View style={styles.overlay} pointerEvents="none">
            <Text style={styles.overlayHint} accessibilityLiveRegion="polite">
              {overlayText}
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.manualScroll}
          contentContainerStyle={styles.manualContent}
          keyboardShouldPersistTaps="handled"
        >
          {mode === 'checklist' ? (
            <PrimaryButton
              label={t('list.scanCancel')}
              onPress={requestClose}
              variant="outline"
            />
          ) : null}
          <ManualBarcodeSection
            value={manualBarcode}
            onChange={setManualBarcode}
            onSubmit={onSearchManual}
            busy={lookupBusy}
            showSimulatorHint={showSimulatorHint}
            t={t}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function ManualBarcodeSection({
  value,
  onChange,
  onSubmit,
  busy,
  showSimulatorHint,
  t,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy?: boolean;
  showSimulatorHint?: boolean;
  t: ReturnType<typeof useI18n>['t'];
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <ScreenCard style={styles.manualCard}>
      {showSimulatorHint ? <Text style={styles.simulatorHint}>{t('scan.simulatorHint')}</Text> : null}
      <Text style={styles.manualHint}>{t('scan.manualHint')}</Text>
      <FormField
        label={t('scan.manualEntry')}
        value={value}
        onChangeText={onChange}
        placeholder={t('scan.manualExample')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="default"
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        editable={!busy}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <PrimaryButton
        label={t('scan.searchBarcode')}
        onPress={onSubmit}
        disabled={busy || !value.trim()}
        loading={busy}
      />
    </ScreenCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  errorContent: { flexGrow: 0 },
  errorBlock: { minHeight: 180, marginBottom: spacing.lg },
  resultHeading: { ...typography.label, color: colors.primary, marginBottom: spacing.sm },
  cameraWrap: { flex: 1, minHeight: 200, maxHeight: '55%', backgroundColor: colors.text },
  camera: { flex: 1 },
  frame: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameBox: {
    width: '62%',
    aspectRatio: 1.6,
    maxWidth: 300,
    borderWidth: 2,
    borderColor: colors.textOnPrimary,
    borderRadius: radius.md,
    backgroundColor: 'transparent',
  },
  frameHint: {
    marginTop: spacing.md,
    color: colors.textOnPrimary,
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  overlay: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.overlay,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  overlayHint: {
    color: colors.textOnPrimary,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
  manualScroll: { flexGrow: 0, flexShrink: 0 },
  manualContent: { padding: spacing.screen, paddingTop: spacing.md, gap: spacing.md },
  manualCard: { marginBottom: 0 },
  simulatorHint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.primaryDark,
    backgroundColor: colors.primaryLight,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  manualHint: { ...typography.bodyMuted, marginBottom: spacing.md },
  permissionCard: { marginTop: spacing.lg },
  permissionTitle: { ...typography.heading, marginBottom: spacing.sm },
  permissionBody: typography.bodyMuted,
  resultCard: { alignItems: 'stretch', marginBottom: spacing.md },
  targetCard: { marginBottom: spacing.md },
  targetEntry: { ...typography.body, fontWeight: '700', color: colors.primaryDark },
  pairKicker: { ...typography.label, color: colors.textMuted },
  pairGap: { marginTop: spacing.md },
  quantityNote: { ...typography.caption, marginTop: spacing.sm, color: colors.primaryDark },
  resultName: { ...typography.heading, fontSize: 20, marginTop: spacing.md },
  resultMeta: { ...typography.bodyMuted, marginTop: spacing.xs },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  resultPrice: { fontSize: 22, fontWeight: '700', color: colors.primary },
  priceMuted: { color: colors.textMuted, fontWeight: '600', fontSize: 16 },
  barcodeLine: { fontSize: 13, color: colors.textMuted, marginTop: spacing.sm },
  resultActions: { gap: spacing.md },
});
