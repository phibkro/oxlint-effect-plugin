/**
 * Typed configuration builder: expands declared domain intersections into
 * ordinary Oxlint rule configuration and file overrides.
 *
 * Domains determine applicability, not severity: a rule is enabled for a file
 * group exactly when the group's declared role (and, where required,
 * boundary) is in the rule's applicability set. Severity comes from the rule
 * registry defaults and may be overridden per group by the consumer.
 */

import type { Boundary, Platform, Role } from "../domains.js";
import { BOUNDARIES, PLATFORMS, ROLES } from "../domains.js";
import type { RuleName, Strictness } from "../registry.js";
import { RULE_INFO_BY_NAME, RULE_NAMES, RULE_REGISTRY } from "../registry.js";

export const DEFAULT_PLUGIN_NAME = "effect";
export const DEFAULT_PLUGIN_SPECIFIER = "@phibkro/oxlint-effect-plugin";

export type Severity = "error" | "warn" | "off";

const STRICTNESSES = ["recommended", "strict"] as const satisfies readonly Strictness[];
const SEVERITIES = ["error", "warn", "off"] as const satisfies readonly Severity[];
const EXPANSION_OWNED_OPTION_KEYS = [
  "role",
  "platform",
  "boundaries",
  "promiseRuleActive",
  "technology",
  "profile",
  "preset",
] as const;

export interface RuleGroup {
  /** Oxlint glob patterns this group governs. */
  readonly files: readonly string[];
  readonly role: Role;
  readonly platform: Platform;
  readonly boundaries?: readonly Boundary[];
  /** Select a smaller rule collection for this group. */
  readonly strictness?: Strictness;
  /** Per-rule severity overrides; applicability context never changes severity. */
  readonly severityOverrides?: Partial<Readonly<Record<RuleName, Severity>>>;
  /** Raw package roots this runtime adapter is responsible for binding. */
  readonly adapterDependencies?: readonly string[];
  /** Extra rule-specific options merged into the expanded options object. */
  readonly ruleOptions?: Partial<Readonly<Record<RuleName, Readonly<Record<string, unknown>>>>>;
}

export interface EffectConfigInput {
  readonly strictness?: Strictness;
  readonly trustedPureDependencies?: readonly TrustedDependency[];
  readonly rules?: Partial<Readonly<Record<RuleName, Severity>>>;
  readonly groups: readonly RuleGroup[];
  readonly pluginName?: string;
  readonly pluginSpecifier?: string;
}

export interface TrustedDependency {
  readonly specifier: string;
  readonly reason: string;
}

export interface ImportClosureGroup {
  readonly files: readonly string[];
  readonly role: Role;
  readonly platform: Platform;
  readonly adapterDependencies: readonly string[];
}

export interface ImportClosurePolicy {
  readonly trustedPureDependencies: readonly TrustedDependency[];
  readonly groups: readonly ImportClosureGroup[];
}

export interface OxlintOverride {
  readonly files: readonly string[];
  readonly rules: Readonly<Record<string, unknown>>;
}

export interface OxlintConfigFragment {
  readonly jsPlugins: readonly { readonly name: string; readonly specifier: string }[];
  readonly rules: Readonly<Record<string, unknown>>;
  readonly overrides: readonly OxlintOverride[];
}
function assertKnownRuleKeys(
  record: Readonly<Record<string, unknown>> | undefined,
  owner: string,
): void {
  if (record === undefined) return;
  for (const rule of Object.keys(record)) {
    if (!(RULE_NAMES as readonly string[]).includes(rule)) {
      throw new Error(
        `oxlint-effect-plugin: ${owner} declares unknown rule ${JSON.stringify(rule)}`,
      );
    }
  }
}

function assertSeverityMap(
  record: Readonly<Record<string, unknown>> | undefined,
  owner: string,
): void {
  assertKnownRuleKeys(record, owner);
  for (const [rule, severity] of Object.entries(record ?? {})) {
    if (!(SEVERITIES as readonly unknown[]).includes(severity)) {
      throw new Error(
        `oxlint-effect-plugin: ${owner} declares invalid severity ${JSON.stringify(severity)} for ${rule}`,
      );
    }
  }
}

