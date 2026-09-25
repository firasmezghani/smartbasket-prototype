// Consistent layout spacing
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  screen: 20,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  // Large surfaces: hero card, primary action.
  xl: 22,
  // Composed cards (identity, status, review).
  card: 24,
  // Quick-action tiles.
  tile: 20,
  pill: 20,
} as const;
