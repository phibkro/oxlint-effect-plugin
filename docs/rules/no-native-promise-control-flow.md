# effect/no-native-promise-control-flow

Code: EFT3101 · Family: computation · Default severity: error

## Invariant

effect-owned-asynchronous-computation: Native async control flow is outside EffectTS.

## Why EffectTS rejects it

Native Promise control flow bypasses Effect failure, requirement, interruption, resource, and structured concurrency semantics.

## Help

Use Effect.fn and Effect combinators; lift vendor Promises at a runtime-adapter boundary.

Proof: syntax, scope.

## Applicability

- Strictness: strict
- Roles: effect-library, service, application, runtime-adapter
- Boundaries: none

## Limitations

- Arbitrary typed then, catch, and finally chains remain unenforceable.

## Type-aware companion (@effect/tsgo)

Overlaps: asyncFunction, lazyPromiseInEffectSync, newPromise, promiseInEffectSuccess.

@effect/tsgo owns typed Promise values and contextual Effect semantics; this rule owns role-scoped native Promise syntax, so direct syntax duplicates stay off upstream.

## Local exception

```ts
// oxlint-effect-plugin allow(no-native-promise-control-flow):
// reason: <nonempty reason>
<next syntax node>
```

The directive targets exactly one rule and the next syntax node in the same lexical block. Broad, duplicate, missing-reason, misplaced, unused, and stale directives fail the escape audit.
