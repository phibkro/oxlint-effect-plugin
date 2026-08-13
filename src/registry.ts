/**
 * Canonical executable knowledge for every shipped EffectTS rule.
 *
 * Configuration, diagnostics, explanations, documentation, repair metadata, and
 * agent guidance are projections of this registry.
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
  "no-opaque-instance-fields",
  "no-import-from-barrel-package",
] as const;
export type RuleName = (typeof RULE_NAMES)[number];

export type RuleFamily =
  | "modeling"
  | "failure"
  | "computation"
  | "capability"
  | "state"
  | "lifecycle"
  | "concurrency"
  | "execution"
  | "boundary"
  | "architecture"
  | "platform"
  | "observability";

export type EnforcementProofSource = "syntax" | "scope" | "module-graph" | "typed-oxlint" | "tsgo";
export type KnowledgeStatus = "convention" | "unenforceable";
export type ProofSource = EnforcementProofSource | KnowledgeStatus;
export type SuggestionApplicability =
  | "machine-applicable"
  | "choice-required"
  | "refactor-required"
  | "boundary-required";
export type Strictness = "recommended" | "strict";

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type EffectTSCode = `EFT${"1" | "2" | "3" | "4" | "5" | "9"}${Digit}${Digit}${Digit}`;

export interface Replacement {
  readonly from: string;
  readonly to: string;
  readonly applicability: SuggestionApplicability;
  readonly import?: {
    readonly module: string;
    readonly symbol: string;
  };
}

export interface EffectTSRuleDefinition {
  readonly rule: RuleName;
  readonly code: EffectTSCode;
  readonly family: RuleFamily;
  readonly invariant: string;
  readonly summary: string;
  readonly rationale: string;
  readonly proofSources: readonly EnforcementProofSource[];
  readonly defaultSeverity: "error" | "warn" | "off";
  readonly defaultOptions: Readonly<Record<string, unknown>>;
  readonly strictness: readonly Strictness[];
  readonly applicability: {
    readonly roles: readonly Role[];
    /** Any listed boundary activates the rule; an empty list is boundary-independent. */
    readonly boundaries: readonly Boundary[];
  };
  readonly diagnostic: {
    readonly message: string;
    readonly explanation: string;
    readonly help: string;
    readonly docs: string;
  };
  readonly replacements: readonly Replacement[];
  readonly suppression: "none" | "local-reasoned";
  readonly tsgo: {
    readonly overlap: readonly string[];
    readonly authority: string;
  };
  readonly limitations: readonly string[];
}

export interface ModuleGraphInvariantDefinition {
  readonly kind: "module-graph";
  readonly code: EffectTSCode;
  readonly family: "architecture";
  readonly invariant: "effectts-import-closure";
  readonly summary: string;
  readonly rationale: string;
  readonly proofSources: readonly ["module-graph"];
  readonly diagnostic: EffectTSRuleDefinition["diagnostic"];
  readonly replacements: readonly Replacement[];
  readonly limitations: readonly string[];
}

const ALL_BUT_TEST: readonly Role[] = [
  "pure-library",
  "effect-library",
  "service",
  "application",
  "composition-root",
  "runtime-adapter",
];

const ALL_ROLES: readonly Role[] = [...ALL_BUT_TEST, "test"];

