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
| Oxlint JS plugin API (`jsPlugins`, ESLint-v9-compatible rules) | oxlint 1.77.0; oxc.rs "JS Plugins" + "Writing JS Plugins" docs | MIT | **Reused as the plugin surface.** Rules use public Oxc AST traversal plus `SourceCode.getDeclaredVariables`/scope `Variable.references` identity. The faster `createOnce` variant (`@oxlint/plugins` 1.76.0) was evaluated and deferred: it adds a runtime dependency for a performance benefit oxlint has not yet enabled; revisit when the optimization lands. |
| Oxlint generic typed engine | `oxlint-tsgolint` 7.0.2001 through Oxlint 1.77.0 `options.typeAware` | MIT | **Pinned and observed in a bounded dev-only probe.** It supplies generic built-in typed rules; Oxlint's documented boundary confirms it does not add type information to custom JavaScript rules. |
| `effect-oxlint` | 0.3.3 (github.com/mpsuesser/effect-oxlint) | MIT | **Evaluated, rejected as a dependency.** It is an Effect-idiom rule-*authoring* framework (Rule.define/Visitor/AST combinators), not a rule set: alpha wrapping the alpha plugin API, pinning `effect@4.0.0-beta.100` (behind the reviewed beta.107) and making Effect a lint-time runtime dependency for every consumer. Its ban-member/ban-import matcher concepts informed detection shapes; no code was copied and its rule semantics did not define ours. |
| `@effect/eslint-plugin` | main `44bba8afb40ad3f36be7acc35d70afe067e424f9` (package 0.3.2) | MIT, Copyright 2022 Effect | **Audited completely.** Its `dprint` rule is delegated to this repository's Oxfmt workflow because formatting is not EffectTS semantics. Its exact-package `no-import-from-barrel-package` interface informed the opt-in `EFT5102` policy. The implementation here was written fresh, adds project domains and structured diagnostics, and deliberately omits the upstream fix because a named export does not prove an equivalent namespace subpath. Historical deleted rules were not resurrected. |
| Effect repository `@effect/oxc` rules | Effect source `2e1ddbebd9dd5cf0738ea08b2e832a7c39ae990f` | MIT, Copyright 2023 Effectful Technologies Inc. | **Audited completely; one semantic rule adopted.** `no-opaque-instance-fields` protects the documented `Schema.Opaque` runtime contract and informed fresh `EFT1101` syntax/scope logic. The package-barrel successor confirmed diagnostics-only treatment for `EFT5102`. BigInt literals, TypeScript import extensions, and monorepo `@internal` reachability remain repository/build policy and were not added to the EffectTS default profile. No source code was copied. |
| Effect v4 beta | effect 4.0.0-beta.107; `@effect/platform-node`/`-bun` 4.0.0-beta.107 | MIT | **Reused as the reviewed technology target (dev-only).** All API names referenced in diagnostics and fixtures (Effect.run*, Effect.fn, Effect.log*, Console.log, Clock.currentTimeMillis, Random.next, Config.String, Schema.decodeUnknownEffect, Schema.TaggedErrorClass, Context.Service, Layer.*, NodeServices/NodeRuntime, BunServices/BunRuntime) were corroborated against the installed pinned release, not memory. |
| `@effect/tsgo` | 0.36.4 | MIT | **Pinned dev-only and observed through diagnostics and LSP.** The tracked Stage 0 tracer starts its reviewed platform executable, retains its `floatingEffect` diagnostic, preserves its client-facing LSP result, and matches its `missingEffectContext` oracle. Typed authority and overlap remain recorded in `docs/tsgo-boundary.md`. The package's presets are not imported, and no implementation code was copied. |
| TypeScript unstable async API and LSP | 7.0.2 | Apache-2.0 | **Pinned dev-only tracer dependency.** The Stage 0 tracer uses `typescript/unstable/async` for symbol-provenance and three-channel relation probes. A contained stock LSP process tests diagnostic coordination only; the product design still rejects a second base LSP. Executable hashes, fixture hashes, supported operations, injected failures, and unsupported identity cases are retained in acceptance evidence. No TypeScript implementation code was copied. |
| Biome linter domains | Biome documentation | MIT/Apache-2.0 | **Configuration prior art only.** The idea that named domains gate rule applicability informed the domain expansion; no implementation copied. This package adds no Biome plugin. |
| `joelhooks/effectts-skills` | GitHub repository | (advisory) | **Advisory only.** Treated as opinion; every Effect claim used here was independently corroborated against the pinned Effect release. |
| Semantic Systems repository-local rules | six independently tested rules at source commit above | (internal) | **Semantics generalized, code not vendored.** The tracer re-implements the families against the frozen spec 0001 with repository path policy removed; fixtures were written fresh for the orthogonal domain model. |
| Oxlint JS fixer and RuleTester APIs | oxlint 1.77.0 | MIT | **Reused for one bounded repair path.** The fixer emits one atomic import-aware edit set only for direct ambient `console.log` statements inside a recognized `Effect.gen` generator. No Oxlint implementation code was copied. |
| Effect `Match` | effect 4.0.0-beta.107 `effect/Match` source and declarations | MIT | **Reviewed as the domain-branching replacement.** `Match.value`, `Match.type`, `Match.valueTags`, `Match.typeTags`, `Match.when`, and `Match.exhaustive` are current APIs. A broad `switch` rule was deferred because typed exhaustiveness and comment-preserving repair are not available to JavaScript rules. |
| ESLint bulk suppressions | ESLint current suppression documentation | MIT | **Conceptual migration prior art only.** Baseline inventory, stale-entry rejection, and pruning informed the Stage 3 design. Stage 2 implements only reasoned local exceptions and visible file opt-outs. |
| Rust compiler diagnostics | Rust compiler diagnostic and suggestion conventions | Apache-2.0 / MIT | **Diagnostic UX prior art only.** Stable codes, explanation, help, proof source, and applicability informed the structured schema. No Rust code was copied. |
| TypeScript switch checks | TypeScript 7.0.2 and `noFallthroughCasesInSwitch` | Apache-2.0 | **Evaluated and insufficient for EffectTS domain branching.** The compiler detects fallthrough but does not enforce Effect `Match` or prove all project-defined domain cases in ordinary switch statements. |

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
