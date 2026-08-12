# EffectTS rule and gap matrix

Status: accepted; Stage 2 implemented

Date: 2026-08-11

Parent design: [`0002-effectts-enforcement-layer.md`](./0002-effectts-enforcement-layer.md)

This matrix classifies the accepted tracer and the implemented EffectTS profile. It records design and implementation evidence, not only shipped Oxlint rules.

## 1. Reading the matrix

Proof sources:

| Source          | Meaning                                                     |
| --------------- | ----------------------------------------------------------- |
| `syntax`        | Oxc AST shape is sufficient.                                |
| `scope`         | Oxlint resolved lexical binding is sufficient.              |
| `module-graph`  | Project resolution and configured file groups are required. |
| `typed-oxlint`  | A generic Oxlint typed diagnostic owns the fact.            |
| `tsgo`          | `@effect/tsgo` owns the typed Effect fact.                  |
| `convention`    | Guidance only. It cannot establish conformance.             |
| `unenforceable` | No pinned engine can prove the general invariant.           |

Current-rule classifications use the requested vocabulary exactly:

- already sufficient
- broaden under EffectTS profile
- requires profile-specific applicability
- covered by TSGO
- should be superseded/generalized
- new rule required
- cannot currently prove

## 2. Accepted tracer rules

| Code      | Rule                             | Family        | Current high-confidence evidence                                                                                             | Classification                          | EffectTS decision                                                                                              | Proof         | Repair                                                                                                     | Residual gap                                                                                              |
| --------- | -------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `EFT2101` | `no-ambient-console`             | observability | Ambient `console` and static global-object console members, with scope identity                                              | broaden under EffectTS profile          | Replace console-only suppression with the general local exception protocol. Add the narrow generator fix.      | syntax, scope | Machine fix only for a standalone call inside a recognized Effect generator. Other sites need refactoring. | Aliases and wrappers remain unknown. Logger installation and output behavior are typed or runtime facts.  |
| `EFT2201` | `no-ambient-authority`           | capability    | Known globals and static imports for time, random, environment, network, process, filesystem, and runtime authority          | broaden under EffectTS profile          | Keep the broad capability invariant. Add explicit provider and adapter policy for Config and vendor authority. | syntax, scope | Boundary or refactor guidance                                                                              | Cannot find arbitrary wrapper provenance. `Config` can hide a default environment provider.               |
| `EFT2301` | `no-cross-runtime`               | platform      | Runtime globals, static package classifiers, platform-role matching                                                          | already sufficient                      | Keep rule semantics. Consume it as one required profile invariant.                                             | syntax, scope | No automatic fix                                                                                           | Dynamic specifiers and wrapper provenance remain unknown.                                                 |
| `EFT4101` | `no-premature-execution`         | execution     | Imported Effect `run*`, `ManagedRuntime.make`, platform `runMain`, and final official Layer provision                        | requires profile-specific applicability | Keep execution ownership role-specific. Only composition roots and controlled tests execute.                   | syntax, scope | Architectural refactor                                                                                     | Cannot prove arbitrary aliases, custom runners, or final requirement discharge.                           |
| `EFT3101` | `no-native-promise-control-flow` | computation   | `async`, `await`, `for await`, native Promise construction/combinators, immutable aliases, and imported `Effect.runPromise*` | broaden under EffectTS profile          | Keep one semantic rule for native asynchronous control flow. Move exceptions to the general protocol.          | syntax, scope | Refactor or boundary guidance                                                                              | Arbitrary typed `.then`, `.catch`, and `.finally` remain unenforceable.                                   |
| `EFT1201` | `no-raw-json-parse`              | boundary      | Ambient and global-object `JSON.parse` at declared external-data boundaries                                                  | requires profile-specific applicability | Keep boundary applicability. Explain `Schema.Type`, `Schema.Encoded`, and Effect decoders.                     | syntax, scope | Boundary guidance                                                                                          | Cannot prove that arbitrary external values were decoded or encoded.                                      |
| `EFT3201` | `no-untyped-throw`               | failure       | Every `throw` in governed roles, with composition-root, adapter, and test exclusions                                         | already sufficient                      | Keep ownership of throw syntax. Keep TSGO authoritative for the Effect error channel.                          | syntax        | Refactor guidance                                                                                          | Cannot distinguish expected failure from defects by syntax. Narrow file groups and escapes supply intent. |
| `EFT1101` | `no-opaque-instance-fields`      | modeling      | Direct `Schema.Opaque` declarations reached through resolved Effect imports and their non-static fields or methods          | new rule required                       | Enforce the documented structural runtime contract. Decoded opaque values are not instances of the declaration shell.       | syntax, scope | No automatic fix                                                                                           | Re-exports, wrappers, and inherited members remain unknown.                                               |
| `EFT5102` | `no-import-from-barrel-package`  | architecture  | Named value and namespace imports from exact package roots selected by configuration                                        | already sufficient                      | Keep this policy opt-in. It is package topology, not a default EffectTS semantic restriction.                                | syntax        | No automatic fix                                                                                           | Package exports, subpath validity, relative barrels, and re-exports require module resolution.             |

