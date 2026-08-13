# Design spec 0003: strict-by-default Effect configuration

Status: accepted; implemented

Date: 2026-08-11

Parent: [`0002-effectts-enforcement-layer.md`](./0002-effectts-enforcement-layer.md)

## Summary

The plugin defines the Effect enforcement domain. Consumers must not select an
`effectts` profile or an `effect-v4` technology domain.

The public builder becomes `effect()`. Its highest strictness is the default.
Consumers must write an explicit setting to lower enforcement.

Architectural role, runtime platform, and semantic boundary remain independent
applicability context. They do not select the product domain.

## Decisions

| Concern        | Decision                                                                                |
| -------------- | --------------------------------------------------------------------------------------- |
| Product domain | The installed plugin is the Effect enforcement domain.                                  |
| Effect version | `compatibility.json` declares the reviewed Effect version. User configuration does not. |
| Builder        | `effect(input)`                                                                         |
| Strictness     | `"strict"` or `"recommended"`                                                           |
| Default        | `"strict"` when the project and group omit strictness                                   |
| Required floor | Retired. `strict` is the floor. `recommended` may omit rules that Stage 2 forced on.    |
| Lowering       | `strictness: "recommended"` or an explicit rule override                                |
| Applicability  | Role, platform, and boundary groups                                                     |
| Precedence     | Group strictness replaces project strictness. This supersedes additive presets.         |
| Topology       | No topology axis until one shipped rule has different topology semantics                |
| Migration      | Clean cutover with no aliases or deprecated fields                                      |

## Public interface

```ts
import { defineConfig } from "oxlint";
import { effect, importClosurePolicy, type EffectConfigInput } from "@phibkro/oxlint-effect-plugin";

const effectConfig = {
  trustedPureDependencies: [
    {
      specifier: "date-fns/format",
      reason: "reviewed total transform over caller-owned Date values",
    },
  ],
  groups: [
    {
      files: ["src/core/**"],
      role: "application",
      platform: "portable",
    },
    {
      files: ["src/legacy/**"],
      role: "application",
      platform: "portable",
      boundaries: ["external-data"],
      strictness: "recommended",
      severityOverrides: {
        "no-ambient-console": "warn",
      },
    },
    {
      files: ["src/adapters/node/**"],
      role: "runtime-adapter",
      platform: "node",
      adapterDependencies: ["stripe"],
    },
  ],
  rules: {
    "no-raw-json-parse": "off",
  },
} satisfies EffectConfigInput;

export default defineConfig({
  ...effect(effectConfig),
});

const closure = importClosurePolicy(effectConfig);
```

The builder output remains a plain Oxlint configuration fragment. It contains
only `jsPlugins`, root `rules`, and `overrides`.

`importClosurePolicy()` projects trusted dependencies and adapter ownership from
the same `EffectConfigInput`. It does not add non-Oxlint keys to the builder
output.

## Strictness semantics

Strictness selects a monotonic rule-name collection. It does not set severity.

```text
strict ⊃ recommended
```

For one group, expansion uses this order:

1. Read group strictness.
2. Otherwise, read project strictness.
3. Otherwise, use `strict`.
4. Select rules that apply to the group's role and boundaries.
5. Apply overrides in this order: project rule, group rule, registry severity.

Group strictness replaces project strictness. A project set to `strict` can
lower one group with `recommended`. Other groups remain strict.

`strict` enables every shipped rule that applies to the group. `recommended`
enables the reviewed lower subset. A rule cannot be in `recommended` without
also being in `strict`.

The rule-name set is monotonic. Option payloads and diagnostic ownership need
not be monotonic. When `no-native-promise-control-flow` is disabled,
`no-premature-execution` owns `Effect.runPromise*` sites. This prevents duplicate
diagnostics and prevents a coverage gap.

An explicit rule override remains the narrowest project dialect control. It
affects the named rule, except for the documented `Effect.runPromise*` ownership
transfer. Lowering strictness can therefore make a rule-named local exception
stale. The migration must rename or remove those exceptions.

## Applicability context

The old word `domain` covered unrelated concepts. This specification replaces
it with precise terms.

