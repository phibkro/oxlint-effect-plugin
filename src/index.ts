/**
 * @phibkro/oxlint-effect-plugin — compiled EffectTS enforcement layer.
 *
 * The default export is the Oxlint JavaScript plugin. Named exports provide
 * profile expansion, semantic knowledge, structured diagnostics, import
 * closure, reasoned escape auditing, and stable explanation interfaces.
 *
 * Custom rules provide syntax and scope evidence, never type-aware proof.
 * Effect-specific typed diagnostics remain owned by @effect/tsgo.
 */

import type { Plugin } from "./plugin-api.js";
import { noAmbientAuthority } from "./rules/no-ambient-authority.js";
import { noAmbientConsole } from "./rules/no-ambient-console.js";
import { noCrossRuntime } from "./rules/no-cross-runtime.js";
import { noImportFromBarrelPackage } from "./rules/no-import-from-barrel-package.js";
import { noOpaqueInstanceFields } from "./rules/no-opaque-instance-fields.js";
import { noNativePromiseControlFlow } from "./rules/no-native-promise-control-flow.js";
import { noPrematureExecution } from "./rules/no-premature-execution.js";
import { noRawJsonParse } from "./rules/no-raw-json-parse.js";
import { noUntypedThrow } from "./rules/no-untyped-throw.js";
import { DEFAULT_PLUGIN_NAME } from "./config/expand.js";
import { PLUGIN_VERSION } from "./version.js";

export const plugin: Plugin = {
  meta: {
    name: DEFAULT_PLUGIN_NAME,
    version: PLUGIN_VERSION,
  },
  rules: {
    "no-ambient-console": noAmbientConsole,
    "no-ambient-authority": noAmbientAuthority,
    "no-cross-runtime": noCrossRuntime,
    "no-premature-execution": noPrematureExecution,
    "no-native-promise-control-flow": noNativePromiseControlFlow,
    "no-raw-json-parse": noRawJsonParse,
    "no-untyped-throw": noUntypedThrow,
    "no-opaque-instance-fields": noOpaqueInstanceFields,
    "no-import-from-barrel-package": noImportFromBarrelPackage,
  },
};

export default plugin;

export {
  noAmbientConsole,
  noAmbientAuthority,
  noCrossRuntime,
  noPrematureExecution,
  noNativePromiseControlFlow,
  noRawJsonParse,
  noUntypedThrow,
  noOpaqueInstanceFields,
  noImportFromBarrelPackage,
};

export { ROLES, PLATFORMS, BOUNDARIES, DOMAIN_DESCRIPTIONS } from "./domains.js";
export type { Role, Platform, Boundary, DomainSelection } from "./domains.js";

export {
  EFFECTTS_KNOWLEDGE,
  IMPORT_CLOSURE_DEFINITION,
  KNOWLEDGE_INFO_BY_CODE,
  RULE_INFO_BY_CODE,
  RULE_INFO_BY_NAME,
  RULE_NAMES,
  RULE_REGISTRY,
} from "./registry.js";
export type {
  EffectTSCode,
  EffectTSKnowledgeDefinition,
  EffectTSRuleDefinition,
  EnforcementProofSource,
  KnowledgeStatus,
  ModuleGraphInvariantDefinition,
  ProofSource,
  Replacement,
  RuleFamily,
  RuleName,
  Strictness,
  SuggestionApplicability,
} from "./registry.js";

export {
  effect,
  importClosurePolicy,
  expandGroupRules,
  DEFAULT_PLUGIN_NAME,
  DEFAULT_PLUGIN_SPECIFIER,
} from "./config/expand.js";
export type {
  EffectConfigInput,
  RuleGroup,
  ImportClosureGroup,
  ImportClosurePolicy,
  OxlintConfigFragment,
  OxlintOverride,
  ExpansionPolicy,
  Severity,
  TrustedDependency,
} from "./config/expand.js";

export { auditNativeDisableDirectives } from "./suppression-audit.js";
export type { NativeDisableFinding, SuppressionAuditOptions } from "./suppression-audit.js";

export {
  auditEffectTSEscapes,
  FILE_DIRECTIVE_MARKER,
  INVALID_FILE_OPTOUT_CODE,
  INVALID_LOCAL_EXCEPTION_CODE,
  LOCAL_DIRECTIVE_MARKER,
  matchSuppressedDiagnostics,
  PACKAGE_MARKER,
  STALE_LOCAL_EXCEPTION_CODE,
} from "./suppression.js";
export type {
  ByteRange,
  CommentToken,
  EscapeAuditInput,
  EscapeAuditResult,
  EscapeFinding,
  EscapeFindingCode,
  EscapeInventory,
  FileOptOut,
  FileOptOutDirective,
  LocalDirective,
  LocalException,
  RangeInput,
  RuleDiagnostic,
  SuppressionMatch,
  SuppressionMatchResult,
  SyntaxTarget,
} from "./suppression.js";

export { translateOxlintJson } from "./diagnostics.js";
export type {
  AuditInvariant,
  DiagnosticSubject,
  EffectTSDiagnostic,
  EffectTSJsonOutput,
  EffectTSSuggestion,
  OxlintJsonDiagnostic,
  OxlintJsonOutput,
  OxlintJsonSpan,
  Span,
  TextEdit,
  TranslateOxlintOptions,
} from "./diagnostics.js";

export { explainEffectTS } from "./explain.js";
export type { EffectTSExplanation } from "./explain.js";

export { evaluateImportClosure } from "./import-closure.js";
export type {
  ImportClosureInput,
  ImportClosureViolation,
  ImportEdge,
  ImportTarget,
} from "./import-closure.js";

export { planGitHubReview, projectGitHubFindings } from "./github-review.js";
export type {
  ChangedLineRange,
  ExistingEffxComment,
  GitHubCommentOperation,
  GitHubFinding,
  GitHubReviewPlan,
  PlanGitHubReviewInput,
} from "./github-review.js";

export {
  REVIEWED_EFFECT_VERSION,
  classifyEffectRepository,
  planMechanicalEffectMigration,
} from "./effect-version.js";
export type {
  ClassifyEffectRepositoryInput,
  DependencySection,
  EffectMigrationGuide,
  EffectMigrationReminder,
  EffectRepositoryClassification,
  EffectRepositoryClassificationResult,
  EffectRepositoryObservation,
  ManifestEdit,
  MechanicalEffectMigrationInput,
  MechanicalEffectMigrationPlan,
  PackageManifestObservation,
} from "./effect-version.js";

export { buildAccountInventory } from "./account-inventory.js";
export type {
  AccountInventory,
  AccountInventoryCompleteness,
  AccountInventoryCounts,
  AccountInventoryEntry,
  AccountInventoryExcludedIdentities,
  AccountInventoryInput,
  AccountInventoryResult,
  AccountRepositoryObservation,
  RepositoryObservation,
} from "./account-inventory.js";

export { PLUGIN_VERSION } from "./version.js";
