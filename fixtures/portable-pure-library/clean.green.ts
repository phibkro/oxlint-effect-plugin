// role: pure-library, platform: portable — deterministic values and functions.

export const add = (left: number, right: number): number => left + right;

/** Deterministic constructor over a captured value is admitted. */
export const toDate = (capturedMilliseconds: number): Date => new Date(capturedMilliseconds);

export const formatIso = (capturedMilliseconds: number): string =>
  toDate(capturedMilliseconds).toISOString();
