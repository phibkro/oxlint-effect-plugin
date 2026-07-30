# effect/no-native-promise-control-flow

Family: execution-topology · Default severity: error · strict preset only

## Rationale

Native Promise control flow (async/await, new Promise, Promise combinators, resolve/reject) bypasses Effect's structured concurrency, typed failures, and interruption. Runtime adapters may use native Promise mechanics only inside Effect.tryPromise, Effect.promise for genuinely non-rejecting promises, or Effect.async with cancellation mapped where available; composition roots perform final Effect.runPromise; tests may execute explicitly.

## Applicability (domains select rules, never severity)

- Roles: effect-library, service, application, runtime-adapter
- Required boundary: none

## Limitation

Owns high-confidence AST/scope cases only: async/await and top-level for-await syntax, ambient/globalThis Promise construction and static control flow, direct immutable Promise aliases, and imported Effect.runPromise* variants. Promise type references and declared external Promise signatures are never diagnosed. The reviewed typed companions currently expose no domain-aware general `.then`/`.catch`/`.finally` policy, so arbitrary typed chains remain an explicit gap.

## Type-aware companion (@effect/tsgo)

@effect/tsgo is authoritative for Effect-specific typed promise diagnostics such as lazyPromiseInEffectSync; this rule is authoritative for the listed Promise syntax and ambient globals. A general typed chain policy requires a future type-and-domain-aware companion hook.
