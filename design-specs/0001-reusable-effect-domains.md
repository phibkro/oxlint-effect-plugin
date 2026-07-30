# Design spec 0001: reusable Effect Oxlint domains

Status: frozen for the first tracer bullet

Date: 2026-07-30

Naming revision: 2026-07-30. Operator direction made the product identity
version-neutral while retaining Effect v4 as explicit, machine-readable
compatibility metadata and the current technology domain. No rule semantics or
acceptance evidence were broadened by this revision.

Source provenance: extracted and adapted from Semantic Systems design spec
0011 at commit `4d1f6947c0c5b8ba802f4e2ddf6ff8325e053ddd`.

## Problem

Effect-bearing TypeScript projects need architectural diagnostics beyond
generic JavaScript correctness rules. Repository-local lint plugins tend to
encode directory names, mix platform and architectural policy, require a
TypeScript runtime loader, and overstate syntax analysis as type-aware
knowledge. Projects then either copy brittle rules or accept ambient
capabilities, accidental runtime coupling, premature Effect execution,
untyped external decoding, and unstructured operational output.

## Goal

Ship one independently reusable compiled Oxlint JavaScript plugin that:

1. composes explicit technology, architectural-role, runtime-platform, and
   semantic-boundary domains;
2. provides high-confidence syntax and scope diagnostics for Effect v4 code;
3. loads from its packed artifact without a TypeScript runtime loader;
4. documents the boundary with `@effect/tsgo` type-aware diagnostics;
5. carries no consumer-repository path knowledge; and
6. proves its supported intersections through isolated consumer fixtures.

## Package interface

- repository: `oxlint-effect-plugin`;
- package: `@phibkro/oxlint-effect-plugin`;
- default Oxlint namespace: `effect/*`;
- technology compatibility: package and compatibility metadata declare Effect
  major 4, exact reviewed release `4.0.0-beta.102`, and technology domain
  `effect-v4`;
- initial release line: `0.x`;
- default export: ESLint-v9-compatible Oxlint JavaScript plugin;
- named exports: individual rules, `recommended` and `strict` presets, domain
  metadata, rule metadata, and a typed configuration builder;
- distribution: compiled ESM JavaScript, declarations, source maps, rule
  documentation, license, compatibility, and provenance metadata.

The package is third-party and does not imply Effect project endorsement.
Every dependency in the reviewed Effect v4/Oxlint/runtime matrix is pinned
exactly while those surfaces remain pre-stable.

## Orthogonal domain vocabulary

Configuration expands selected domain intersections into ordinary Oxlint
rules and file overrides. Domains determine applicability, not severity.

### Technology

- `effect-v4`

Dependency or import detection may suggest this domain, but explicit
configuration is authoritative.

### Architectural role

- `pure-library` — deterministic values and functions; no Effect execution or
  ambient capability;
- `effect-library` — may describe Effects, services, schemas, and layers but
  cannot execute a runtime or bind a concrete platform;
- `service` — stateful or capability-bearing implementation behind declared
  Effect services;
- `application` — portable orchestration that leaves final requirements open;
- `composition-root` — selects live layers, provides the final environment, and
  runs the program;
- `runtime-adapter` — implements one declared platform capability;
- `test` — controlled execution and replacement services.

### Runtime platform

- `portable`;
- `node`;
- `bun`;
- `deno`;
- `browser`;
- `web-worker`.

`portable` conflicts with every concrete runtime. A concrete runtime admits
only its declared built-ins, globals, and platform layers. Compatibility APIs
provided by another runtime are not silently portable.

### Semantic boundary

- `external-data`;
- `observability`;
- `security-sensitive`;
- `persistence`.

Boundary domains enable focused rules. They do not turn lint output into
runtime validation, type checking, or proof.

## Initial rule families

### Observability capability

Reject ambient `console` in Effect-bearing operational code. Prefer
`Effect.log*`, Effect `Console`, or an injected service. A genuinely
developer-only statement may use one targeted suppression containing a
nonempty `dev only:` reason. The rule is severe by default. Local shadowing of
`console` is not an ambient-global violation.

### Ambient capability

Reject ambient clock, random, cryptographic, network, timer, environment,
filesystem, process, and runtime authority where an Effect service or injected
capability owns the operation. Distinguish deterministic constructors such as
`new Date(capturedMilliseconds)` from observations such as `new Date()` or
`Date.now()`. Capturing nondeterminism in a thunk is not sufficient when the
thunk still hides ambient authority from the Effect environment.

### Platform portability

Reject cross-runtime imports and globals according to the selected runtime
domain. Permit official platform live layers only in a matching
`composition-root` or `runtime-adapter`.

### Effect execution topology

Reject `Effect.run*` outside a `composition-root`. Reject final provision that
prematurely closes a reusable library's requirements, while admitting Layer
construction and internal service composition.

### External decoding

