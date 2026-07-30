# Provenance and prior art

`@phibkro/oxlint-effect-plugin` was extracted as an independent product from the
Semantic Systems design frontier at source commit
`4d1f6947c0c5b8ba802f4e2ddf6ff8325e053ddd` (design spec 0011 there; design
spec 0001 here). Semantic Systems is a consumer, not package authority, and
no distributed file carries Semantic Systems, Workgraph, or Reef path
knowledge.

The prior candidate package names `@phibkro/oxlint-effect-v4` and
`oxlint-effect-v4` were verified unclaimed on the npm registry on 2026-07-30.
The product was subsequently renamed to the version-neutral
`@phibkro/oxlint-effect-plugin`; no availability or publication claim is made
for the new coordinate.

## Evaluated prior art

| prior art | version / ref | license | decision |
| --- | --- | --- | --- |
| Oxlint JS plugin API (`jsPlugins`, ESLint-v9-compatible rules) | oxlint 1.76.0; oxc.rs "JS Plugins" + "Writing JS Plugins" docs | MIT | **Reused as the plugin surface.** Rules use public Oxc AST traversal plus `SourceCode.getDeclaredVariables`/scope `Variable.references` identity. The faster `createOnce` variant (`@oxlint/plugins` 1.76.0) was evaluated and deferred: it adds a runtime dependency for a performance benefit oxlint has not yet enabled; revisit when the optimization lands. |
| Oxlint generic typed engine | `oxlint-tsgolint` 7.0.2001 through Oxlint 1.76.0 `options.typeAware` | MIT | **Pinned and observed in a bounded dev-only probe.** It supplies generic built-in typed rules; Oxlint's documented boundary confirms it does not add type information to custom JavaScript rules. |
| `effect-oxlint` | 0.3.3 (github.com/mpsuesser/effect-oxlint) | MIT | **Evaluated, rejected as a dependency.** It is an Effect-idiom rule-*authoring* framework (Rule.define/Visitor/AST combinators), not a rule set: alpha wrapping the alpha plugin API, pinning `effect@4.0.0-beta.100` (behind the reviewed beta.102) and making Effect a lint-time runtime dependency for every consumer. Its ban-member/ban-import matcher concepts informed detection shapes; no code was copied and its rule semantics did not define ours. |
| Effect v4 beta | effect 4.0.0-beta.102; `@effect/platform-node`/`-bun` 4.0.0-beta.102 | MIT | **Reused as the reviewed technology target (dev-only).** All API names referenced in diagnostics and fixtures (Effect.run*, Effect.log*, Clock.currentTimeMillis, Random.next, Config.String, Schema.decodeUnknownEffect, Data.TaggedError, Context.Service, Layer.*, NodeServices/NodeRuntime, BunServices/BunRuntime) were corroborated against the installed pinned release, not memory. |
| `@effect/tsgo` | 0.24.3 | MIT | **Pinned dev-only and observed with a real `floatingEffect` diagnostic.** Overlap and authority split are recorded in `docs/tsgo-boundary.md`. Bun 1.3.13 extracts its optional Linux binary as mode 0644, so the repository probe repairs only that cache-local executable bit before invocation; nothing distributed is mutated. |
| Biome linter domains | Biome documentation | MIT/Apache-2.0 | **Configuration prior art only.** The idea that named domains gate rule applicability informed the domain expansion; no implementation copied. This package adds no Biome plugin. |
| `joelhooks/effectts-skills` | GitHub repository | (advisory) | **Advisory only.** Treated as opinion; every Effect claim used here was independently corroborated against the pinned Effect release. |
| Semantic Systems repository-local rules | six independently tested rules at source commit above | (internal) | **Semantics generalized, code not vendored.** The tracer re-implements the families against the frozen spec 0001 with repository path policy removed; fixtures were written fresh for the orthogonal domain model. |

The qualified-global correction reuses this repository's existing
`collectAmbientReferences`, `staticPropertyName`, and Oxc parent/scope data in
one shared classifier; no parser, text matcher, or new runtime dependency was
introduced. Compatibility mutation resistance likewise centralizes the frozen
review table for generation, package/lock validation, runtime probes, and
packed-artifact checks instead of maintaining independent assertions.

## Tooling note

One-off disposable scratch probes during research used ad-hoc tooling
outside the repository. The repository's own automation, gates, and
implementation are Bun/TypeScript only; no Python source, dependencies, or
generated artifacts are part of this project.

## Reviewed compatibility matrix

The machine-readable, gate-checked matrix lives in
[`compatibility.json`](./compatibility.json) (regenerated and verified by
`bun run gen` / `bun run check`). All pins are exact while the Effect v4 and
Oxlint JS-plugin surfaces remain pre-stable.
