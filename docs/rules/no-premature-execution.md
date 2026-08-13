# effect/no-premature-execution

Code: EFT4101 · Family: execution · Default severity: error

## Invariant

composition-root-execution: Effect execution occurs outside its composition root.

## Why EffectTS rejects it

Libraries describe Effects; only composition roots select final Layers and execute programs.

## Help

Return the Effect and execute it from the designated composition root.

Proof: syntax, scope.

## Applicability

- Strictness: recommended, strict
- Roles: pure-library, effect-library, service, application, runtime-adapter
- Boundaries: none

## Limitations

- Execution reached through re-exports or value aliases escapes syntax analysis.

## Type-aware companion (@effect/tsgo)

Overlaps: floatingEffect, missingEffectContext, missingEffectError, runEffectInsideEffect, strictEffectProvide.

@effect/tsgo owns Effect types and requirement closure; this rule owns the syntactic execution site.

## Local exception

```ts
// oxlint-effect-plugin allow(no-premature-execution):
// reason: <nonempty reason>
<next syntax node>
```

The directive targets exactly one rule and the next syntax node in the same lexical block. Broad, duplicate, missing-reason, misplaced, unused, and stale directives fail the escape audit.
