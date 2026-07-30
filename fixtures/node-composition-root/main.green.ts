// role: composition-root, platform: node — selects live layers, provides the
// final environment, and runs the program on its declared runtime.

import * as Effect from "effect/Effect";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as path from "node:path";

const program = Effect.gen(function* () {
  yield* Effect.log("booting from", path.sep);
  return 0;
});

NodeRuntime.runMain(Effect.provide(program, NodeServices.layer));
