// role: composition-root, platform: bun — the Bun root uses Bun's declared
// surface and official Bun platform layers.

import * as Effect from "effect/Effect";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";

const program = Effect.gen(function* () {
  yield* Effect.log("booting", Bun.version);
  return 0;
});

BunRuntime.runMain(Effect.provide(program, BunServices.layer));
