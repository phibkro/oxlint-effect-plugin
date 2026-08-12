# effect/no-cross-runtime

Code: EFT2301 · Family: platform · Default severity: error

## Invariant

declared-runtime-authority: Runtime authority crosses the declared platform.

## Why EffectTS rejects it

A platform domain admits only its own built-ins, globals, and official platform layers.

## Help

Move the authority to a matching runtime adapter or select the correct platform domain.

Proof: syntax, scope.

## Applicability

- Strictness: recommended, strict
- Roles: pure-library, effect-library, service, application, composition-root, runtime-adapter, test
- Boundaries: none

## Limitations

- Computed imports and runtime feature detection escape syntax analysis.

## Type-aware companion (@effect/tsgo)

Overlaps: nodeBuiltinImport.

This rule owns declared-platform compatibility; @effect/tsgo's Node import diagnostic has no project platform context and stays off.

## Local exception

```ts
// oxlint-effect-plugin allow(no-cross-runtime):
// reason: <nonempty reason>
<next syntax node>
```

The directive targets exactly one rule and the next syntax node in the same lexical block. Broad, duplicate, missing-reason, misplaced, unused, and stale directives fail the escape audit.
