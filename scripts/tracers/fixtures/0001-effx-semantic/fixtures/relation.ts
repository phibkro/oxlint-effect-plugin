import { Effect, Context } from "effect";

class ServiceA extends Context.Service<ServiceA>()("ServiceA", {
  make: Effect.succeed({ a: 1 }),
}) {}

declare const effectWithServices: Effect.Effect<number, never, ServiceA>;

export function relation(): Effect.Effect<number> {
  return effectWithServices;
}
