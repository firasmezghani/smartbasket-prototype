import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getFocusedRouteNameFromRoute, type RouteProp } from '@react-navigation/native';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, type IconName } from '../components/AppIcon';
import { useCart } from '../context/CartContext';
import { useI18n } from '../i18n/I18nContext';
import type {
  InsightsStackParamList,
  HomeStackParamList,
  CartStackParamList,
  CatalogStackParamList,
  MainTabParamList,
} from '../types/navigation';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { HomeScreen } from '../screens/HomeScreen';
import { ScannerScreen } from '../screens/ScannerScreen';
import { CatalogScreen } from '../screens/CatalogScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { CartScreen } from '../screens/CartScreen';
import { BasketQrScreen } from '../screens/BasketQrScreen';
import { InsightsScreen } from '../screens/InsightsScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { MyOrdersScreen } from '../screens/MyOrdersScreen';
import { PurchaseHistoryDetailScreen } from '../screens/PurchaseHistoryDetailScreen';
import { ShoppingListScreen } from '../screens/ShoppingListScreen';
import { ChecklistScanScreen } from '../screens/ChecklistScanScreen';
import { RecipeIdeasScreen } from '../screens/RecipeIdeasScreen';
import { RecipeDetailScreen } from '../screens/RecipeDetailScreen';
import { MyRecipesScreen } from '../screens/MyRecipesScreen';
import { MyRecipeDetailScreen } from '../screens/MyRecipeDetailScreen';
import { MyRecipeEditorScreen } from '../screens/MyRecipeEditorScreen';
import { MyRecipeAddToListScreen } from '../screens/MyRecipeAddToListScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const CatalogStack = createNativeStackNavigator<CatalogStackParamList>();
const CartStack = createNativeStackNavigator<CartStackParamList>();
const InsightsStack = createNativeStackNavigator<InsightsStackParamList>();

// [inactive outline, active filled] Ionicons per tab.
const TAB_ICONS: Record<keyof MainTabParamList, readonly [IconName, IconName]> = {
  Home: ['home-outline', 'home'],
  Catalog: ['grid-outline', 'grid'],
  Scan: ['scan-outline', 'scan'],
  Cart: ['basket-outline', 'basket'],
  Insights: ['person-outline', 'person'],
};

// Back button without a text label.
const minimalBackScreenOptions = {
  headerBackButtonDisplayMode: 'minimal' as const,
  headerBackTitle: '',
};

// Nested auth routes for which the bottom tab bar must be hidden.
const AUTH_ROUTES = new Set(['Login', 'Register']);

function insightsTabBarHidden(route: RouteProp<MainTabParamList, 'Insights'>): boolean {
  const focused = getFocusedRouteNameFromRoute(route) ?? 'InsightsHome';
  return AUTH_ROUTES.has(focused);
}

function homeTabBarHidden(route: RouteProp<MainTabParamList, 'Home'>): boolean {
  const focused = getFocusedRouteNameFromRoute(route) ?? 'HomeMain';
  return focused === 'ChecklistScan';
}

// Compact white header with a green title and back chevron.
const stackScreenOptions = {
  headerStyle: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerShadowVisible: false,
  headerTintColor: colors.primary,
  headerTitleStyle: { fontWeight: '700' as const, fontSize: 18, color: colors.primary },
  // Native-stack keyboard handling can swallow the software keyboard on
  // Fabric / Expo SDK 54. Screens still dismiss on navigation; TextInput owns show.
  keyboardHandlingEnabled: false,
} as const;

function HomeNavigator() {
  const { t } = useI18n();
  return (
    <HomeStack.Navigator
      // Detail screens use the plain back button.
      screenOptions={{ ...stackScreenOptions, ...minimalBackScreenOptions, freezeOnBlur: false }}
    >
      <HomeStack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <HomeStack.Screen
        name="ShoppingList"
        component={ShoppingListScreen}
        options={{ title: t('nav.shoppingList') }}
      />
      <HomeStack.Screen
        name="ChecklistScan"
        component={ChecklistScanScreen}
        options={{ title: t('nav.checklistScan') }}
      />
      <HomeStack.Screen
        name="RecipeIdeas"
        component={RecipeIdeasScreen}
        options={{ title: t('nav.recipeIdeas') }}
      />
      <HomeStack.Screen
        name="RecipeDetail"
        component={RecipeDetailScreen}
        options={{ title: t('nav.recipeDetail') }}
      />
      <HomeStack.Screen
        name="MyRecipes"
        component={MyRecipesScreen}
        options={{ title: t('nav.myRecipes') }}
      />
      <HomeStack.Screen
        name="MyRecipeDetail"
        component={MyRecipeDetailScreen}
        options={{ title: t('nav.myRecipeDetail') }}
      />
      <HomeStack.Screen
        name="MyRecipeEditor"
        component={MyRecipeEditorScreen}
        options={{ title: t('nav.myRecipeEditor'), headerBackButtonMenuEnabled: false }}
      />
      <HomeStack.Screen
        name="MyRecipeAddToList"
        component={MyRecipeAddToListScreen}
        options={{ title: t('nav.myRecipeAddToList') }}
      />
    </HomeStack.Navigator>
  );
}

