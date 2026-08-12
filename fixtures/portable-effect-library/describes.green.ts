// role: effect-library, platform: portable — describes Effects, services,
// schemas, and layers; never executes a runtime or binds a platform.

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Random from "effect/Random";
import * as Schema from "effect/Schema";

export const stamped = Effect.gen(function* () {
  const millis = yield* Clock.currentTimeMillis;
  const noise = yield* Random.next;
  yield* Effect.log("stamped", { millis, noise });
  return new Date(millis);
});

export const describeCount = Effect.fn("describeCount")(function* (count: number) {
  yield* Effect.log("count", { count });
  return `count:${count}`;
});

export const Payload = Schema.Struct({
  id: Schema.String,
  at: Schema.Number,
});

export const layered = Layer.empty;
