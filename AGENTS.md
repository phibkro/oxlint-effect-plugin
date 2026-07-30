# Oxlint Effect v4 agent contract

## Thesis

Oxlint Effect v4 is a reusable, compiled Oxlint JavaScript plugin for explicit
Effect v4 architecture, capability, runtime, and boundary policies. It detects
high-confidence syntax and scope violations without claiming type-aware proof.

## Non-negotiable invariants

- Ship compiled ESM JavaScript, declarations, source maps, documentation, and
  provenance; consumers never need a TypeScript runtime loader.
- Keep the package independent of Semantic Systems, Workgraph, and Reef.
- Keep technology, architectural role, runtime platform, and semantic boundary
  as orthogonal domains.
- Never present syntax analysis as type-aware analysis or formal proof.
- Delegate type-aware Effect diagnostics to `@effect/tsgo` and document
  overlaps.
- Keep portable code free of Node, Bun, Deno, browser, and worker authority.
- Libraries may describe Effects but only composition roots may execute them.
- Ambient console use is severe in Effect-bearing operational code. A targeted
  suppression must contain a `dev only:` reason.
- Automatic fixes are allowed only when locally semantics-preserving.
- Bun is the default development runtime; packed consumers must load under Bun
  and Node, with Deno-oriented compatibility tested through its declared
  surface.
- Do not use Pagu.

## Product boundary

The repository and package are `oxlint-effect-v4` and
`@phibkro/oxlint-effect-v4`. The package is third-party and does not imply
Effect project endorsement.

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
git diff --check
```

Until these commands exist and pass, report only the checks actually run.

## Current status

Tracer 0001 is implemented and integrated locally. The compiled package exposes
seven AST/scope-aware Effect v4 policy rules, orthogonal domain presets,
targeted suppression auditing, generated compatibility metadata, and packed
Bun/Node consumers with a bounded Deno journey. Generic typed diagnostics are
verified through `oxlint-tsgolint`; Effect-specific typed diagnostics remain
owned by `@effect/tsgo`.

The independently accepted implementation head is `f552dbc`. Its frozen
install, full check, and two acceptance runs passed with an 84/84 oracle matrix
and byte-identical evidence under reviewed Bun 1.3.13, Node 24.18.0, and Deno
2.9.2. The package has not been published. Syntax/scope analysis does not claim
type proof, alias tracking, wrapper provenance, or arbitrary typed
`.then`/`.catch`/`.finally` detection.
