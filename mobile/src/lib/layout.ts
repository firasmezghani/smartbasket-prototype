// Content width limits, so text stays readable on tablets.

// Below this width the layout is treated as a narrow phone.
export const NARROW_PHONE_WIDTH = 360;

// Maximum content width for a screen width.
export function contentMaxWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return 480;
  }
  if (viewportWidth >= 900) {
    return 720;
  }
  if (viewportWidth >= 600) {
    return 560;
  }
  return viewportWidth;
}

// Whether the viewport is a narrow phone (tighter spacing may be warranted).
export function isNarrowPhone(viewportWidth: number): boolean {
  return (
    Number.isFinite(viewportWidth) &&
    viewportWidth > 0 &&
    viewportWidth < NARROW_PHONE_WIDTH
  );
}

export function screenHorizontalPadding(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 16;
  if (viewportWidth < 340) return 14;
  if (viewportWidth < 600) return 18;
  if (viewportWidth < 900) return 26;
  return 32;
}
