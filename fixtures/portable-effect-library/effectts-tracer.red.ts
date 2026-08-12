// role: effect-library, platform: portable — Stage 2 profile and repair oracle.

import { Effect } from "effect";

declare const value: unknown;

export const program = Effect.gen(function* () {
  console.log(value); // expect: no-ambient-console
  return value;
});

export async function legacyFailure(): Promise<never> { // expect: no-native-promise-control-flow
  throw new Error("legacy"); // expect: no-untyped-throw
}
