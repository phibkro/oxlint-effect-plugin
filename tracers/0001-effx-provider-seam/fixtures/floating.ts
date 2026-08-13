import { Effect } from "effect"

/* probe:floating-discarded */
Effect.succeed(1)

/* probe:composed-effect */
const composedEffect = Effect.succeed(1).pipe(Effect.map((value) => value + 1))

/* probe:non-effect */
const ordinaryValue = 42

export { composedEffect, ordinaryValue }
