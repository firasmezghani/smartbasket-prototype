// Colour pairs per app feature, used for icons and background decoration (AA contrast).
export type FeatureKey = 'list' | 'catalogue' | 'recipes' | 'history' | 'scan';

export type FeaturePalette = {
  // Icon-stage fill.
  bg: string;
  // Icon-stage glyph / on-tint ink (AA on `bg`).
  fg: string;
  // Decorative gradient start (near-white).
  from: string;
  // Decorative gradient end (tinted).
  to: string;
  // Decorative shape + hairline colour.
  accent: string;
};

export const featureColors: Record<FeatureKey, FeaturePalette> = {
  // Shopping list, warm amber.
  list: { bg: '#fef3c7', fg: '#92400e', from: '#fffdf6', to: '#fdf1d8', accent: '#d9a441' },
  // Catalogue, soft blue.
  catalogue: { bg: '#e0f2fe', fg: '#075985', from: '#fbfeff', to: '#e2f1fb', accent: '#5b96c4' },
  // Recipes, restrained orange.
  recipes: { bg: '#ffedd5', fg: '#9a3412', from: '#fffdf9', to: '#fdeadd', accent: '#dd8a55' },
  // History / account, soft violet.
  history: { bg: '#ede9fe', fg: '#5b21b6', from: '#fdfcff', to: '#ece7fb', accent: '#8b7bd0' },
  // Scanner / basket, primary green.
  scan: { bg: '#e8f5ee', fg: '#094421', from: '#f7fdf9', to: '#e4f3ea', accent: '#4c9469' },
};
