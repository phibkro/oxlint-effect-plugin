import { Context, Effect } from "effect"

class ServiceA extends Context.Service<ServiceA>()("ServiceA", {
  make: Effect.succeed({ a: 1 })
}) {}

declare const effectWithContext: Effect.Effect<number, never, ServiceA>
declare const effectWithError: Effect.Effect<number, "boom">

export function missingContext(): Effect.Effect<number> {
  // @ts-expect-error provider relation assertion
  return effectWithContext
}

export function missingError(): Effect.Effect<number> {
  // @ts-expect-error provider relation assertion
  return effectWithError
}

export function cleanRelation(): Effect.Effect<number> {
  return Effect.succeed(1)
}