function assertValidGroup(group: RuleGroup, index: number): void {
  if (!Array.isArray(group.files) || group.files.length === 0) {
    throw new Error(`oxlint-effect-plugin: group ${index} declares no files`);
  }
  if (!(ROLES as readonly unknown[]).includes(group.role)) {
    throw new Error(`oxlint-effect-plugin: group ${index} declares unknown role "${group.role}"`);
  }
  if (!(PLATFORMS as readonly unknown[]).includes(group.platform)) {
    throw new Error(
      `oxlint-effect-plugin: group ${index} declares unknown platform "${group.platform}"`,
    );
  }
  if (
    group.strictness !== undefined &&
    !(STRICTNESSES as readonly unknown[]).includes(group.strictness)
  ) {
    throw new Error(
      `oxlint-effect-plugin: group ${index} declares unknown strictness ${JSON.stringify(group.strictness)}`,
    );
  }
  for (const boundary of group.boundaries ?? []) {
    if (!(BOUNDARIES as readonly unknown[]).includes(boundary)) {
      throw new Error(
        `oxlint-effect-plugin: group ${index} declares unknown boundary "${boundary}"`,
      );
    }
  }
  const adapterDependencies = group.adapterDependencies ?? [];
  if (adapterDependencies.length > 0 && group.role !== "runtime-adapter") {
    throw new Error(
      `oxlint-effect-plugin: group ${index} declares adapterDependencies but its role is not "runtime-adapter"`,
    );
  }
  const seenAdapterDependencies = new Set<string>();
  for (const dependency of adapterDependencies) {
    if (dependency.trim().length === 0) {
      throw new Error(`oxlint-effect-plugin: group ${index} declares an empty adapter dependency`);
    }
    if (seenAdapterDependencies.has(dependency)) {
      throw new Error(
        `oxlint-effect-plugin: group ${index} duplicates adapter dependency ${JSON.stringify(dependency)}`,
      );
    }
    seenAdapterDependencies.add(dependency);
  }
  assertSeverityMap(group.severityOverrides, `group ${index}`);
  assertKnownRuleKeys(group.ruleOptions, `group ${index}`);
}

function assertValidTrustedPureDependencies(dependencies: readonly TrustedDependency[]): void {
  const seenTrustedDependencies = new Set<string>();
  for (const dependency of dependencies) {
    if (dependency.specifier.trim().length === 0) {
      throw new Error("oxlint-effect-plugin: trusted-pure dependency specifier must be nonempty");
    }
    if (dependency.reason.trim().length === 0) {
      throw new Error(
        `oxlint-effect-plugin: trusted-pure dependency ${JSON.stringify(dependency.specifier)} requires a nonempty reason`,
      );
    }
    if (seenTrustedDependencies.has(dependency.specifier)) {
      throw new Error(
        `oxlint-effect-plugin: duplicate trusted-pure dependency ${JSON.stringify(dependency.specifier)}`,
      );
    }
    seenTrustedDependencies.add(dependency.specifier);
  }
}

function assertValidEffectConfigInput(input: EffectConfigInput): void {
  if (
    input.strictness !== undefined &&
    !(STRICTNESSES as readonly unknown[]).includes(input.strictness)
  ) {
    throw new Error(`oxlint-effect-plugin: unknown strictness ${JSON.stringify(input.strictness)}`);
  }
  if (!Array.isArray(input.groups) || input.groups.length === 0) {
    throw new Error("oxlint-effect-plugin: at least one rule group is required");
  }
  input.groups.forEach(assertValidGroup);
  assertValidTrustedPureDependencies(input.trustedPureDependencies ?? []);
  assertSeverityMap(input.rules, "project");
}

export interface ExpansionPolicy {
  readonly strictness?: Strictness;
  readonly rules?: Partial<Readonly<Record<RuleName, Severity>>>;
}

