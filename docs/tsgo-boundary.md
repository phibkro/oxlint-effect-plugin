# Type-aware companion boundary (@effect/tsgo)

Oxlint JavaScript plugins receive syntax, scope, code-path, and project APIs — not TypeScript type information. This package therefore never claims type-aware analysis and delegates the following Effect diagnostics to `@effect/tsgo`: floating Effects, leaking requirements, strict provision, unsafe Effect assertions, unknown error values, outdated Effect APIs, promise-returning expressions, and typed `.then`/`.catch`/`.finally` misuse.

Installing or patching TSGO is outside this plugin's runtime.

## Overlaps and authority

| rule | overlap | authority |
| --- | --- | --- |
| `effect-v4/no-premature-execution` | @effect/tsgo detects floating Effects, leaking requirements, and strict provision type-aware; it is authoritative for whether requirements are actually closed. This rule is authoritative for the syntactic execution site. | split as described |
| `effect-v4/no-native-promise-control-flow` | @effect/tsgo is authoritative for promise-returning expressions and typed `.then`/`.catch`/`.finally` misuse; this rule is authoritative for promise syntax and ambient Promise globals. | split as described |
| `effect-v4/no-untyped-throw` | @effect/tsgo tracks unknown error values in Effect types and is authoritative for error-channel typing; this rule is authoritative for the `throw` syntax site. | split as described |

Presets keep one authoritative diagnostic per concern: this plugin owns syntactic execution sites, promise syntax, and ambient globals; TSGO owns everything requiring types. Running both produces complementary, not duplicate, diagnostics.
