// role: service, platform: node — configuration and clock come from the
// Effect environment.

import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

export const snapshot = Effect.gen(function* () {
  const region = yield* Config.string("REGION");
  const at = yield* Clock.currentTimeMillis;
  return { region, at: new Date(at) };
});
