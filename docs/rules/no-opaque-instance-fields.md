# effect/no-opaque-instance-fields

Code: EFT1101 · Family: modeling · Default severity: error

## Invariant

schema-opaque-runtime-shape: A Schema.Opaque declaration defines instance behavior absent from decoded values.

## Why EffectTS rejects it

Schema.Opaque changes nominal typing without constructing class instances; decoded values retain the wrapped schema's runtime representation.

## Help

Remove instance members; use pure functions or an explicit schema transformation for constructed runtime behavior.

Proof: syntax, scope.

## Applicability

- Strictness: recommended, strict
- Roles: pure-library, effect-library, service, application, composition-root, runtime-adapter, test
- Boundaries: none

## Limitations

- Re-exported Schema bindings, wrapper functions, and inherited instance members escape this syntax analysis.

## Local exception

```ts
// oxlint-effect-plugin allow(no-opaque-instance-fields):
// reason: <nonempty reason>
<next syntax node>
```

The directive targets exactly one rule and the next syntax node in the same lexical block. Broad, duplicate, missing-reason, misplaced, unused, and stale directives fail the escape audit.
