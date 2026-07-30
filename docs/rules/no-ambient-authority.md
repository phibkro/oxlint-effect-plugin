# effect/no-ambient-authority

Family: ambient-capability · Default severity: error

## Rationale

Clock, random, cryptographic, network, timer, environment, filesystem, process, and runtime authority belong to declared Effect services so tests and platforms can replace them. Deterministic `new Date(capturedMilliseconds)` is admitted; observations such as `new Date()`/`Date.now()` are not, and wrapping them in a thunk does not surface the hidden authority to the Effect environment.

## Applicability (domains select rules, never severity)

- Roles: pure-library, effect-library, service, application
- Required boundary: none

## Limitation

Syntax/scope detection over known bare or statically global-object-qualified ambient globals plus static import(), import, and re-export module edges; authority reached through aliases, dependency wrappers, or computed dynamic access escapes analysis. Composition roots and runtime adapters are exempt by role.
