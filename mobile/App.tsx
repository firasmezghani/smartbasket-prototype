import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppConfigProvider } from './src/context/AppConfigContext';
import { AuthProvider } from './src/context/AuthContext';
import { CartProvider } from './src/context/CartContext';
import { ShoppingListProvider } from './src/context/ShoppingListContext';
import { PersonalRecipesProvider } from './src/context/PersonalRecipesContext';
import { I18nProvider } from './src/i18n/I18nContext';
import { ChecklistNoticeHost } from './src/components/ChecklistNoticeHost';
import { GenericMatchHost } from './src/components/GenericMatchHost';
import { ManualMatchHost } from './src/components/ManualMatchHost';
import { MainTabs } from './src/navigation/MainTabs';

export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
      <AppConfigProvider>
      <AuthProvider>
        <ShoppingListProvider>
        <PersonalRecipesProvider>
        <CartProvider>
          <View style={{ flex: 1 }}>
            <NavigationContainer>
              <MainTabs />
              {/* Dark status-bar text, since all screens have a light background. */}
              <StatusBar style="dark" />
            </NavigationContainer>
            <ChecklistNoticeHost />
            <ManualMatchHost />
            <GenericMatchHost />
          </View>
        </CartProvider>
        </PersonalRecipesProvider>
        </ShoppingListProvider>
      </AuthProvider>
      </AppConfigProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
