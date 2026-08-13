# effect/no-import-from-barrel-package

Code: EFT5102 · Family: architecture · Default severity: off

## Invariant

configured-package-import-topology: A named value or namespace import uses a configured package barrel.

## Why this policy rejects it

For packages explicitly selected by the project, imports must name the owning module subpath instead of entering through the package barrel.

## Help

Import the owning module subpath selected by the package's public exports.

Proof: syntax.

## Applicability

- Strictness: recommended, strict
- Roles: pure-library, effect-library, service, application, composition-root, runtime-adapter, test
- Boundaries: none

This opt-in rule is omitted until `rules` or `severityOverrides` selects a non-`off` severity.

## Default options

```json
{
  "packageNames": []
}
```

Override these values through `groups[].ruleOptions["no-import-from-barrel-package"]`.

## Limitations

- Configured package names are exact strings; the rule does not resolve package exports, relative barrels, re-exports, or subpath validity.
- No automatic fix is offered because a package root export does not prove an equivalent module namespace subpath.

## Local exception

```ts
// oxlint-effect-plugin allow(no-import-from-barrel-package):
// reason: <nonempty reason>
<next syntax node>
```

The directive targets exactly one rule and the next syntax node in the same lexical block. Broad, duplicate, missing-reason, misplaced, unused, and stale directives fail the escape audit.
