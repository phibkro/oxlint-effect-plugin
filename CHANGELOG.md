# @phibkro/oxlint-effect-plugin

## 0.2.0

### Minor Changes

- [`f8094d2`](https://github.com/phibkro/oxlint-effect-plugin/commit/f8094d290bda13e7f1f8b6d872b3f009b205114f) Thanks [@phibkro](https://github.com/phibkro)! - Add Changesets release automation, conventional commit validation, generated changelogs, the RC-compatible `effx check` coordinator, and bounded `effx doctor` environment inspection.

### Patch Changes

- Review Effect, `@effect/platform-node`, and `@effect/platform-bun` at 4.0.0-rc.109. Pin the transitive platform shared package to the same release, update the exact compatibility metadata and runtime observations, and correct Effect examples against the reviewed APIs.

- Widen the supported Oxlint rule-engine surface from the exact `1.77.0` pin to `^1.56.0`. The packed plugin now declares `supported.oxlint: "1.56.0"` in `compatibility.json` alongside the unchanged exact reviewed matrix, and the peer dependency admits any release at or above the empirically verified floor.

  Evidence: the 90-diagnostic consumer matrix passes identically under Oxlint 1.56.0 and 1.77.0 in both configuration forms, and upstream changelogs show no breaking `jsPlugins` API change between those releases. The `effx check` and `effx doctor` coordinator gates remain exactly pinned (Oxlint 1.77.0, TypeScript 7.0.2, @effect/tsgo 0.36.4) by design.

This file is maintained by Changesets. Add a changeset for each user-visible change. The release workflow updates versions and this changelog from merged changesets.
