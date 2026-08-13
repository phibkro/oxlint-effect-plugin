# effect/no-untyped-throw

Code: EFT3201 · Family: failure · Default severity: error

## Invariant

typed-expected-failure: Throw-based expected failure is outside EffectTS.

## Why EffectTS rejects it

Throw erases expected application failure from the Effect error channel and caller contract.

## Help

Define a Schema.TaggedError and fail through the Effect error channel.

Proof: syntax.

## Applicability

- Strictness: strict
- Roles: pure-library, effect-library, service, application
- Boundaries: none

## Limitations

- The syntax rule cannot distinguish expected failure from a defect or rethrow.

## Type-aware companion (@effect/tsgo)

Overlaps: missingEffectError.

@effect/tsgo owns typed error-channel facts; this rule owns the role-scoped throw syntax site.

## Local exception

```ts
// oxlint-effect-plugin allow(no-untyped-throw):
// reason: <nonempty reason>
<next syntax node>
```

The directive targets exactly one rule and the next syntax node in the same lexical block. Broad, duplicate, missing-reason, misplaced, unused, and stale directives fail the escape audit.