No accepted rule should be removed or renamed for Stage 2. The general suppression protocol supersedes only the console rule's private escape syntax.

## 3. Existing TSGO ownership

The pinned `@effect/tsgo@0.36.4` companion remains authoritative for these typed facts.

| Concern                                 | TSGO diagnostic or group         | EffectTS action                                         | Plugin action                                                                 |
| --------------------------------------- | -------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Floating Effect values                  | `floatingEffect`                 | Include the companion diagnostic in conformance output. | Do not duplicate it.                                                          |
| Missing Effect context                  | `missingEffectContext`           | Include the original typed finding.                     | Do not infer `R`.                                                             |
| Missing Effect errors                   | `missingEffectError`             | Include the original typed finding.                     | Do not infer `E`.                                                             |
| Missing Layer context                   | `missingLayerContext`            | Include the original typed finding.                     | Do not infer Layer requirements.                                              |
| Strict service provision                | `strictEffectProvide`            | Keep TSGO authoritative.                                | Syntax rules only own known final execution sites.                            |
| Unsafe Effect assertions                | `unsafeEffectTypeAssertion`      | Keep TSGO authoritative.                                | No name-based assertion heuristic.                                            |
| Promise inside lazy Effect constructors | `lazyPromiseInEffectSync`        | Keep TSGO authoritative.                                | Native Promise syntax remains this plugin's separate concern.                 |
| Generic Effect callback inference       | TSGO Effect function diagnostics | Keep TSGO authoritative.                                | Guidance can prefer `Effect.fn`; enforcement does not fake contextual typing. |
| Effect API freshness and schema typing  | TSGO API and schema diagnostics  | Preserve original code and span.                        | Registry records overlap only.                                                |

TSGO syntax overlaps stay disabled when this plugin owns the same syntax. One concern has one authoritative diagnostic.

## 4. Candidate semantic invariants

