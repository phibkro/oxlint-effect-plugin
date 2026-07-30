// role: effect-library, platform: portable — ambient console is severe in
// Effect-bearing operational code.

import * as Effect from "effect/Effect";

export const handler = (input: string) =>
  Effect.gen(function* () {
    console.log("received", input); // expect: no-ambient-console
    yield* Effect.log("received", input);
    globalThis.console.warn("fallback"); // expect: no-ambient-console
    return input.length;
  });
