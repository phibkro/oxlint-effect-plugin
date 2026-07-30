// role: application, platform: portable — composes services and layers while
// leaving final requirements open.

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export const telemetry = Layer.empty;

export const persistence = Layer.empty;

export const infrastructure = Layer.mergeAll(telemetry, persistence);

export const program = Effect.gen(function* () {
  yield* Effect.log("orchestrating");
  return "described, not executed";
});