| Invariant                                                                                                                | Family        | Status                                                                | Observable evidence                                                                             | Proof source                                 | Role or boundary                       | Stage                          | Main false-positive control                                                                    |
| ------------------------------------------------------------------------------------------------------------------------ | ------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Governed modules import only Effect, role-admitted project modules, trusted pure packages, or declared adapter packages. | architecture  | implemented coordinator gate                                          | Resolved static module graph plus configured groups                                             | module-graph                                 | all governed groups                    | Stage 2 as `EFT5101`           | Type-only edges are admitted. Trust and adapter entries require exact config.                  |
| Domain models use Schema.                                                                                                | modeling      | cannot currently prove                                                | No general marker identifies domain meaning.                                                    | unenforceable                                | domain modules by convention           | Stage 3 research               | Do not infer from interfaces, classes, suffixes, or exports.                                   |
| Domain-facing branching prefers `Match` over `switch`.                                                                   | modeling      | new rule required as optional project dialect                         | Every `SwitchStatement` is visible. Typed exhaustiveness is not.                                | syntax; typed-oxlint for exhaustiveness only | effect-library, service, application   | Stage 3 candidate as `EFT1301` | Keep low-level pure, adapter, root, and test switches admitted by default. No automatic fix.   |
| External unknown values are decoded before use.                                                                          | boundary      | covered by TSGO in some typed flows; otherwise cannot currently prove | Decoder calls are visible, but value flow is not available to JS rules.                         | tsgo, unenforceable                          | external-data                          | Stage 3 audit                  | Keep `no-raw-json-parse` as the narrow high-confidence rule.                                   |
| Encoded and domain representations remain distinct.                                                                      | modeling      | covered by TSGO                                                       | `Schema.Type` and `Schema.Encoded` are typed facts.                                             | tsgo                                         | schema boundaries                      | companion integration          | Do not infer representation from variable names.                                               |
| Expected application failure uses the Effect error channel and schema errors.                                            | failure       | covered by TSGO plus existing syntax rule                             | Throw syntax is visible. Error-channel membership is typed.                                     | syntax, tsgo                                 | governed operational roles             | Stage 2 integration            | Keep defects and boundary exceptions role-specific.                                            |
| Reusable generator computations use `Effect.fn`.                                                                         | computation   | cannot currently prove as a required rule                             | Direct `Effect.gen` return shapes are visible but wrappers and contextual types are not.        | convention, tsgo                             | effect-library, service, application   | Stage 3 audit                  | Start as guidance. Add a syntax rule only after repeated precise examples.                     |
| Native asynchronous application control flow is outside EffectTS.                                                        | computation   | broaden under EffectTS profile                                        | Existing async, await, Promise syntax oracle                                                    | syntax, scope                                | all except explicit adapter/root cases | Stage 2                        | Exceptions name the exact rule and boundary reason.                                            |
| Capability authority stays explicit in requirements and Layers.                                                          | capability    | covered by TSGO plus existing syntax rule                             | Known ambient uses are visible. Requirement presence is typed.                                  | syntax, scope, tsgo                          | role-specific                          | Stage 2 integration            | Do not claim every capability has an `R` requirement from syntax.                              |
| Config providers are selected at a composition root or adapter.                                                          | capability    | new rule required only for explicit provider constructors             | Known `ConfigProvider.fromEnv` and provider Layer sites                                         | syntax, scope                                | composition-root, runtime-adapter      | Stage 3 candidate              | Core `Config` use is admitted. Default provider behavior prevents a complete syntax guarantee. |
| Application state uses Effect-managed state.                                                                             | state         | cannot currently prove                                                | Assignment and `let` do not identify escaping state.                                            | unenforceable                                | service, application                   | Stage 3 research               | Never ban all mutation. Admit local encapsulated mutation.                                     |
| Resource lifetime is explicit.                                                                                           | lifecycle     | covered by TSGO and convention in part                                | Known Scope and acquisition calls are visible. Ownership and release are not.                   | tsgo, convention                             | service, adapter, root                 | Stage 3 audit                  | Do not claim release from an acquire call alone.                                               |
| Application concurrency uses Effect primitives and bounded fiber lifetimes.                                              | concurrency   | cannot currently prove in general                                     | Some native Promise and timer forms are already visible. Fiber ownership is typed and semantic. | syntax, tsgo, unenforceable                  | operational roles                      | Stage 3 audit                  | Do not ban all callbacks, iterables, or native library protocols.                              |
| Only composition roots execute application runtimes.                                                                     | execution     | already sufficient for known APIs                                     | Existing rule oracle                                                                            | syntax, scope                                | composition-root, test                 | Stage 2                        | Publish aliases and custom runners as gaps.                                                    |
| Runtime adapters own vendor SDKs.                                                                                        | architecture  | new rule required                                                     | Resolved imports and configured adapter dependencies                                            | module-graph                                 | runtime-adapter                        | Stage 2                        | Application cannot import concrete adapter or SDK.                                             |
| Portable code has no runtime authority.                                                                                  | platform      | already sufficient for known APIs                                     | Existing runtime and authority classifiers                                                      | syntax, scope                                | portable groups                        | Stage 2                        | Unknown dynamic authority remains a gap.                                                       |
| Operational observability uses Effect logging or services.                                                               | observability | broaden under EffectTS profile                                        | Existing ambient console oracle                                                                 | syntax, scope                                | all operational roles                  | Stage 2                        | Effect logging output and Logger Layers remain outside syntax proof.                           |