export const RULE_REGISTRY: readonly EffectTSRuleDefinition[] = [
  {
    rule: "no-ambient-console",
    code: "EFT2101",
    family: "observability",
    invariant: "effect-owned-observability",
    summary: "Ambient console access is outside EffectTS.",
    rationale:
      "Ambient console output bypasses Effect logging and Console capabilities, including levels, spans, structured output, and redaction.",
    proofSources: ["syntax", "scope"],
    defaultSeverity: "error",
    defaultOptions: {},
    strictness: ["recommended", "strict"],
    applicability: { roles: ALL_BUT_TEST, boundaries: [] },
    diagnostic: {
      message: "Ambient console access is outside EffectTS.",
      explanation:
        "Observability must remain inside Effect capabilities and configured Logger layers.",
      help: "Use Effect.log*, effect/Console, or an injected logging service.",
      docs: "docs/rules/no-ambient-console.md",
    },
    replacements: [
      {
        from: "console.log",
        to: "yield* Console.log",
        import: { module: "effect", symbol: "Console" },
        applicability: "machine-applicable",
      },
    ],
    suppression: "local-reasoned",
    tsgo: {
      overlap: ["globalConsole", "globalConsoleInEffect"],
      authority:
        "This rule owns role-scoped EffectTS console policy and its bounded repair; keep the overlapping @effect/tsgo syntax diagnostics off.",
    },
    limitations: [
      "Aliases and computed dynamic access escape syntax analysis.",
      "The automatic repair is limited to direct console.log statements inside recognized Effect generators.",
    ],
  },
  {
    rule: "no-ambient-authority",
    code: "EFT2201",
    family: "capability",
    invariant: "explicit-operational-authority",
    summary: "Ambient operational authority is outside EffectTS.",
    rationale:
      "Clock, randomness, environment, network, filesystem, process, and runtime authority belong to declared Effect or project services.",
    proofSources: ["syntax", "scope"],
    defaultSeverity: "error",
    defaultOptions: {},
    strictness: ["recommended", "strict"],
    applicability: {
      roles: ["pure-library", "effect-library", "service", "application"],
      boundaries: [],
    },
    diagnostic: {
      message: "Ambient operational authority is outside EffectTS.",
      explanation:
        "Hidden authority cannot be replaced by tests or selected at the composition root.",
      help: "Inject Clock, Random, Config, a platform service, or a project service.",
      docs: "docs/rules/no-ambient-authority.md",
    },
    replacements: [],
    suppression: "local-reasoned",
    tsgo: {
      overlap: [
        "cryptoRandomUUID",
        "cryptoRandomUUIDInEffect",
        "globalDate",
        "globalDateInEffect",
        "globalFetch",
        "globalFetchInEffect",
        "globalRandom",
        "globalRandomInEffect",
        "globalTimers",
        "globalTimersInEffect",
        "nodeBuiltinImport",
        "processEnv",
        "processEnvInEffect",
      ],
      authority:
        "This rule owns role-scoped ambient-authority policy; keep overlapping @effect/tsgo syntax diagnostics off while typed Effect facts remain upstream-owned.",
    },
    limitations: ["Aliases, wrappers, and computed dynamic access escape syntax analysis."],
  },
  {
    rule: "no-cross-runtime",
    code: "EFT2301",
    family: "platform",
    invariant: "declared-runtime-authority",
    summary: "Runtime authority crosses the declared platform.",
    rationale:
      "A platform domain admits only its own built-ins, globals, and official platform layers.",
    proofSources: ["syntax", "scope"],
    defaultSeverity: "error",
    defaultOptions: {},
    strictness: ["recommended", "strict"],
    applicability: { roles: [...ALL_BUT_TEST, "test"], boundaries: [] },
    diagnostic: {
      message: "Runtime authority crosses the declared platform.",
      explanation: "Compatibility APIs from another runtime are not evidence of portability.",
      help: "Move the authority to a matching runtime adapter or select the correct platform domain.",
      docs: "docs/rules/no-cross-runtime.md",
    },
    replacements: [],
    suppression: "local-reasoned",
    tsgo: {
      overlap: ["nodeBuiltinImport"],
      authority:
        "This rule owns declared-platform compatibility; @effect/tsgo's Node import diagnostic has no project platform context and stays off.",
    },
    limitations: ["Computed imports and runtime feature detection escape syntax analysis."],
  },
  {
    rule: "no-premature-execution",
    code: "EFT4101",
    family: "execution",
    invariant: "composition-root-execution",
    summary: "Effect execution occurs outside its composition root.",
    rationale:
      "Libraries describe Effects; only composition roots select final Layers and execute programs.",
    proofSources: ["syntax", "scope"],
    defaultSeverity: "error",
    defaultOptions: {},
    strictness: ["recommended", "strict"],
    applicability: {
      roles: ["pure-library", "effect-library", "service", "application", "runtime-adapter"],
      boundaries: [],
    },
    diagnostic: {
      message: "Effect execution occurs outside its composition root.",
      explanation:
        "Early execution hides requirements and fixes runtime ownership too low in the graph.",
      help: "Return the Effect and execute it from the designated composition root.",
      docs: "docs/rules/no-premature-execution.md",
    },
    replacements: [],
    suppression: "local-reasoned",
    tsgo: {
      overlap: [
        "floatingEffect",
        "missingEffectContext",
        "missingEffectError",
        "runEffectInsideEffect",
        "strictEffectProvide",
      ],
      authority:
        "@effect/tsgo owns Effect types and requirement closure; this rule owns the syntactic execution site.",
    },
    limitations: ["Execution reached through re-exports or value aliases escapes syntax analysis."],
  },
  {
    rule: "no-native-promise-control-flow",
    code: "EFT3101",
    family: "computation",
    invariant: "effect-owned-asynchronous-computation",
    summary: "Native async control flow is outside EffectTS.",
    rationale:
      "Native Promise control flow bypasses Effect failure, requirement, interruption, resource, and structured concurrency semantics.",
    proofSources: ["syntax", "scope"],
    defaultSeverity: "error",
    defaultOptions: {},
    strictness: ["strict"],
    applicability: {
      roles: ["effect-library", "service", "application", "runtime-adapter"],
      boundaries: [],
    },
    diagnostic: {
      message: "Native async control flow is outside EffectTS.",
      explanation:
        "Asynchronous application computation must expose Effect errors, requirements, and interruption.",
      help: "Use Effect.fn and Effect combinators; lift vendor Promises at a runtime-adapter boundary.",
      docs: "docs/rules/no-native-promise-control-flow.md",
    },
    replacements: [],
    suppression: "local-reasoned",
    tsgo: {
      overlap: ["asyncFunction", "lazyPromiseInEffectSync", "newPromise", "promiseInEffectSuccess"],
      authority:
        "@effect/tsgo owns typed Promise values and contextual Effect semantics; this rule owns role-scoped native Promise syntax, so direct syntax duplicates stay off upstream.",
    },
    limitations: ["Arbitrary typed then, catch, and finally chains remain unenforceable."],
  },
  {
    rule: "no-raw-json-parse",
    code: "EFT1201",
    family: "boundary",
    invariant: "schema-owned-external-decoding",
    summary: "Raw external JSON decoding bypasses Schema.",
    rationale:
      "External JSON must cross an explicit Effect Schema decoding seam instead of becoming unvalidated data through JSON.parse.",
    proofSources: ["syntax", "scope"],
    defaultSeverity: "error",
    defaultOptions: {},
    strictness: ["recommended", "strict"],
    applicability: { roles: ALL_BUT_TEST, boundaries: ["external-data"] },
    diagnostic: {
      message: "Raw external JSON decoding bypasses Schema.",
      explanation:
        "External representations remain unknown until a declared Schema validates and transforms them.",
      help: "Decode with Schema.decodeUnknownEffect at the external-data boundary.",
      docs: "docs/rules/no-raw-json-parse.md",
    },
    replacements: [],
    suppression: "local-reasoned",
    tsgo: {
      overlap: ["preferSchemaOverJson"],
      authority:
        "This rule owns external-data boundary policy for JSON.parse; keep the broader @effect/tsgo syntax suggestion off when this profile rule applies.",
    },
    limitations: ["Aliases, wrappers, other syntaxes, and post-parse value flow escape analysis."],
  },
  {
    rule: "no-untyped-throw",
    code: "EFT3201",
    family: "failure",
    invariant: "typed-expected-failure",
    summary: "Throw-based expected failure is outside EffectTS.",
    rationale:
      "Throw erases expected application failure from the Effect error channel and caller contract.",
    proofSources: ["syntax"],
    defaultSeverity: "error",
    defaultOptions: {},
    strictness: ["strict"],
    applicability: {
      roles: ["pure-library", "effect-library", "service", "application"],
      boundaries: [],
    },
    diagnostic: {
      message: "Throw-based expected failure is outside EffectTS.",
      explanation:
        "Expected failures must remain visible as Schema-backed values in Effect<A, E, R>.",
      help: "Define a Schema.TaggedErrorClass and fail through the Effect error channel.",
      docs: "docs/rules/no-untyped-throw.md",
    },
    replacements: [],
    suppression: "local-reasoned",
    tsgo: {
      overlap: ["missingEffectError"],
      authority:
        "@effect/tsgo owns typed error-channel facts; this rule owns the role-scoped throw syntax site.",
    },
    limitations: ["The syntax rule cannot distinguish expected failure from a defect or rethrow."],
  },
  {
    rule: "no-opaque-instance-fields",
    code: "EFT1101",
    family: "modeling",
    invariant: "schema-opaque-runtime-shape",
    summary: "A Schema.Opaque declaration defines instance behavior absent from decoded values.",
    rationale:
      "Schema.Opaque changes nominal typing without constructing class instances; decoded values retain the wrapped schema's runtime representation.",
    proofSources: ["syntax", "scope"],
    defaultSeverity: "error",
    defaultOptions: {},
    strictness: ["recommended", "strict"],
    applicability: { roles: ALL_ROLES, boundaries: [] },
    diagnostic: {
      message: "A Schema.Opaque declaration defines instance behavior absent from decoded values.",
      explanation:
        "Opaque schemas preserve structural runtime behavior, so decoded values do not receive instance fields or methods from the declaration shell.",
      help: "Remove instance members; use pure functions or an explicit schema transformation for constructed runtime behavior.",
      docs: "docs/rules/no-opaque-instance-fields.md",
    },
    replacements: [],
    suppression: "local-reasoned",
    tsgo: {
      overlap: [],
      authority:
        "This syntax-and-scope rule enforces the documented Schema.Opaque runtime-shape contract; @effect/tsgo has no reviewed overlapping diagnostic.",
    },
    limitations: [
      "Re-exported Schema bindings, wrapper functions, and inherited instance members escape this syntax analysis.",
    ],
  },
  {
    rule: "no-import-from-barrel-package",
    code: "EFT5102",
    family: "architecture",
    invariant: "configured-package-import-topology",
    summary: "A named value or namespace import uses a configured package barrel.",
    rationale:
      "For packages explicitly selected by the project, imports must name the owning module subpath instead of entering through the package barrel.",
    proofSources: ["syntax"],
    defaultSeverity: "off",
    defaultOptions: { packageNames: [] },
    strictness: ["recommended", "strict"],
    applicability: { roles: ALL_ROLES, boundaries: [] },
    diagnostic: {
      message: "A value import uses a configured package barrel.",
      explanation:
        "Package import topology is an explicit project policy, independent of EffectTS import closure and package purity.",
      help: "Import the owning module subpath selected by the package's public exports.",
      docs: "docs/rules/no-import-from-barrel-package.md",
    },
    replacements: [],
    suppression: "local-reasoned",
    tsgo: {
      overlap: [],
      authority:
        "This optional syntax policy is adapted from @effect/eslint-plugin; no typed diagnostic ownership is claimed.",
    },
    limitations: [
      "Configured package names are exact strings; the rule does not resolve package exports, relative barrels, re-exports, or subpath validity.",
      "No automatic fix is offered because a package root export does not prove an equivalent module namespace subpath.",
    ],
  },
];

