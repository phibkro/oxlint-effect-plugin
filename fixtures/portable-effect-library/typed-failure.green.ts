// role: effect-library, platform: portable (strict) — typed failures flow
// through the Effect error channel.

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

export class NotPositive extends Data.TaggedError("NotPositive")<{
  readonly value: number;
}> {}

export const parsePositive = (value: number) =>
  value > 0 ? Effect.succeed(value) : Effect.fail(new NotPositive({ value }));
