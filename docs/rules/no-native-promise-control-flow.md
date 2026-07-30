# effect-v4/no-native-promise-control-flow

Family: execution-topology · Default severity: error · strict preset only

## Rationale

Native Promise control flow (async/await, new Promise, Promise combinators, resolve/reject) bypasses Effect's structured concurrency, typed failures, and interruption. Runtime adapters may use native Promise mechanics only inside Effect.tryPromise, Effect.promise for genuinely non-rejecting promises, or Effect.async with cancellation mapped where available; composition roots perform final Effect.runPromise; tests may execute explicitly.

## Applicability (domains select rules, never severity)

- Roles: effect-library, service, application, runtime-adapter
- Required boundary: none

## Limitation

Owns obvious syntax/scope cases only: async/await syntax, ambient `new Promise`, ambient `Promise` static control-flow members, and `Effect.runPromise*` variants. Promise type references and declared external Promise signatures are never diagnosed. Type-aware detection of promise-returning expressions and `.then`/`.catch`/`.finally` belongs to @effect/tsgo and is not claimed here.

## Type-aware companion (@effect/tsgo)

@effect/tsgo is authoritative for promise-returning expressions and typed `.then`/`.catch`/`.finally` misuse; this rule is authoritative for promise syntax and ambient Promise globals.

