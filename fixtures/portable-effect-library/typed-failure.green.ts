// role: effect-library, platform: portable (strict) — typed failures flow
// through the Effect error channel.

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class NotPositive extends Schema.TaggedErrorClass<NotPositive>()("NotPositive", {
  value: Schema.Number,
}) {}

export const parsePositive = (value: number) =>
  value > 0 ? Effect.succeed(value) : Effect.fail(new NotPositive({ value }));