| Term       | Meaning                                        | Examples                                            |
| ---------- | ---------------------------------------------- | --------------------------------------------------- |
| Role       | A module's architectural responsibility        | `effect-library`, `application`, `composition-root` |
| Platform   | Runtime authority admitted for the group       | `portable`, `node`, `browser`                       |
| Boundary   | A semantic seam that activates relevant checks | `external-data`, `persistence`                      |
| Strictness | The size of the enabled rule collection        | `strict`, `recommended`                             |
| Severity   | How Oxlint reports one enabled rule            | `error`, `warn`, `off`                              |

Roles still own execution authority. Platforms still own concrete runtime
access. Boundaries still activate boundary-specific rules.

## Removed configuration vocabulary

The implementation must remove these configuration and public API names:

- `technology` in configuration and rule options;
- `profile` in configuration and registry rule entries;
- `preset`;
- `expandDomains`;
- `expandImportClosurePolicy`;
- `DomainGroup`;
- `ExpandInput`;
- `RulePreset`;
- named `recommended` and `strict` configuration fragments.

The replacement names are:

| Removed                                                | Replacement                                          |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `expandDomains`                                        | `effect`                                             |
| `expandImportClosurePolicy`                            | `importClosurePolicy`                                |
| `DomainGroup`                                          | `RuleGroup`                                          |
| `ExpandInput`                                          | `EffectConfigInput`                                  |
| `Preset` or `RulePreset`                               | `Strictness`                                         |
| Registry `presets`                                     | `strictness`                                         |
| Registry `profile.roles` and `profile.boundaries`      | `applicability.roles` and `applicability.boundaries` |
| Registry `profile.required`                            | Deleted; every shipped rule belongs to `strict`      |
| `ExpansionPolicy.profile` and `ExpansionPolicy.preset` | `ExpansionPolicy.strictness`                         |

`expandGroupRules` keeps its name. Its signature becomes
`expandGroupRules(group, pluginName?, policy?)`.

Fields not listed as removed keep their Stage 2 names and meanings:

- `severityOverrides`;
- `ruleOptions`;
- `adapterDependencies`;
- `trustedPureDependencies`;
- `pluginName`;
- `pluginSpecifier`.

Direct rule configuration must provide valid `role` and `platform` values.
Boundaries remain optional. The builder provides both required values for every
expanded rule.

Removal does not apply to compatibility evidence.
`compatibility.json.technology`, `package.json.effectCompatibility`, and the
generated knowledge document keep their Effect v4 identity. EffectTS can remain
an explanatory product term. It is not a selectable configuration profile.

The technology configuration axis is deleted from public TypeScript metadata.
The package no longer exports `TECHNOLOGIES`, `Technology`, or `isTechnology`.
`DomainSelection.technology`, the `technology` value in
`DomainDescription.axis`, and the `effect-v4` entry in `DOMAIN_DESCRIPTIONS`
are also deleted.

No compatibility alias is allowed. Every caller, fixture, generated artifact,
package check, consumer journey, README claim, AGENTS.md invariant, and
superseded design decision must migrate.

## Superseded prior decisions

This specification supersedes these decisions:

| Prior decision                                          | Replacement                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| 0001 exports named `recommended` and `strict` fragments | Consumers call `effect()` with explicit groups.                       |
| 0002 makes `effectts` a selectable profile              | The plugin itself selects Effect enforcement.                         |
| 0002 prefers `preset` over `strictness`                 | `strictness` now names rule-collection size exactly.                  |
| 0002 prevents presets from removing required rules      | The required floor is retired. `recommended` is an explicit lowering. |
| 0002 adds group and project presets                     | Group strictness replaces project strictness.                         |

The implementation must mark the affected 0001 and 0002 text as superseded by
this specification.

## Topology research

Current rules do not justify a topology configuration axis.

| Candidate topology | Distinct Effect concern                                                               | Current enforcement result                                        |
| ------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| GUI                | Reactive state, event fibers, registry disposal, framework runtime bridge             | Candidate only; current rules use role and browser platform       |
| Server             | Per-request scope, client-abort interruption, request context, shared server lifetime | Candidate only; current rules cannot prove request ownership      |
| Executable         | Process lifetime, signals, `runMain`, `Layer.launch`, CLI environment                 | Existing composition-root and platform policy cover shipped rules |
| Library            | Open requirements, no execution, no final platform provision                          | Existing pure/effect-library roles cover shipped rules            |

