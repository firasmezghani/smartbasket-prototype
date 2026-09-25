import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

export type CatalogStackParamList = {
  CatalogList: undefined;
  ProductDetail: { productId: string };
};

export type HomeStackParamList = {
  HomeMain: undefined;
  ShoppingList: undefined;
  // Checklist-only scanner session. `sessionId` is a fresh serialisable id per visit.
  ChecklistScan: { sessionId: string; targetItemId?: string; expectedProductId?: string };
  RecipeIdeas: undefined;
  RecipeDetail: { recipeId: string };
  MyRecipes: undefined;
  MyRecipeDetail: { recipeId: string };
  MyRecipeEditor: { recipeId?: string } | undefined;
  MyRecipeAddToList: { recipeId: string };
};

export type BasketQrRouteParams = {
  sessionId: number;
  qrValue: string;
  expiresAt: string;
  itemCount: number;
  uniqueProductCount: number;
  status: string;
};

export type CartStackParamList = {
  CartList: undefined;
  BasketQr: BasketQrRouteParams;
};

// Screens the app may return to after sign-in or registration.
export type AuthReturnDestination = 'recipeIdeas' | 'history' | 'shoppingList' | 'myRecipes';

export type InsightsStackParamList = {
  InsightsHome: undefined;
  Login: { returnTo?: AuthReturnDestination } | undefined;
  Register: { returnTo?: AuthReturnDestination } | undefined;
  MyOrders: undefined;
  PurchaseHistoryDetail: { recordId: string };
};

export type MainTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Catalog: NavigatorScreenParams<CatalogStackParamList>;
  Scan: undefined;
  Cart: NavigatorScreenParams<CartStackParamList>;
  Insights: NavigatorScreenParams<InsightsStackParamList>;
};

export type CatalogListProps = CompositeScreenProps<
  NativeStackScreenProps<CatalogStackParamList, 'CatalogList'>,
  BottomTabScreenProps<MainTabParamList>
>;

export type ProductDetailProps = NativeStackScreenProps<CatalogStackParamList, 'ProductDetail'>;

export type CartListProps = CompositeScreenProps<
  NativeStackScreenProps<CartStackParamList, 'CartList'>,
  BottomTabScreenProps<MainTabParamList>
>;

export type BasketQrProps = CompositeScreenProps<
  NativeStackScreenProps<CartStackParamList, 'BasketQr'>,
  BottomTabScreenProps<MainTabParamList>
>;

export type InsightsHomeProps = CompositeScreenProps<
  NativeStackScreenProps<InsightsStackParamList, 'InsightsHome'>,
  BottomTabScreenProps<MainTabParamList>
>;

export type LoginProps = NativeStackScreenProps<InsightsStackParamList, 'Login'>;
export type RegisterProps = NativeStackScreenProps<InsightsStackParamList, 'Register'>;
export type MyOrdersProps = CompositeScreenProps<
  NativeStackScreenProps<InsightsStackParamList, 'MyOrders'>,
  BottomTabScreenProps<MainTabParamList>
>;
export type PurchaseHistoryDetailProps = NativeStackScreenProps<
  InsightsStackParamList,
  'PurchaseHistoryDetail'
>;
export type HomeProps = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'HomeMain'>,
  BottomTabScreenProps<MainTabParamList>
>;
export type ShoppingListProps = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'ShoppingList'>,
  BottomTabScreenProps<MainTabParamList>
>;
export type ChecklistScanProps = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'ChecklistScan'>,
  BottomTabScreenProps<MainTabParamList>
>;
export type RecipeIdeasProps = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'RecipeIdeas'>,
  BottomTabScreenProps<MainTabParamList>
>;
export type RecipeDetailProps = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'RecipeDetail'>,
  BottomTabScreenProps<MainTabParamList>
>;
export type MyRecipesProps = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'MyRecipes'>,
  BottomTabScreenProps<MainTabParamList>
>;
export type MyRecipeDetailProps = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'MyRecipeDetail'>,
  BottomTabScreenProps<MainTabParamList>
>;
export type MyRecipeEditorProps = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'MyRecipeEditor'>,
  BottomTabScreenProps<MainTabParamList>
>;
export type MyRecipeAddToListProps = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'MyRecipeAddToList'>,
  BottomTabScreenProps<MainTabParamList>
>;