Reject raw JSON parsing at declared `external-data` boundaries in favor of
explicit Effect Schema decoding. Other syntaxes require their own explicit
parser/Schema seam; Schema is not falsely claimed to parse every syntax.

### Typed failure and totality

Reject `throw` only in roles whose contract is total or whose failures belong
in an Effect error channel. This is not a JavaScript-wide ban.

Rules expose conservative options for project identifiers and admitted
composition roots. Consumers may select rules individually or override preset
severity.

## Type-aware companion boundary

Oxlint JavaScript plugins receive syntax, scope, code-path, and project APIs,
not TypeScript type information. This package therefore delegates type-aware
Effect diagnostics to `@effect/tsgo`, including floating Effects, leaking
requirements, strict provision, unsafe Effect assertions, unknown error
values, and outdated Effect APIs.

Compatibility documentation must identify overlap, select one authoritative
diagnostic in presets, and prevent duplicate noise. Installing or patching TSGO
is outside this plugin's runtime.

## Oracle-first fixture matrix

At least one oracle is observed red before implementing every new rule family
or domain intersection. The first tracer contains:

- all architectural roles under `portable`;
- Node, Bun, and Deno adapters with positive own-runtime and negative
  cross-runtime imports/globals;
- browser and worker global differences;
- an Effect library that describes but never runs an Effect;
- an application that composes services but leaves final provision open;
- one composition root per supported platform;
- raw and Schema-decoded external JSON;
- ambient and injected clock, random, crypto, network, and console;
- deterministic `new Date(value)` versus ambient current time;
- local shadowing of `console`, `process`, and `crypto`;
- one valid reasoned `dev only:` suppression plus invalid broad, missing-reason,
  and unused suppressions;
- equivalent `.oxlintrc.json` and `oxlint.config.ts` execution; and
- a temporary consumer that loads only the packed compiled artifact.

## Portable core boundary

Rule classification, domain expansion, metadata, and diagnostics import no
filesystem, process, network, clock, random, package-manager, Node, Bun, Deno,
browser, or consumer-repository authority. Packaging and runtime journeys live
behind explicit adapters.

No distributed file may contain Semantic Systems, Workgraph, or Reef path
knowledge.

## Executable acceptance commands

```bash
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run accept:0001
git diff --check
```

`check` runs formatting, lint, type checking, unit tests, portable-import
checks, package export checks, and documentation consistency.

`accept:0001` builds and packs the artifact, installs the tarball without
lifecycle scripts into isolated Bun-, Node-, and Deno-oriented consumers, runs
the complete positive/negative domain matrix, and verifies that consumers load
compiled JavaScript rather than repository TypeScript.

A missing required tool fails rather than degrading to a warning.

## Acceptance

The first tracer is accepted only when:

1. every rule family has a committed observed-red oracle and passing
   implementation fixture;
2. domain expansion keeps technology, role, runtime, and boundary orthogonal;
3. portable fixtures reject all concrete-runtime authority;
4. each concrete runtime admits its own declared surface and rejects the
   others;
5. Effect libraries can describe programs but cannot execute or finally
   provide them;
6. applications compose services without executing, while composition roots
   may provide the final layer and run;
7. external JSON crosses an explicit Schema decoding boundary;
8. ambient capabilities are rejected without flagging injected services or
   deterministic `new Date(value)`;
9. local shadowing does not trigger ambient-global diagnostics;
10. ambient console is severe, and only a targeted nonempty `dev only:`
    suppression is admitted;
11. typed-failure rules respect the declared role instead of banning all
    throws;
12. preset documentation identifies every TSGO overlap and authority choice;
13. `.oxlintrc.json` and `oxlint.config.ts` produce equivalent diagnostics;
14. the packed artifact loads under isolated Bun and Node consumers without a
    TypeScript runtime loader;
15. the Deno-oriented consumer passes its declared compatibility journey;
16. no distributed file contains consumer-specific path policy;
17. all rule diagnostics identify rule, selected domains, rationale, and
    limitation; and
18. the exact compatibility matrix, package contents, and provenance are
    machine-readable and checked.

## Non-goals and limits

The package does not enforce all idiomatic Effect v4, replace TSGO, prove
effect safety, infer architecture perfectly, make Deno equivalent to Node, or
guarantee operational safety. It does not add a Biome plugin.

Automatic fixes are absent unless locally semantics-preserving. Replacing an
ambient operation with an Effect service changes requirements and composition
and is not a safe syntax-only fix.

## Reuse and provenance

- Generalize the six independently tested Semantic Systems rules and their
  counterexamples only after removing repository path policy.
- Build on Effect v4, `effect-oxlint`, and Oxlint under compatible licenses.
- Follow Oxlint's documented ESLint-v9 plugin surface and compiled package
  loading.
- Treat Biome domains as configuration prior art, not copied implementation.
- Treat `joelhooks/effectts-skills` as advisory prior art and independently
  corroborate claims against the pinned Effect release.

Evaluated prior art, reused code, licenses, and rejected established options
must be recorded before implementation is accepted.
