import { TextStyle } from 'react-native';
import { colors } from './colors';

export const typography = {
  title: { fontSize: 24, fontWeight: '700' as const, color: colors.text },
  // Larger page title used by hero / summary screens.
  titleLg: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 18, fontWeight: '600' as const, color: colors.text },
  // Secondary line under a title.
  subtitle: { fontSize: 16, lineHeight: 22, color: colors.textMuted },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  bodyMuted: { fontSize: 15, lineHeight: 22, color: colors.textMuted },
  caption: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  label: { fontSize: 12, fontWeight: '600' as const, color: colors.textMuted, letterSpacing: 0.3 },
  // Tiny bold all-caps kicker above a title.
  eyebrow: {
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 1.2,
    color: colors.textMuted,
  },
  // Hero / identity display title.
  display: { fontSize: 26, lineHeight: 32, fontWeight: '800' as const, color: colors.text },
  price: { fontSize: 14, fontWeight: '600' as const, color: colors.primary },
  // Button text. Colour is set by the button component per variant.
  button: { fontSize: 16, fontWeight: '600' as const },
} satisfies Record<string, TextStyle>;
