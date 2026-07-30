// role: composition-root, platform: deno — the Deno root uses the Deno
// namespace directly; no official @effect/platform-deno layer exists in the
// pinned matrix, so the root runs with portable layers.

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const program = Effect.gen(function* () {
  yield* Effect.log("booting on", Deno.build.os);
  return 0;
});

export const code = await Effect.runPromise(Effect.provide(program, Layer.empty));
