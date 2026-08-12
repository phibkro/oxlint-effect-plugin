// role: effect-library, platform: portable — the escape coordinator rejects
// this canonical local exception as stale because no diagnostic matches it.

import * as Effect from "effect/Effect";

export const quiet = (input: string) =>
  Effect.gen(function* () {
    // oxlint-effect-plugin allow(no-ambient-console):
    // reason: leftover from a removed debug statement
    yield* Effect.log("received", input);
  });
