/**
 * Rule metadata registry — the single authoritative record of each rule's
 * family, applicability, rationale, limitation, and TSGO overlap.
 *
 * Rule documentation and the preset expansion are derived from this table;
 * nothing else may restate these facts.
 */

import type { Boundary, Role } from "./domains.js";

export const RULE_NAMES = [
  "no-ambient-console",
  "no-ambient-authority",
  "no-cross-runtime",
  "no-premature-execution",
  "no-native-promise-control-flow",
  "no-raw-json-parse",
  "no-untyped-throw",
] as const;
export type RuleName = (typeof RULE_NAMES)[number];

export type RuleFamily =
  | "observability-capability"
  | "ambient-capability"
  | "platform-portability"
  | "execution-topology"
  | "external-decoding"
  | "typed-failure";

export interface RuleInfo {
  readonly name: RuleName;
  readonly family: RuleFamily;
  readonly defaultSeverity: "error" | "warn";
  /** Roles for which the config expansion enables the rule. */
  readonly appliesToRoles: readonly Role[];
  /** Boundary that must be declared for the expansion to enable the rule. */
  readonly requiresBoundary: Boundary | null;
  /** Rules only enabled by the strict preset (not recommended). */
  readonly strictOnly: boolean;
  readonly rationale: string;
  readonly limitation: string;
  /** Overlapping type-aware @effect/tsgo diagnostics, and who is authoritative. */
  readonly tsgoOverlap: string | null;
}

const ALL_BUT_TEST: readonly Role[] = [
  "pure-library",
  "effect-library",
  "service",
  "application",
  "composition-root",
  "runtime-adapter",
];

