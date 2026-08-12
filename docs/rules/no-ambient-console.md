# effect/no-ambient-console

Code: EFT2101 · Family: observability · Default severity: error

## Invariant

effect-owned-observability: Ambient console access is outside EffectTS.

## Why EffectTS rejects it

Ambient console output bypasses Effect logging and Console capabilities, including levels, spans, structured output, and redaction.

## Help

Use Effect.log*, effect/Console, or an injected logging service.

Proof: syntax, scope.

## Applicability

- Strictness: recommended, strict
- Roles: pure-library, effect-library, service, application, composition-root, runtime-adapter
- Boundaries: none

## Limitations

- Aliases and computed dynamic access escape syntax analysis.
- The automatic repair is limited to direct console.log statements inside recognized Effect generators.

## Type-aware companion (@effect/tsgo)

Overlaps: globalConsole, globalConsoleInEffect.

This rule owns role-scoped EffectTS console policy and its bounded repair; keep the overlapping @effect/tsgo syntax diagnostics off.

## Replacements

- `console.log` → `yield* Console.log` (machine-applicable)

## Local exception

```ts
// oxlint-effect-plugin allow(no-ambient-console):
// reason: <nonempty reason>
<next syntax node>
```

The directive targets exactly one rule and the next syntax node in the same lexical block. Broad, duplicate, missing-reason, misplaced, unused, and stale directives fail the escape audit.