## 5. Semantic mapping and enforcement owner

| Native or ordinary TypeScript concept         | EffectTS replacement                                              | Primary owner                                                | Repair class                                                |
| --------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Domain interface used as validated data       | Schema class or named Schema                                      | guidance, TSGO where typed                                   | choice-required                                             |
| Expected `throw`                              | Schema error in `Effect<A, E, R>`                                 | plugin syntax plus TSGO channel                              | refactor-required                                           |
| `JSON.parse` for external data                | `Schema.decodeUnknownEffect`                                      | plugin boundary syntax                                       | boundary-required                                           |
| Encoded-to-domain conversion                  | Schema transformation or decoder                                  | TSGO plus guidance                                           | choice-required                                             |
| Pure arithmetic and projection                | Plain TypeScript                                                  | no diagnostic                                                | none                                                        |
| Domain-facing `switch`                        | `Match.value`, tagged helpers, or a reusable `Match.type` matcher | optional plugin syntax rule plus typed Oxlint exhaustiveness | choice-required; refactor-required for complex control flow |
| Effectful function using native async         | `Effect.fn` and Effect combinators                                | plugin syntax                                                | refactor-required                                           |
| Ambient dependency                            | Effect or project service                                         | plugin ambient rule plus TSGO                                | refactor-required                                           |
| Concrete implementation                       | Layer                                                             | TSGO plus architecture guidance                              | refactor-required                                           |
| Shared mutable application variable           | Effect-managed state                                              | currently unenforceable                                      | refactor-required                                           |
| Manual acquire and cleanup                    | Scope and Effect resource APIs                                    | TSGO plus convention                                         | refactor-required                                           |
| Native Promise fan-out                        | Effect concurrency APIs                                           | plugin syntax                                                | refactor-required                                           |
| Ad hoc async iteration with lifetime concerns | Stream where appropriate                                          | guidance                                                     | choice-required                                             |
| Ambient console                               | Effect log or `Console`                                           | plugin syntax                                                | machine-applicable only in recognized generator case        |
| Raw environment access                        | `Config` with an explicit provider policy                         | plugin ambient rule plus role policy                         | boundary-required                                           |
| `Date.now` or `Math.random`                   | `Clock` or `Random`                                               | plugin ambient rule                                          | refactor-required                                           |
| Runtime `run*` in a library                   | composition-root execution                                        | plugin syntax                                                | refactor-required                                           |
| Vendor SDK import in application              | runtime-adapter service                                           | module graph                                                 | boundary-required                                           |

“None” in the repair column means the plain TypeScript form is admitted.

## 6. Stable code allocation

| Code      | Stability             | Invariant                                                |
| --------- | --------------------- | -------------------------------------------------------- |
| `EFT1101` | preserve              | Schema.Opaque declaration adds absent instance behavior    |
| `EFT1201` | preserve              | raw external JSON bypasses Schema decoding               |
| `EFT1301` | reserve for Stage 3   | optional domain-facing switch prefers Effect `Match`     |
| `EFT2101` | preserve              | ambient console bypasses Effect observability            |
| `EFT2201` | preserve              | ambient authority bypasses explicit capabilities         |
| `EFT2301` | preserve              | runtime authority crosses the declared platform          |
| `EFT3101` | preserve              | native async control flow bypasses Effect computation    |
| `EFT3201` | preserve              | throw bypasses typed expected failure                    |
| `EFT4101` | preserve              | runtime execution occurs outside an owner root           |
| `EFT5101` | reserve for Stage 2   | import edge lies outside the configured EffectTS closure |
| `EFT5102` | preserve; opt-in      | import uses a configured package barrel                    |
| `EFT9001` | reserve for Stage 2   | local exception grammar or scope is invalid              |
| `EFT9002` | reserve for Stage 2   | local exception is unused or stale                       |
| `EFT9011` | reserve for Stage 2   | file opt-out is invalid                                  |
| `EFT9021` | reserve for migration | diagnostic is absent from the baseline                   |
| `EFT9022` | reserve for migration | baseline entry is stale                                  |
| `EFT9031` | reserve for Stage 2   | broad native disable is rejected by the host audit       |
| `EFT9032` | reserve for Stage 2   | native disable targets a configured plugin alias         |