function CatalogNavigator() {
  const { t } = useI18n();
  return (
    <CatalogStack.Navigator screenOptions={stackScreenOptions}>
      <CatalogStack.Screen
        name="CatalogList"
        component={CatalogScreen}
        options={{ title: t('nav.catalog') }}
      />
      <CatalogStack.Screen
        name="ProductDetail"
        component={ProductDetailScreen}
        options={{ title: t('nav.product') }}
      />
    </CatalogStack.Navigator>
  );
}

function CartNavigator() {
  const { t } = useI18n();
  return (
    <CartStack.Navigator screenOptions={stackScreenOptions}>
      <CartStack.Screen
        name="CartList"
        component={CartScreen}
        options={{ title: t('nav.smartBasket') }}
      />
      <CartStack.Screen
        name="BasketQr"
        component={BasketQrScreen}
        options={{ title: t('nav.basketQr'), ...minimalBackScreenOptions }}
      />
    </CartStack.Navigator>
  );
}

function InsightsNavigator() {
  const { t } = useI18n();
  return (
    <InsightsStack.Navigator screenOptions={stackScreenOptions}>
      <InsightsStack.Screen
        name="InsightsHome"
        component={InsightsScreen}
        options={{ title: t('nav.account') }}
      />
      <InsightsStack.Screen
        name="Login"
        component={LoginScreen}
        options={{ title: t('nav.signIn'), ...minimalBackScreenOptions }}
      />
      <InsightsStack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ title: t('nav.register'), ...minimalBackScreenOptions }}
      />
      <InsightsStack.Screen
        name="MyOrders"
        component={MyOrdersScreen}
        options={{ title: t('nav.purchaseHistory') }}
      />
      <InsightsStack.Screen
        name="PurchaseHistoryDetail"
        component={PurchaseHistoryDetailScreen}
        options={{ title: t('nav.purchaseHistory') }}
      />
    </InsightsStack.Navigator>
  );
}

function TabIcon({ pair, focused }: { pair: readonly [IconName, IconName]; focused: boolean }) {
  const [outline, filled] = pair;
  return (
    <View style={[styles.iconChip, focused && styles.iconChipActive]}>
      <AppIcon
        name={focused ? filled : outline}
        size={22}
        color={focused ? colors.primary : colors.textMuted}
      />
    </View>
  );
}

function tabLabel(focused: boolean, label: string) {
  return (
    <Text
      style={{
        fontSize: 11,
        letterSpacing: 0.2,
        color: focused ? colors.primary : colors.textMuted,
        fontWeight: focused ? '600' : '400',
      }}
      numberOfLines={1}
      allowFontScaling
    >
      {label}
    </Text>
  );
}

export function MainTabs() {
  const { cart } = useCart();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const cartCount = cart.totalQuantity;
  const cartBadge = cartCount > 0 ? (cartCount > 99 ? '99+' : String(cartCount)) : undefined;

  const tablet = width >= 700;
  const barBase = tablet ? 70 : 60;
  const bottomInset = insets.bottom > 0 ? insets.bottom : spacing.sm;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          height: barBase + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 8,
          backgroundColor: colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        tabBarItemStyle: { paddingTop: 2 },
        tabBarBadgeStyle: { backgroundColor: colors.primary, color: colors.textOnPrimary },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeNavigator}
        options={({ route }) => ({
          tabBarIcon: ({ focused }) => <TabIcon pair={TAB_ICONS.Home} focused={focused} />,
          tabBarLabel: ({ focused }) => tabLabel(focused, t('tabs.home')),
          tabBarAccessibilityLabel: t('tabs.home'),
          tabBarStyle: homeTabBarHidden(route) ? { display: 'none' } : undefined,
        })}
      />
      <Tab.Screen
        name="Catalog"
        component={CatalogNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon pair={TAB_ICONS.Catalog} focused={focused} />,
          tabBarLabel: ({ focused }) => tabLabel(focused, t('tabs.catalog')),
          tabBarAccessibilityLabel: t('tabs.catalog'),
        }}
      />
      <Tab.Screen
        name="Scan"
        component={ScannerScreen}
        options={{
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.surface,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
          },
          headerShadowVisible: false,
          headerTintColor: colors.primary,
          headerTitleStyle: { fontWeight: '700', fontSize: 18, color: colors.primary },
          title: t('nav.scanBarcode'),
          tabBarIcon: ({ focused }) => <TabIcon pair={TAB_ICONS.Scan} focused={focused} />,
          tabBarLabel: ({ focused }) => tabLabel(focused, t('tabs.scan')),
          tabBarAccessibilityLabel: t('tabs.scan'),
        }}
      />
      <Tab.Screen
        name="Cart"
        component={CartNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon pair={TAB_ICONS.Cart} focused={focused} />,
          tabBarLabel: ({ focused }) => tabLabel(focused, t('tabs.basket')),
          tabBarBadge: cartBadge,
          tabBarAccessibilityLabel: cartCount > 0 ? `${t('tabs.basket')} (${cartCount})` : t('tabs.basket'),
        }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsNavigator}
        options={({ route }) => ({
          tabBarIcon: ({ focused }) => <TabIcon pair={TAB_ICONS.Insights} focused={focused} />,
          tabBarLabel: ({ focused }) => tabLabel(focused, t('tabs.account')),
          tabBarAccessibilityLabel: t('tabs.account'),
          // Hide the tab bar while Login / Register are open.
          tabBarStyle: insightsTabBarHidden(route) ? { display: 'none' } : undefined,
        })}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconChip: {
    width: 52,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChipActive: { backgroundColor: colors.primaryLight },
});
