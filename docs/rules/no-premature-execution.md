# effect/no-premature-execution

Family: execution-topology · Default severity: error

## Rationale

Libraries may describe Effects but only composition roots may execute them or provide the final platform environment. Layer construction and internal service composition remain admitted.

## Applicability (domains select rules, never severity)

- Roles: pure-library, effect-library, service, application, runtime-adapter
- Required boundary: none

## Limitation

Recognizes namespace and named Effect/ManagedRuntime/platform imports by resolved lexical binding identity; execution reached through re-exports or value aliases escapes analysis. When `no-native-promise-control-flow` is active for the same files, `Effect.runPromise*` is reported by that rule alone.

## Type-aware companion (@effect/tsgo)

@effect/tsgo detects floating Effects, leaking requirements, and strict provision type-aware; it is authoritative for whether requirements are actually closed. This rule is authoritative for the syntactic execution site.