Evidence was read from the installed `effect@4.0.0-rc.108` package:

- `Layer.launch` models a long-running executable lifetime
  (`node_modules/effect/src/Layer.ts:3897-3898`).
- HTTP server and router APIs create request scopes and interrupt request fibers
  (`node_modules/effect/src/unstable/http/HttpServer.ts:102-105` and
  `HttpRouter.ts:224-227`).
- Reactivity APIs own atom registries, subscriptions, fibers, and disposal
  (`node_modules/effect/src/unstable/reactivity/AtomRegistry.ts:150-170`,
  `252-256`, and `686-689`).
- CLI execution requires `Terminal`, `Path`, `FileSystem`, `Stdio`, and
  `ChildProcessSpawner` services
  (`node_modules/effect/src/unstable/cli/Command.ts:391`).

These differences do not yet produce different results for the eight default
EffectTS rules or the opt-in package-barrel rule. Adding labels now would create
configuration without enforcement value.

A future topology axis requires all of these:

1. One accepted invariant has different semantics for two topologies.
2. The analyzer has a high-confidence proof source.
3. Red and green fixtures prove the difference.
4. Existing role, platform, and boundary context cannot express it.

Typed ownership, open requirements, request lifetimes, and floating Effects stay
under `@effect/tsgo` or remain documented gaps.

## Registry, validation, and generation

The rule registry is the only source for strictness membership and
applicability. Generated rule docs, guidance, matrix data, and package checks
must use the same metadata.

The builder and `importClosurePolicy()` must reject:

- an unknown project or group strictness;
- an omitted or empty group list;
- an invalid role, platform, boundary, dependency, or rule name;
- a duplicate or unreasoned trusted or adapter dependency.

Generation must reject:

- a recommended rule that is absent from strict;
- a registry entry that retains `presets`, `profile`, or `required`;
- configuration examples that retain `technology`, `profile`, or `preset`.

`guidance/effectts-knowledge.json` moves to `schemaVersion: 2`. Registry field
renames are a machine-readable schema change. Its top-level Effect v4
compatibility identity remains.

## Migration sequence

1. Add red tests for implicit strict expansion.
2. Add red tests for explicit recommended lowering.
3. Add red runtime tests for unknown strictness and missing or invalid role and platform.
4. Replace registry preset and profile metadata.
5. Replace configuration types and builder names.
6. Remove technology and profile from configuration validation.
7. Require role and platform in direct rule options.
8. Replace the authoritative-technology input gate with context and strictness gates.
9. Delete the named `recommended` and `strict` fragments.
10. Migrate import-closure policy projection.
11. Migrate every repository and packed-consumer caller.
12. Mark superseded sections of design specs 0001 and 0002.
13. Regenerate schema-v2 knowledge, docs, matrix data, and oracle evidence.
14. Remove obsolete names and prove that no alias remains.

## Acceptance

The change is accepted when all checks below pass:

- Omitting strictness enables the strict rule-name collection.
- Project and group `recommended` settings lower the collection explicitly.
- A recommended group under a strict project does not lower other groups.
- The strict rule-name set is a superset of the recommended rule-name set.
- `Effect.runPromise*` ownership transfers without a duplicate or coverage gap.
- Rule-named local exceptions are audited after strictness changes.
- Registry applicability reproduces Stage 2 role and boundary behavior exactly.
- No registry entry retains `presets`, `profile`, or `required`.
- Direct rule options reject missing or invalid role or platform values.
- Unknown strictness throws at builder and policy-projection call time.
- Per-rule overrides affect only named rules, except for documented ownership transfer.
- `effect()` returns only valid Oxlint configuration keys.
- `importClosurePolicy()` derives from the same input declaration.
- Public declarations and package exports contain no removed names.
- Compatibility metadata still matches `package.json.effectCompatibility` exactly.
- Rule messages keep context evidence but remove `technology=`.
- Shipped knowledge declares `schemaVersion: 2`.
- Generated docs and guidance describe strict-by-default behavior.
- JSON and TypeScript config-form oracles remain equivalent.
- Packed Bun, Node, and declared Deno consumer journeys pass.

## Deferred work

Topology-specific rules remain a Stage 3 research task. The first candidate
should prove a lifecycle invariant, not add a label by convention.
