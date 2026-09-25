import { StyleSheet, View } from 'react-native';
import { AppIcon, type IconName } from './AppIcon';
import { featureColors, type FeatureKey } from '../theme/features';

type Props = {
  name: IconName;
  tone: FeatureKey;
  // Outer square size in px.
  size?: number;
};

// Icon on a rounded, tinted square (decorative).
export function FeatureIcon({ name, tone, size = 52 }: Props) {
  const palette = featureColors[tone];
  return (
    <View
      style={[
        styles.outer,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.32),
          backgroundColor: palette.bg,
          borderColor: `${palette.accent}55`,
        },
      ]}
    >
      <View style={styles.haloA} />
      <View style={styles.haloB} />
      <AppIcon name={name} size={Math.round(size * 0.44)} color={palette.fg} />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  haloA: {
    position: 'absolute',
    width: '68%',
    height: '68%',
    borderRadius: 999,
    right: '-12%',
    top: '-10%',
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  haloB: {
    position: 'absolute',
    width: '34%',
    height: '34%',
    borderRadius: 999,
    left: '-6%',
    bottom: '8%',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
});
