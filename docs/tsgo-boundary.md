# Type-aware companion boundary (@effect/tsgo)

Oxlint JavaScript plugins receive syntax, lexical scope, code-path, and project APIs — not TypeScript type information. This package's custom rules therefore remain AST/scope rules even when Oxlint runs with `options.typeAware: true`.

## Three coordinated analysis layers

1. **This package:** domain-aware custom policy over Oxc AST and resolved lexical bindings.
2. **Oxlint typed engine:** generic built-in typed rules via `options.typeAware: true`, backed by exactly pinned `oxlint-tsgolint@7.0.2001`. This does not inject types into JavaScript plugin rules.
3. **Effect language service:** Effect-specific typed diagnostics via exactly pinned `@effect/tsgo@0.36.4`, including floating Effects, requirements/error-channel diagnostics, strict provision, unsafe assertions, and outdated APIs.

The repository gate observes one real generic Oxlint typed diagnostic and one real `floatingEffect` diagnostic from @effect/tsgo. Both companions are development-only and absent from this package's runtime graph. The reviewed TSGO release also exports `@effect/tsgo/oxlint-presets`; this package does not import those presets into its runtime or enable overlapping rules twice.

```jsonc
// .oxlintrc.json — generic built-in typed Oxlint rules
{ "options": { "typeAware": true } }
```

```jsonc
// tsconfig.json — Effect-specific typed diagnostics
{ "compilerOptions": { "plugins": [{ "name": "@effect/language-service", "diagnosticSeverity": { "floatingEffect": "error", "missingEffectContext": "error", "missingEffectError": "error", "missingLayerContext": "error", "strictEffectProvide": "error", "unsafeEffectTypeAssertion": "error", "lazyPromiseInEffectSync": "error", "asyncFunction": "off", "newPromise": "off", "globalConsole": "off", "globalConsoleInEffect": "off" } }] } }
```

## Non-duplicating Effect TSGO configuration

EffectTS requires these typed diagnostics at `error`: `floatingEffect`, `missingEffectContext`, `missingEffectError`, `missingLayerContext`, `strictEffectProvide`, `unsafeEffectTypeAssertion`, and `lazyPromiseInEffectSync`. When this package owns the corresponding project-context syntax policy, keep these @effect/tsgo diagnostics off to avoid duplicate reports: `asyncFunction`, `cryptoRandomUUID`, `cryptoRandomUUIDInEffect`, `globalConsole`, `globalConsoleInEffect`, `globalDate`, `globalDateInEffect`, `globalFetch`, `globalFetchInEffect`, `globalRandom`, `globalRandomInEffect`, `globalTimers`, `globalTimersInEffect`, `newPromise`, `nodeBuiltinImport`, `preferSchemaOverJson`, `processEnv`, and `processEnvInEffect`. The reviewed TSGO release remains authoritative for typed Effect facts.

The pinned companions expose no domain-aware general diagnostic for arbitrary typed `.then`/`.catch`/`.finally` chains. This package deliberately does not guess from member spelling; that requested policy remains an explicit typed-analysis gap until a companion exposes the required type-and-domain hook.

## Overlaps and authority

| rule | overlap | authority |
| --- | --- | --- |
| `effect/no-ambient-console` | globalConsole, globalConsoleInEffect | This rule owns role-scoped EffectTS console policy and its bounded repair; keep the overlapping @effect/tsgo syntax diagnostics off. |
| `effect/no-ambient-authority` | cryptoRandomUUID, cryptoRandomUUIDInEffect, globalDate, globalDateInEffect, globalFetch, globalFetchInEffect, globalRandom, globalRandomInEffect, globalTimers, globalTimersInEffect, nodeBuiltinImport, processEnv, processEnvInEffect | This rule owns role-scoped ambient-authority policy; keep overlapping @effect/tsgo syntax diagnostics off while typed Effect facts remain upstream-owned. |
| `effect/no-cross-runtime` | nodeBuiltinImport | This rule owns declared-platform compatibility; @effect/tsgo's Node import diagnostic has no project platform context and stays off. |
| `effect/no-premature-execution` | floatingEffect, missingEffectContext, missingEffectError, runEffectInsideEffect, strictEffectProvide | @effect/tsgo owns Effect types and requirement closure; this rule owns the syntactic execution site. |
| `effect/no-native-promise-control-flow` | asyncFunction, lazyPromiseInEffectSync, newPromise, promiseInEffectSuccess | @effect/tsgo owns typed Promise values and contextual Effect semantics; this rule owns role-scoped native Promise syntax, so direct syntax duplicates stay off upstream. |
| `effect/no-raw-json-parse` | preferSchemaOverJson | This rule owns external-data boundary policy for JSON.parse; keep the broader @effect/tsgo syntax suggestion off when this profile rule applies. |
| `effect/no-untyped-throw` | missingEffectError | @effect/tsgo owns typed error-channel facts; this rule owns the role-scoped throw syntax site. |

The rule registry records every known overlap. The documented configuration keeps duplicate syntax diagnostics off while retaining @effect/tsgo diagnostics that require types. Project-context policy remains here; typed Effect facts and editor semantics remain upstream-owned.
