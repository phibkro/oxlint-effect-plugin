---
"@phibkro/oxlint-effect-plugin": patch
---

Widen the supported Oxlint rule-engine surface from the exact `1.77.0` pin to `^1.56.0`. The packed plugin now declares `supported.oxlint: "1.56.0"` in `compatibility.json` alongside the unchanged exact reviewed matrix, and the peer dependency admits any release at or above the empirically verified floor.

Evidence: the 90-diagnostic consumer matrix passes identically under Oxlint 1.56.0 and 1.77.0 in both configuration forms, and upstream changelogs show no breaking `jsPlugins` API change between those releases. The `effx check` and `effx doctor` coordinator gates remain exactly pinned (Oxlint 1.77.0, TypeScript 7.0.2, @effect/tsgo 0.36.4) by design.
