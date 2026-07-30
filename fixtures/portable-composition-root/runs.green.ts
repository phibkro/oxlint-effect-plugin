// role: composition-root, platform: portable — the root may provide the final
// environment and run the program (here with portable layers only).

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const program = Effect.gen(function* () {
  yield* Effect.log("booting");
  return 0;
});

export const exitCode = await Effect.runPromise(Effect.provide(program, Layer.empty));
