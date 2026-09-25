import type { ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { contentMaxWidth, screenHorizontalPadding } from '../lib/layout';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

type Props = {
  children: ReactNode;
  // Wrap content in a ScrollView (default) or a flexed View.
  scroll?: boolean;
  // Pull-to-refresh state; only used when `onRefresh` is provided and `scroll`.
  refreshing?: boolean;
  onRefresh?: () => void;
  // Extra style merged onto the scroll content / flex container.
  contentContainerStyle?: StyleProp<ViewStyle>;
  // Safe-area edges to pad, for screens without a header (e.g. Home).
  edges?: Edge[];
  // Screen background colour (default `colors.background`).
  background?: string;
  // Use calculated per-width horizontal padding instead of the fixed screen padding.
  responsivePadding?: boolean;
  // Lift focused fields and actions above the software keyboard on this screen.
  adjustKeyboardInsets?: boolean;
  testID?: string;
};

export function ScreenContainer({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  contentContainerStyle,
  edges,
  background = colors.background,
  responsivePadding = false,
  adjustKeyboardInsets = false,
  testID,
}: Props) {
  const { width } = useWindowDimensions();
  const horizontal = responsivePadding ? screenHorizontalPadding(width) : spacing.screen;

  const padding: ViewStyle = {
    paddingHorizontal: horizontal,
    paddingVertical: spacing.screen,
  };
  const scrollPad: ViewStyle = {
    paddingHorizontal: horizontal,
    paddingTop: spacing.screen,
    paddingBottom: spacing.xxl * 2,
    flexGrow: 1,
  };

  const inner = (
    <View style={[styles.inner, { maxWidth: contentMaxWidth(width) }]}>{children}</View>
  );

  const body = !scroll ? (
    <View style={[styles.flex, { backgroundColor: background }, padding, contentContainerStyle]} testID={testID}>
      {inner}
    </View>
  ) : (
    <ScrollView
      style={[styles.flex, { backgroundColor: background }]}
      contentContainerStyle={[scrollPad, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={adjustKeyboardInsets}
      showsVerticalScrollIndicator={false}
      testID={testID}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        ) : undefined
      }
    >
      {inner}
    </ScrollView>
  );

  if (edges && edges.length > 0) {
    return (
      <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: background }]}>
        {body}
      </SafeAreaView>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inner: { width: '100%', alignSelf: 'center' },
});