export const IMPORT_CLOSURE_DEFINITION: ModuleGraphInvariantDefinition = {
  kind: "module-graph",
  code: "EFT5101",
  family: "architecture",
  invariant: "effectts-import-closure",
  summary: "An import edge lies outside the configured EffectTS closure.",
  rationale:
    "Governed modules may import Effect, admitted project modules, reasoned trusted pure packages, or declared adapter packages.",
  proofSources: ["module-graph"],
  diagnostic: {
    message: "An import edge lies outside the configured EffectTS closure.",
    explanation:
      "Capability-bearing packages must not become ambient dependencies of application code.",
    help: "Move the package behind a runtime adapter, or record a reasoned trusted-pure dependency.",
    docs: "docs/import-closure.md",
  },
  replacements: [],
  limitations: [
    "Trust is a reviewed project assertion, not static proof of package purity.",
    "Dynamic module provenance remains outside the Stage 2 tracer.",
  ],
};

export type EffectTSKnowledgeDefinition = EffectTSRuleDefinition | ModuleGraphInvariantDefinition;

export const EFFECTTS_KNOWLEDGE: readonly EffectTSKnowledgeDefinition[] = [
  ...RULE_REGISTRY,
  IMPORT_CLOSURE_DEFINITION,
];

const createLookup = <Value>(
  entries: readonly (readonly [string, Value])[],
): Readonly<Record<string, Value>> => {
  const lookup = Object.create(null) as Record<string, Value>;
  for (const [key, value] of entries) lookup[key] = value;
  return lookup;
};

export const RULE_INFO_BY_NAME: Readonly<Record<RuleName, EffectTSRuleDefinition>> = createLookup(
  RULE_REGISTRY.map((info) => [info.rule, info] as const),
);

export const RULE_INFO_BY_CODE: Readonly<Partial<Record<EffectTSCode, EffectTSRuleDefinition>>> =
  createLookup(RULE_REGISTRY.map((info) => [info.code, info] as const));

export const KNOWLEDGE_INFO_BY_CODE: Readonly<
  Partial<Record<EffectTSCode, EffectTSKnowledgeDefinition>>
> = createLookup(EFFECTTS_KNOWLEDGE.map((info) => [info.code, info] as const));
