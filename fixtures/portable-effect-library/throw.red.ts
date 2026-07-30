// role: effect-library, platform: portable (strict) — failures belong in the
// Effect error channel, not in untyped throws.

export const parsePositive = (value: number): number => {
  if (value <= 0) {
    throw new RangeError("value must be positive"); // expect: no-untyped-throw
  }
  return value;
};
