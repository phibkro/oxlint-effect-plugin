// role: effect-library, platform: portable — injected clock, random, and
// config capabilities are the admitted alternative to ambient authority.

import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Random from "effect/Random";

export const sample = Effect.gen(function* () {
  const at = yield* Clock.currentTimeMillis;
  const noise = yield* Random.next;
  const region = yield* Config.String("REGION");
  yield* Effect.sleep("1 second");
  return { at: new Date(at), noise, region };
});
