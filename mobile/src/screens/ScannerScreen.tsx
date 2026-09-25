import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { BarcodeScannerFlow } from './BarcodeScannerFlow';
import type { MainTabParamList } from '../types/navigation';

// Scan tab, browse/add/scan-another. Never a checklist return destination.
export function ScannerScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  return (
    <BarcodeScannerFlow
      mode="browse"
      sessionId="browse"
      onViewProduct={(productId) =>
        navigation.navigate('Catalog', {
          screen: 'ProductDetail',
          params: { productId },
        })
      }
      onInspectBasket={() => navigation.navigate('Cart', { screen: 'CartList' })}
    />
  );
}