Codes are stable semantic identifiers. Rule names remain stable suppression and configuration identifiers.

## 7. Stage 2 oracle rows

The integrated tracer now contains 90 expected diagnostics. It extends the prior oracle instead of replacing it.

| Oracle slice                | Red                                            | Green                                            | Counterexample                                           |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| Console diagnostic          | Ambient `console.log` in Effect generator      | `yield* Console.log`                             | Shadowed local `console`                                 |
| Console fix, missing import | Ambient call with no Effect import             | Added named value import and `yield*`            | Existing `Console` declaration forces alias              |
| Console fix, import merge   | Existing Effect value import                   | One merged specifier                             | Type-only Effect import stays type-only                  |
| Promise computation         | `async`, `await`, `new Promise`, `Promise.all` | `Effect.fn`, generator, Effect combinators       | Adapter escape with exact reason                         |
| Typed failure               | Domain `throw`                                 | Schema error in typed Effect channel             | Test and defect policy remain explicit                   |
| Authority                   | `Date.now`, `Math.random`, `fetch`             | `Clock`, `Random`, injected service              | Local shadowing                                          |
| Execution                   | `Effect.runPromise` in application             | Platform `runMain` in root                       | Imported alias and wrapper gap documented                |
| Decoding                    | `JSON.parse` in external-data group            | `Schema.decodeUnknownEffect`                     | JSON parse in an excluded test group                     |
| Opaque runtime shape          | Instance method or field on `Schema.Opaque`      | Empty declaration shell or static helper            | Shadowed lookalike and non-Effect imports                 |
| Configured package barrel     | Named or namespace value import from selected root | Type-only root import or explicit module subpath   | Disabled unless the project selects packages and severity |
| Import closure              | Application imports raw SDK                    | Adapter imports declared SDK                     | Trusted pure package with exact reason                   |
| Local escape                | Valid exact directive and reason               | Matching diagnostic suppressed and inventoried   | Broad, duplicate, missing, unused, stale                 |
| Native-disable host gate    | Broad or plugin-targeted native disable        | Host audit rejects the bypass before conformance | A profile run without this gate cannot claim conformance |
| File opt-out                | Valid top-level directive and reason           | File excluded and inventoried                    | Late directive or missing reason                         |
| Project override            | One rule set to `off`                          | Exact configured dialect                         | No inferred weakening                                    |
| Machine output              | Every red case                                 | Structured fields and native origin              | Unsupported proof source rejected by schema              |
| Guidance                    | Generated invariant and replacement            | Skill reference matches registry                 | Drift check fails after metadata change                  |
| Fix idempotence             | Apply one safe fix                             | Second application changes zero bytes            | Refactor-required cases expose no fixer                  |
| Packed consumer             | Build clean tarball                            | Bun, Node, Deno-oriented declared surface loads  | Consumer never imports TypeScript source                 |

## 8. Explicit gaps and future evidence

The following observations must not become rules without new evidence:

| Gap                                      | Evidence needed before implementation                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| General Schema domain-model requirement  | An explicit project marker or a typed companion contract that identifies domain declarations  |
| Pure third-party dependency proof        | Maintained package metadata or an explicit reviewed trust catalog                             |
| Promise chain detection                  | Type-and-domain-aware companion hook for receiver provenance                                  |
| Automatic `switch` to `Match` conversion | Control-flow, comment-preservation, typed exhaustiveness, allocation, and idempotence oracles |
| Escaping mutable state                   | Control-flow or typed ownership evidence                                                      |
| Resource lifetime correctness            | Typed scope ownership and release semantics                                                   |
| Structured concurrency correctness       | Typed fiber parentage, Scope, interruption, and liveness evidence                             |
| Service and Layer completeness           | Typed service requirements plus project role graph                                            |
| Arbitrary wrapper authority              | Interprocedural provenance                                                                    |
| Runtime operational guarantees           | Runtime tests or operational evidence, not lint                                               |

Until then, publish the limitation. Do not add weak name-based diagnostics.
