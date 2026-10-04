# @phibkro/oxlint-effect-plugin

## 0.2.0

### Minor Changes

- [`f8094d2`](https://github.com/phibkro/oxlint-effect-plugin/commit/f8094d290bda13e7f1f8b6d872b3f009b205114f) Thanks [@phibkro](https://github.com/phibkro)! - Add Changesets release automation, conventional commit validation, generated changelogs, the `effx check` coordinator, and bounded `effx doctor` environment inspection.

### Patch Changes

- Review Effect, `@effect/platform-node`, and `@effect/platform-bun` at 4.0.0 (general availability), and move the reviewed toolchain to Oxlint 1.86.0, Oxfmt 0.71.0, `oxlint-tsgolint` 7.0.2003, `@effect/tsgo` 0.48.0, and TypeScript 7.0.2. Pin the transitive platform shared package to the same release, update the exact compatibility metadata, the `effx check` and `effx doctor` provider pins, and the runtime observations, and correct Effect examples against the reviewed APIs (`Config.String`, `Effect.callback`).

- Widen the supported Oxlint rule-engine surface from an exact pin to `^1.56.0`. The packed plugin now declares `supported.oxlint: "1.56.0"` in `compatibility.json` alongside the exact reviewed matrix, and the peer dependency admits any release at or above the empirically verified floor.

  Evidence: the 90-diagnostic consumer matrix passes identically under Oxlint 1.56.0 and 1.86.0 in both configuration forms, and `bun run accept:0001` now runs a consumer at the floor on every acceptance. The `effx check` and `effx doctor` coordinator gates remain exactly pinned (Oxlint 1.86.0, TypeScript 7.0.2, @effect/tsgo 0.48.0) by design.

- Recognize the Effect 4 `Effect.callback` boundary, in place of the removed `Effect.async`, as an admitted native-Promise wrapper for runtime adapters in `no-native-promise-control-flow`, and point the ambient-network remedy at `effect/http`.

- Type the `effect()` expansion with mutable arrays and rule settings that are either a bare severity or a `[severity, options]` pair, so `defineConfig({ ...effect(input) })` type-checks against Oxlint's own configuration type and a consumer-completed fragment can set a rule to a bare `"off"` and keep the `OxlintConfigFragment` annotation. Oxlint validates the options of an off plugin rule, so `["off", {}]` does not load. Runtime output is unchanged.

- Declare `repository` and write the `effx` bin target as `dist/cli.js` in `package.json`. npm 11 removes a `./`-prefixed bin target at publish, which would have shipped the package without its CLI, and npm provenance requires `repository.url` to match the publishing repository.

This file is maintained by Changesets. Add a changeset for each user-visible change. The release workflow updates versions and this changelog from merged changesets.
