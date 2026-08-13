# Oxlint Effect Plugin agent contract

## Thesis

Oxlint Effect Plugin is a compiled EffectTS enforcement layer for TypeScript.
It combines Oxlint syntax and scope policy with structured diagnostics, safe
repair metadata, module-graph policy, reasoned escapes, and agent guidance.

## Non-negotiable invariants

- Ship compiled ESM JavaScript, declarations, source maps, documentation, and
  provenance; consumers never need a TypeScript runtime loader.
- Treat ignored `dist/` as derived output, never commit evidence. Standard
  producer packing must delete, rebuild, and verify it through `prepack`;
  `--ignore-scripts` is for isolated consumer installation, not production.
- Keep the package independent of Semantic Systems, Workgraph, and Reef.
- Keep architectural role, runtime platform, and semantic boundary as
  orthogonal applicability domains; strictness selects the rule collection.
- Never present syntax analysis as type-aware analysis or formal proof.
- Delegate type-aware Effect diagnostics to `@effect/tsgo` and document
  overlaps.
- Keep portable code free of Node, Bun, Deno, browser, and worker authority.
- Libraries may describe Effects but only composition roots may execute them.
- A local escape must name one exact rule, target one syntax node in the same
  lexical block, and carry a nonempty reason on the canonical second line.
- Automatic fixes are allowed only when locally semantics-preserving.
- Bun is the default development runtime; packed consumers must load under Bun
  and Node, with Deno-oriented compatibility tested through its declared
  surface.
- Do not use Pagu.

## Product boundary

The repository and package are `oxlint-effect-plugin` and
`@phibkro/oxlint-effect-plugin`. The product name, package coordinate, default
`effect/*` rule namespace, and suppression protocol are version-neutral.
Supported Effect majors and exact reviewed releases are machine-readable
compatibility metadata; `effect-v4` is the current reviewed technology target.
The package is third-party and does not imply Effect project endorsement.

Reef may distribute configuration that consumes this package, and Semantic
Systems may consume it, but neither product controls its rule semantics or
source layout.

## Implementation posture

- Freeze and preserve one executable tracer contract before implementation.
- Prefer TypeScript 7, Bun, Effect v4, Oxfmt, and Oxlint.
- Search Oxlint, Effect, `effect-oxlint`, and license-compatible prior art
  before hand-writing infrastructure.
- Build each rule oracle-first with at least one observed red fixture.
- Keep rule policy pure; isolate filesystem, packaging, and runtime adapters.
- Pin the reviewed compatibility matrix exactly during the `0.x` line.

## Validation

```bash
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run accept:0001
bun run accept:effx:0001
git diff --check
```

Until these commands exist and pass, report only the checks actually run.

## Current status

Tracers 0001 through 0003 are implemented and integrated locally. The package
exposes seven AST/scope-aware Effect rules through the strict-by-default
`effect()` builder. Explicit `recommended` lowering, orthogonal role, platform,
and boundary applicability, stable structured diagnostics, import closure,
reasoned escapes, one bounded Console repair, and agent guidance are integrated.

The current working tree passed frozen install, the full repository check, and
packed Bun/Node/Deno acceptance with an 85/85 oracle matrix. Generic typed
diagnostics are verified through `oxlint-tsgolint`; Effect-specific typed
diagnostics remain owned by `@effect/tsgo`. The package has not been published.
The tracked `effx` Stage 0 coordinator tracer now preserves real Effect and stock
TypeScript provider diagnostics, semantic identity and channel probes, standard
LSP command routing, lifecycle and failure evidence, and a local performance
baseline. This is implementation evidence, not a shipped CLI, daemon, or LSP.
Syntax/scope analysis does not claim type proof, arbitrary alias or wrapper
provenance, package purity, or arbitrary typed `.then`/`.catch`/`.finally`
detection.
