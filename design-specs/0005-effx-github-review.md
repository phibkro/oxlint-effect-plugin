# effx GitHub review integration

Status: frozen for the first executable tracer
Date: 2026-08-12

## Product boundary

`effx` publishes existing structured diagnostics into GitHub. It does not replace Oxlint, `@effect/tsgo`, GitHub authorization, or repository package managers. The package coordinate `@phibkro/oxlint-effect-plugin`, the default `effect/*` rule namespace, and stable `EFT` diagnostic codes remain version-neutral.

The GitHub Check is the canonical publication. Inline review comments are a changed-line projection of the same findings.

## Inputs and authority

| Input | Kind | Authority |
| --- | --- | --- |
| Exact expected and observed PR head SHAs | runtime observation | GitHub adapter |
| Changed-line ranges | runtime observation | GitHub diff adapter |
| Structured diagnostics | static-analysis evidence | Oxlint, typed Oxlint, Effect TSGO, module graph, or audit owner |
| Existing bot comment metadata | runtime observation | GitHub adapter |
| Inline comment limit | configuration | repository workflow |

The portable planner owns no filesystem, process, network, credential, or GitHub authority. Runtime adapters decode all observations before calling it.

## Finding contract

Every projected finding retains stable diagnostic code and rule or semantic subject; family and invariant; normalized repository-relative path and source range; message, explanation, help, and documentation reference; proof sources and analysis origin; repair applicability; and a deterministic semantic fingerprint.

A fingerprint excludes commit identity. It combines the rule or subject, code, normalized path, invariant, and a semantic source anchor so a moved line can update one existing comment instead of creating another.

## Publication transitions

```text
runtime-decoded GitHub observations
              |
              v
       exact-head validation
              |
      +-------+-------+
      |               |
   reject          project findings
                      |
              +-------+-------+
              |               |
        Check output     changed-line comments
                              |
                    reconcile fingerprints
                              |
                  create / update / resolve
```

The planner rejects missing or mismatched head SHAs before producing any mutation. Findings outside changed lines and findings beyond the configured inline cap remain visible in the Check summary. Existing comments are updated by fingerprint, duplicate observations are rejected, and comments whose findings disappeared are resolved.

## Stage 1 tracer

The tracked tracer uses an in-memory GitHub adapter. It must establish:

1. one semantic diagnostic becomes one Check annotation and one inline comment on a changed line;
2. a diagnostic outside the changed lines remains in the Check and does not create an inline comment;
3. a mismatched or missing head SHA produces a rejected plan with no mutations;
4. a second revision updates the existing comment fingerprint without creating a duplicate;
5. a fixed revision resolves the prior comment;
6. the inline limit is bounded and overflow remains in the Check summary;
7. the output is deterministic and records unsupported behavior explicitly.

No temporary probe or prose claim satisfies this contract. The acceptance command must reproduce byte-identical tracked evidence.

## Stage 2 reusable integration

The reusable command separates untrusted analysis from publication authority:

- `effx github plan` consumes structured diagnostics, an exact head SHA, changed-line observations, and existing comment metadata; it emits a deterministic publication plan without network access.
- A trusted workflow step may publish that plan with `contents: read`, `pull-requests: write`, and `checks: write` authority.
- Untrusted pull-request code never runs in the write-authorized publication step.
- GitHub API failure is reported as failure, never as a clean review.

## Version and migration classification

Inventory classifies each non-archived, non-fork source repository exactly once:

- `supported-effect-v4`: every declared Effect version matches the exact reviewed release;
- `mechanically-migratable`: Effect v3 or unsupported v4 declarations are exact and a deterministic dependency-only migration is available;
- `agent-migration-opt-in-required`: ranges, workspace protocols, conflicts, unavailable targets, or semantic source work prevent a proven mechanical migration;
- `not-applicable`: no Effect dependency is declared.

Mechanical migration changes dependency and configuration declarations only, uses explicit reviewed targets, and must pass the target repository's own verification. It never guesses an `@effect/*` version or edits application source. Other migrations receive a reminder and supplementary guide; agent-authored changes require explicit opt-in.

## Account rollout

The inventory adapter reads repositories visible to the authenticated account, excludes archived repositories and forks, observes the immutable default-branch head and package manifests, and emits a sorted dry-run artifact. Duplicate identities, access failures, missing default branches, missing manifest observations, or ambiguous dependency declarations fail closed before any pull request is opened.

Rollout creates a branch and reviewable pull request per qualifying repository. It never pushes to a default branch, merges, changes credentials, publishes a package, deploys a service, or changes repository settings.

## Evidence limits

The tracer proves planner transitions over retained fixtures. It does not prove GitHub availability, account authorization, target-repository verification, or successful remote rollout. Remote PR URLs and exact head observations are separate rollout evidence.