export const RULE_REGISTRY: readonly RuleInfo[] = [
  {
    name: "no-ambient-console",
    family: "observability-capability",
    defaultSeverity: "error",
    appliesToRoles: ALL_BUT_TEST,
    requiresBoundary: null,
    strictOnly: false,
    rationale:
      "Ambient console output bypasses the Effect observability capability (levels, spans, structured output, redaction). Severe in Effect-bearing operational code; a genuinely developer-only statement carries one targeted nonempty `dev only:` suppression.",
    limitation:
      "Detects ambient `console` member access and statically named `globalThis`/`window`/`self.console` (including computed string properties); aliased references (`const c = console`) escape syntax analysis. Native oxlint/eslint disables bypass rule execution, so the exported independent suppression audit must be a host gate.",
    tsgoOverlap: null,
  },
  {
    name: "no-ambient-authority",
    family: "ambient-capability",
    defaultSeverity: "error",
    appliesToRoles: ["pure-library", "effect-library", "service", "application"],
    requiresBoundary: null,
    strictOnly: false,
    rationale:
      "Clock, random, cryptographic, network, timer, environment, filesystem, process, and runtime authority belong to declared Effect services so tests and platforms can replace them. Deterministic `new Date(capturedMilliseconds)` is admitted; observations such as `new Date()`/`Date.now()` are not, and wrapping them in a thunk does not surface the hidden authority to the Effect environment.",
    limitation:
      "Syntax/scope detection over known ambient globals and authority-bearing module imports; authority reached through aliases, dependency wrappers, or dynamic access escapes analysis. Composition roots and runtime adapters are exempt by role.",
    tsgoOverlap: null,
  },
  {
    name: "no-cross-runtime",
    family: "platform-portability",
    defaultSeverity: "error",
    appliesToRoles: [...ALL_BUT_TEST, "test"],
    requiresBoundary: null,
    strictOnly: false,
    rationale:
      "A declared runtime-platform domain admits only its own built-ins, globals, and platform layers. Compatibility APIs provided by another runtime are not silently portable, and official platform live layers belong only to a matching composition-root or runtime-adapter.",
    limitation:
      "Classifies static import specifiers and runtime-identifying globals; computed dynamic imports and feature detection escape analysis. `self`/`navigator`/`location` are admitted in both browser and web-worker domains.",
    tsgoOverlap: null,
  },
  {
    name: "no-premature-execution",
    family: "execution-topology",
    defaultSeverity: "error",
    appliesToRoles: ["pure-library", "effect-library", "service", "application", "runtime-adapter"],
    requiresBoundary: null,
    strictOnly: false,
    rationale:
      "Libraries may describe Effects but only composition roots may execute them or provide the final platform environment. Layer construction and internal service composition remain admitted.",
    limitation:
      "Recognizes namespace and named Effect/ManagedRuntime/platform imports by resolved lexical binding identity; execution reached through re-exports or value aliases escapes analysis. When `no-native-promise-control-flow` is active for the same files, `Effect.runPromise*` is reported by that rule alone.",
    tsgoOverlap:
      "@effect/tsgo detects floating Effects, leaking requirements, and strict provision type-aware; it is authoritative for whether requirements are actually closed. This rule is authoritative for the syntactic execution site.",
  },
  {
    name: "no-native-promise-control-flow",
    family: "execution-topology",
    defaultSeverity: "error",
    appliesToRoles: ["effect-library", "service", "application", "runtime-adapter"],
    requiresBoundary: null,
    strictOnly: true,
    rationale:
      "Native Promise control flow (async/await, new Promise, Promise combinators, resolve/reject) bypasses Effect's structured concurrency, typed failures, and interruption. Runtime adapters may use native Promise mechanics only inside Effect.tryPromise, Effect.promise for genuinely non-rejecting promises, or Effect.async with cancellation mapped where available; composition roots perform final Effect.runPromise; tests may execute explicitly.",
    limitation:
      "Owns high-confidence AST/scope cases only: async/await and top-level for-await syntax, ambient/globalThis Promise construction and static control flow, direct immutable Promise aliases, and imported Effect.runPromise* variants. Promise type references and declared external Promise signatures are never diagnosed. The reviewed typed companions currently expose no domain-aware general `.then`/`.catch`/`.finally` policy, so arbitrary typed chains remain an explicit gap.",
    tsgoOverlap:
      "@effect/tsgo is authoritative for Effect-specific typed promise diagnostics such as lazyPromiseInEffectSync; this rule is authoritative for the listed Promise syntax and ambient globals. A general typed chain policy requires a future type-and-domain-aware companion hook.",
  },
  {
    name: "no-raw-json-parse",
    family: "external-decoding",
    defaultSeverity: "error",
    appliesToRoles: [...ALL_BUT_TEST],
    requiresBoundary: "external-data",
    strictOnly: false,
    rationale:
      "External JSON must cross an explicit Effect Schema decoding seam instead of raw JSON.parse. Only JSON syntax is claimed; other syntaxes require their own parser/Schema seam.",
    limitation:
      "Flags ambient `JSON.parse` only; parsing behind wrappers or other syntaxes escapes analysis. Lint enforces the seam, it does not validate data.",
    tsgoOverlap: null,
  },
  {
    name: "no-untyped-throw",
    family: "typed-failure",
    defaultSeverity: "error",
    appliesToRoles: ["pure-library", "effect-library", "service", "application"],
    requiresBoundary: null,
    strictOnly: true,
    rationale:
      "In roles whose contract is total or whose failures belong in the Effect error channel, `throw` erases failure typing. This is not a JavaScript-wide ban: composition roots, runtime adapters, and tests keep their untyped-boundary contracts.",
    limitation:
      "Purely syntactic: every `throw` in an enabled role is reported, including rethrow helpers; narrow the file group or use Effect.die for defects instead.",
    tsgoOverlap:
      "@effect/tsgo tracks unknown error values in Effect types and is authoritative for error-channel typing; this rule is authoritative for the `throw` syntax site.",
  },
];

export const RULE_INFO_BY_NAME: ReadonlyMap<RuleName, RuleInfo> = new Map(
  RULE_REGISTRY.map((info) => [info.name, info]),
);