/** Rules enabled for one domain group, with their expanded options. */
function expandValidatedGroupRules(
  group: RuleGroup,
  pluginName: string,
  policy: ExpansionPolicy,
): Record<string, unknown> {
  const strictness = group.strictness ?? policy.strictness ?? "strict";
  const boundaries = [...(group.boundaries ?? [])].toSorted();
  const rules: Record<string, unknown> = {};

  const promiseRuleInfo = RULE_INFO_BY_NAME["no-native-promise-control-flow"];
  const promiseRuleActive =
    promiseRuleInfo.strictness.includes(strictness) &&
    promiseRuleInfo.applicability.roles.includes(group.role) &&
    (policy.rules?.["no-native-promise-control-flow"] ??
      group.severityOverrides?.["no-native-promise-control-flow"] ??
      promiseRuleInfo.defaultSeverity) !== "off";

  for (const info of RULE_REGISTRY) {
    const applies =
      info.applicability.roles.includes(group.role) &&
      (info.applicability.boundaries.length === 0 ||
        info.applicability.boundaries.some((boundary) => boundaries.includes(boundary))) &&
      info.strictness.includes(strictness);
    if (!applies) continue;

    const severity =
      policy.rules?.[info.rule] ?? group.severityOverrides?.[info.rule] ?? info.defaultSeverity;
    if (severity === "off") continue;

    const options: Record<string, unknown> = {
      ...info.defaultOptions,
      ...group.ruleOptions?.[info.rule],
    };
    for (const key of EXPANSION_OWNED_OPTION_KEYS) delete options[key];
    options["role"] = group.role;
    options["platform"] = group.platform;
    if (boundaries.length > 0) options["boundaries"] = boundaries;
    if (info.rule === "no-premature-execution" && promiseRuleActive) {
      options["promiseRuleActive"] = true;
    }
    rules[`${pluginName}/${info.rule}`] = [severity, options];
  }
  return rules;
}

/** Rules enabled for one group, with their expanded options. */
export function expandGroupRules(
  group: RuleGroup,
  pluginName: string = DEFAULT_PLUGIN_NAME,
  policy: ExpansionPolicy = {},
): Record<string, unknown> {
  assertValidGroup(group, 0);
  if (
    policy.strictness !== undefined &&
    !(STRICTNESSES as readonly unknown[]).includes(policy.strictness)
  ) {
    throw new Error(
      `oxlint-effect-plugin: unknown strictness ${JSON.stringify(policy.strictness)}`,
    );
  }
  assertSeverityMap(policy.rules, "project");
  return expandValidatedGroupRules(group, pluginName, policy);
}

/**
 * Expand Effect rule groups into an Oxlint config fragment.
 *
 * Strict enforcement is implicit. Consumers must lower it explicitly.
 */
export function effect(input: EffectConfigInput): OxlintConfigFragment {
  assertValidEffectConfigInput(input);
  const pluginName = input.pluginName ?? DEFAULT_PLUGIN_NAME;
  const policy: ExpansionPolicy = {
    strictness: input.strictness ?? "strict",
    ...(input.rules === undefined ? {} : { rules: input.rules }),
  };

  return {
    jsPlugins: [
      {
        name: pluginName,
        specifier: input.pluginSpecifier ?? DEFAULT_PLUGIN_SPECIFIER,
      },
    ],
    rules: {},
    overrides: input.groups.map((group) => ({
      files: [...group.files],
      rules: expandValidatedGroupRules(group, pluginName, policy),
    })),
  };
}

/**
 * Project one Effect declaration into the module-policy data used by the
 * import-graph coordinator.
 */
export function importClosurePolicy(input: EffectConfigInput): ImportClosurePolicy {
  assertValidEffectConfigInput(input);

  return {
    trustedPureDependencies: (input.trustedPureDependencies ?? []).map(({ specifier, reason }) => ({
      specifier,
      reason,
    })),
    groups: input.groups.map((group) => ({
      files: [...group.files],
      role: group.role,
      platform: group.platform,
      adapterDependencies: [...(group.adapterDependencies ?? [])],
    })),
  };
}
