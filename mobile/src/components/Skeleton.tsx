import {
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';

type Props = {
  width?: DimensionValue;
  height?: DimensionValue;
  // Border radius; defaults to `radius.sm`.
  round?: number;
  style?: StyleProp<ViewStyle>;
};

// A static placeholder block for loading layouts (no shimmer animation).
export function Skeleton({ width = '100%', height = 14, round = radius.sm, style }: Props) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { width, height, borderRadius: round }, style]}
    />
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
});
