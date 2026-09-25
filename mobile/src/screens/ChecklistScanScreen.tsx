import { useEffect, useRef } from 'react';
import { BarcodeScannerFlow } from './BarcodeScannerFlow';
import { useAuth } from '../context/AuthContext';
import { useShoppingList } from '../context/ShoppingListContext';
import type { ChecklistScanProps } from '../types/navigation';

export function ChecklistScanScreen({ navigation, route }: ChecklistScanProps) {
  const { signedIn } = useShoppingList();
  const { customer, accountGeneration } = useAuth();
  const openedAccountId = useRef(customer?.id ?? null);
  const openedGeneration = useRef(accountGeneration);

  useEffect(() => {
    const currentId = customer?.id ?? null;
    if (!signedIn || currentId !== openedAccountId.current || accountGeneration !== openedGeneration.current) {
      navigation.goBack();
    }
  }, [signedIn, customer?.id, accountGeneration, navigation]);

  return (
    <BarcodeScannerFlow
      mode="checklist"
      sessionId={route.params.sessionId}
      targetItemId={route.params.targetItemId}
      expectedProductId={route.params.expectedProductId}
      onClose={() => navigation.goBack()}
      onInspectBasket={() => navigation.getParent()?.navigate('Cart', { screen: 'CartList' })}
    />
  );
}
