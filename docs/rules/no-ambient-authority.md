# effect/no-ambient-authority

Code: EFT2201 · Family: capability · Default severity: error

## Invariant

explicit-operational-authority: Ambient operational authority is outside EffectTS.

## Why EffectTS rejects it

Clock, randomness, environment, network, filesystem, process, and runtime authority belong to declared Effect or project services.

## Help

Inject Clock, Random, Config, a platform service, or a project service.

Proof: syntax, scope.

## Applicability

- Strictness: recommended, strict
- Roles: pure-library, effect-library, service, application
- Boundaries: none

## Limitations

- Aliases, wrappers, and computed dynamic access escape syntax analysis.

## Type-aware companion (@effect/tsgo)

Overlaps: cryptoRandomUUID, cryptoRandomUUIDInEffect, globalDate, globalDateInEffect, globalFetch, globalFetchInEffect, globalRandom, globalRandomInEffect, globalTimers, globalTimersInEffect, nodeBuiltinImport, processEnv, processEnvInEffect.

This rule owns role-scoped ambient-authority policy; keep overlapping @effect/tsgo syntax diagnostics off while typed Effect facts remain upstream-owned.

## Local exception

```ts
// oxlint-effect-plugin allow(no-ambient-authority):
// reason: <nonempty reason>
<next syntax node>
```

The directive targets exactly one rule and the next syntax node in the same lexical block. Broad, duplicate, missing-reason, misplaced, unused, and stale directives fail the escape audit.
