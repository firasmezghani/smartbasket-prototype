import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

type Props = {
  // Gradient start, usually a near-white tint.
  from: string;
  // Gradient end, the tinted corner.
  to: string;
  // Decorative shape colour (drawn at low opacity).
  accent: string;
  // Optional second decorative colour.
  secondary?: string;
};

// Decorative background (gradient and faint circles) for cards.
export function DecorBackdrop({ from, to, accent, secondary = accent }: Props) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 200 160" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="decorSurface" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} stopOpacity={1} />
            <Stop offset="0.55" stopColor={from} stopOpacity={1} />
            <Stop offset="1" stopColor={to} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={200} height={160} fill="url(#decorSurface)" />
        <Circle cx={182} cy={18} r={54} fill={accent} opacity={0.08} />
        <Circle cx={14} cy={150} r={44} fill={secondary} opacity={0.05} />
        <Path
          d="M-20 118 C40 82 84 96 122 68 C150 48 168 33 214 25 L214 60 C168 70 150 84 122 100 C78 124 34 106 -20 146 Z"
          fill={accent}
          opacity={0.035}
        />
      </Svg>
    </View>
  );
}
