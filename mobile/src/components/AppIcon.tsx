import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  // Set only when the icon has meaning on its own; otherwise it is hidden from screen readers.
  accessibilityLabel?: string;
};

// Typed, single-source wrapper around the Expo Ionicons set.
export function AppIcon({ name, size = 22, color = colors.text, accessibilityLabel }: Props) {
  const decorative = accessibilityLabel == null;
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      accessible={!decorative}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
    />
  );
}
