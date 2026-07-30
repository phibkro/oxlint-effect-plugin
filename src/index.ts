/**
 * @phibkro/oxlint-effect-plugin — reusable Oxlint JavaScript plugin for explicit
 * Effect v4 architecture, capability, runtime-platform, and semantic-boundary
 * policies.
 *
 * Default export: ESLint-v9-compatible plugin object (Oxlint `jsPlugins`).
 * Named exports: individual rules, `recommended`/`strict` presets, domain
 * metadata, rule metadata, and the typed configuration builder.
 *
 * Diagnostics are syntax and scope analysis only, never type-aware proof;
 * type-aware Effect diagnostics belong to the `@effect/tsgo` companion.
 */

import type { Plugin } from "./plugin-api.js";
import { noAmbientAuthority } from "./rules/no-ambient-authority.js";
import { noAmbientConsole } from "./rules/no-ambient-console.js";
import { noCrossRuntime } from "./rules/no-cross-runtime.js";
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
};

export {
  TECHNOLOGIES,
  ROLES,
  PLATFORMS,
  BOUNDARIES,
  DOMAIN_DESCRIPTIONS,
  describeSelection,
} from "./domains.js";
export type { Technology, Role, Platform, Boundary, DomainSelection } from "./domains.js";

export { RULE_NAMES, RULE_REGISTRY, RULE_INFO_BY_NAME } from "./registry.js";
export type { RuleName, RuleFamily, RuleInfo } from "./registry.js";

export {
  expandDomains,
  expandGroupRules,
  DEFAULT_PLUGIN_NAME,
  DEFAULT_PLUGIN_SPECIFIER,
} from "./config/expand.js";
export type {
  DomainGroup,
  ExpandInput,
  OxlintConfigFragment,
  OxlintOverride,
  Severity,
  Strictness,
} from "./config/expand.js";

export { recommended, strict } from "./config/presets.js";

export { auditNativeDisableDirectives } from "./suppression-audit.js";
export type { NativeDisableFinding, SuppressionAuditOptions } from "./suppression-audit.js";

export { PLUGIN_VERSION } from "./version.js";
