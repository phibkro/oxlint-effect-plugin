# effect/no-raw-json-parse

Code: EFT1201 · Family: boundary · Default severity: error

## Invariant

schema-owned-external-decoding: Raw external JSON decoding bypasses Schema.

## Why EffectTS rejects it

External JSON must cross an explicit Effect Schema decoding seam instead of becoming unvalidated data through JSON.parse.

## Help

Decode with Schema.decodeUnknownEffect at the external-data boundary.

Proof: syntax, scope.

## Applicability

- Strictness: recommended, strict
- Roles: pure-library, effect-library, service, application, composition-root, runtime-adapter
- Boundaries: external-data

## Limitations

- Aliases, wrappers, other syntaxes, and post-parse value flow escape analysis.

## Type-aware companion (@effect/tsgo)

Overlaps: preferSchemaOverJson.

This rule owns external-data boundary policy for JSON.parse; keep the broader @effect/tsgo syntax suggestion off when this profile rule applies.

## Local exception

```ts
// oxlint-effect-plugin allow(no-raw-json-parse):
// reason: <nonempty reason>
<next syntax node>
```

The directive targets exactly one rule and the next syntax node in the same lexical block. Broad, duplicate, missing-reason, misplaced, unused, and stale directives fail the escape audit.
