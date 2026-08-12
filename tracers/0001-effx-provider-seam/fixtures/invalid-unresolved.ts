import { Effect } from "effect"

// This fixture is intentionally outside tsconfig.tracers.json. The unresolved
// alias must remain visible to the stock checker, but cannot make strict tracer
// compilation green by accident.
// @ts-expect-error unresolved alias is the assertion target
 type UnresolvedAlias = MissingEffectAlias

declare const unresolved: UnresolvedAlias

/* probe:unresolved-alias */
unresolved

/* probe:unresolved-direct */
Effect.succeed(99)
