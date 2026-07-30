# Type-aware companion boundary (@effect/tsgo)

Oxlint JavaScript plugins receive syntax, lexical scope, code-path, and project APIs — not TypeScript type information. This package's custom rules therefore remain AST/scope rules even when Oxlint runs with `options.typeAware: true`.

## Three non-overlapping analysis layers

1. **This package:** domain-aware custom policy over Oxc AST and resolved lexical bindings.
2. **Oxlint typed engine:** generic built-in typed rules via `options.typeAware: true`, backed by exactly pinned `oxlint-tsgolint@7.0.2001`. This does not inject types into JavaScript plugin rules.
3. **Effect language service:** Effect-specific typed diagnostics via exactly pinned `@effect/tsgo@0.24.3`, including floating Effects, requirements/error-channel diagnostics, strict provision, unsafe assertions, and outdated APIs.

The repository gate observes one real generic Oxlint typed diagnostic and one real `floatingEffect` diagnostic from @effect/tsgo. Both companions are development-only and absent from this package's runtime graph.

```jsonc
// .oxlintrc.json — generic built-in typed Oxlint rules
{ "options": { "typeAware": true } }
```

```jsonc
// tsconfig.json — Effect-specific typed diagnostics
{ "compilerOptions": { "plugins": [{ "name": "@effect/language-service", "diagnosticSeverity": { "floatingEffect": "error", "asyncFunction": "off", "newPromise": "off", "globalConsole": "off", "globalConsoleInEffect": "off" } }] } }
```

## Non-duplicating Effect TSGO configuration

When this plugin owns syntax policy, keep the corresponding @effect/tsgo syntax diagnostics off: `asyncFunction`, `globalConsole`, `globalConsoleInEffect`, `globalDate`, `globalDateInEffect`, `globalFetch`, `globalFetchInEffect`, `globalRandom`, `globalRandomInEffect`, `globalTimers`, `globalTimersInEffect`, `newPromise`, `nodeBuiltinImport`, `preferSchemaOverJson`, `processEnv`, and `processEnvInEffect`. They are off by default in the reviewed release. Keep typed diagnostics such as `floatingEffect`, `missingEffectContext`, `missingEffectError`, `strictEffectProvide`, `unsafeEffectTypeAssertion`, and `lazyPromiseInEffectSync` under @effect/tsgo authority.

The pinned companions expose no domain-aware general diagnostic for arbitrary typed `.then`/`.catch`/`.finally` chains. This package deliberately does not guess from member spelling; that requested policy remains an explicit typed-analysis gap until a companion exposes the required type-and-domain hook.

## Overlaps and authority

| rule | overlap | authority |
| --- | --- | --- |
| `effect/no-premature-execution` | @effect/tsgo detects floating Effects, leaking requirements, and strict provision type-aware; it is authoritative for whether requirements are actually closed. This rule is authoritative for the syntactic execution site. | split as described |
| `effect/no-native-promise-control-flow` | @effect/tsgo is authoritative for Effect-specific typed promise diagnostics such as lazyPromiseInEffectSync; this rule is authoritative for the listed Promise syntax and ambient globals. A general typed chain policy requires a future type-and-domain-aware companion hook. | split as described |
| `effect/no-untyped-throw` | @effect/tsgo tracks unknown error values in Effect types and is authoritative for error-channel typing; this rule is authoritative for the `throw` syntax site. | split as described |

Presets keep one authoritative diagnostic per concern: this plugin owns syntactic execution sites, promise syntax, and ambient globals; TSGO owns everything requiring types. Running both produces complementary, not duplicate, diagnostics.
