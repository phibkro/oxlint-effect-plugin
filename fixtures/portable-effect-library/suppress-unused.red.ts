// role: effect-library, platform: portable — a valid suppression that
// suppresses nothing is rejected as unused.

import * as Effect from "effect/Effect";

export const quiet = (input: string) =>
  Effect.gen(function* () {
    // expect-next-line: no-ambient-console
    // oxlint-effect-plugin allow(no-ambient-console): dev only: leftover from a removed debug statement
    yield* Effect.log("received", input);
  });
