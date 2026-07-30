# effect-v4/no-untyped-throw

Family: typed-failure · Default severity: error · strict preset only

## Rationale

In roles whose contract is total or whose failures belong in the Effect error channel, `throw` erases failure typing. This is not a JavaScript-wide ban: composition roots, runtime adapters, and tests keep their untyped-boundary contracts.

## Applicability (domains select rules, never severity)

- Roles: pure-library, effect-library, service, application
- Required boundary: none

## Limitation

Purely syntactic: every `throw` in an enabled role is reported, including rethrow helpers; narrow the file group or use Effect.die for defects instead.

## Type-aware companion (@effect/tsgo)

@effect/tsgo tracks unknown error values in Effect types and is authoritative for error-channel typing; this rule is authoritative for the `throw` syntax site.
