// role: service, platform: portable — capability-bearing implementation
// described behind Effect services; no execution, no ambient authority.

import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

export interface Stamper {
  readonly stamp: Effect.Effect<Date>;
}

export const Stamper = Context.Service<Stamper>("fixtures/Stamper");

export const makeStamper: Stamper = {
  stamp: Effect.map(Clock.currentTimeMillis, (millis) => new Date(millis)),
};
