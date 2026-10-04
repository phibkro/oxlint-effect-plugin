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

The [generated rule catalog](README.md#rules) defines the available rules and
their applicability. Regenerate it through `bun run gen`; do not maintain a
second rule count here. The `effect()` builder is strict by default, with
explicit `recommended` lowering.

Consult [current adoption status](docs/current-status.md) for the bounded
`effx` CLI journey and its limits, and [package.json](package.json) for the
exported entry points. Effect-specific typed diagnostics remain owned by
`@effect/tsgo`. Acceptance records under `docs/acceptance/` describe the runs
they record; they do not establish that the current checkout passes. Run the
applicable validation commands above and report the source revision and checks
actually observed.
Syntax/scope analysis does not claim type proof, arbitrary alias or wrapper
provenance, package purity, or arbitrary typed `.then`/`.catch`/`.finally`
detection.
