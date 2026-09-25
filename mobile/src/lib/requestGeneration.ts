// A counter so only the latest request updates the screen.
export type RequestGeneration = {
  // Claim a new generation token (also becomes the current one).
  next: () => number;
  // The active generation token.
  current: () => number;
  // True while `token` is still the active generation.
  isCurrent: (token: number) => boolean;
};

export function createRequestGeneration(initial = 0): RequestGeneration {
  let generation = initial;
  return {
    next: () => (generation += 1),
    current: () => generation,
    isCurrent: (token: number) => token === generation,
  };
}
