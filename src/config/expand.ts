/**
 * Typed configuration builder: expands declared domain intersections into
 * ordinary Oxlint rule configuration and file overrides.
 *
 * Domains determine applicability, not severity: a rule is enabled for a file
 * group exactly when the group's declared role (and, where required,
 * boundary) is in the rule's applicability set. Severity comes from the rule
 * registry defaults and may be overridden per group by the consumer.
 */

import type { Boundary, Platform, Role, Technology } from "../domains.js";
import { BOUNDARIES, PLATFORMS, ROLES, TECHNOLOGIES } from "../domains.js";
import type { RuleName } from "../registry.js";
import { RULE_REGISTRY } from "../registry.js";

export const DEFAULT_PLUGIN_NAME = "effect";
export const DEFAULT_PLUGIN_SPECIFIER = "@phibkro/oxlint-effect-plugin";

export type Severity = "error" | "warn" | "off";
export type Strictness = "recommended" | "strict";

export interface DomainGroup {
  /** Oxlint glob patterns this group governs. */
  readonly files: readonly string[];
  readonly role: Role;
  readonly platform: Platform;
  readonly boundaries?: readonly Boundary[];
  /** Enable strict-only rules for this group. */
  readonly strictness?: Strictness;
  /** Per-rule severity overrides; domains never change severity. */
  readonly severityOverrides?: Partial<Readonly<Record<RuleName, Severity>>>;
  /** Extra rule-specific options merged into the expanded options object. */
  readonly ruleOptions?: Partial<Readonly<Record<RuleName, Readonly<Record<string, unknown>>>>>;
}

export interface ExpandInput {
  readonly technology: Technology;
  readonly groups: readonly DomainGroup[];
  readonly pluginName?: string;
  readonly pluginSpecifier?: string;
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

function assertValidGroup(group: DomainGroup, index: number): void {
  if (group.files.length === 0) {
    throw new Error(`oxlint-effect-plugin: group ${index} declares no files`);
  }
  if (!(ROLES as readonly string[]).includes(group.role)) {
    throw new Error(`oxlint-effect-plugin: group ${index} declares unknown role "${group.role}"`);
  }
  if (!(PLATFORMS as readonly string[]).includes(group.platform)) {
    throw new Error(
      `oxlint-effect-plugin: group ${index} declares unknown platform "${group.platform}"`,
    );
  }
  for (const boundary of group.boundaries ?? []) {
    if (!(BOUNDARIES as readonly string[]).includes(boundary)) {
      throw new Error(
        `oxlint-effect-plugin: group ${index} declares unknown boundary "${boundary}"`,
      );
    }
  }
}

/** Rules enabled for one domain group, with their expanded options. */
export function expandGroupRules(
  group: DomainGroup,
  technology: Technology,
  pluginName: string = DEFAULT_PLUGIN_NAME,
): Record<string, unknown> {
  if (!(TECHNOLOGIES as readonly string[]).includes(technology)) {
    throw new Error(
      `oxlint-effect-plugin: unknown technology ${JSON.stringify(technology)}; v0 requires "effect-v4"`,
    );
  }
  const strict = (group.strictness ?? "recommended") === "strict";
  const boundaries = [...(group.boundaries ?? [])].toSorted();
  const rules: Record<string, unknown> = {};

  const promiseRuleInfo = RULE_REGISTRY.find(
    (info) => info.name === "no-native-promise-control-flow",
  );
  const promiseRuleActive =
    strict &&
    promiseRuleInfo !== undefined &&
    promiseRuleInfo.appliesToRoles.includes(group.role) &&
    (group.severityOverrides?.["no-native-promise-control-flow"] ??
      promiseRuleInfo.defaultSeverity) !== "off";

  for (const info of RULE_REGISTRY) {
    const applies =
      info.appliesToRoles.includes(group.role) &&
      (info.requiresBoundary === null || boundaries.includes(info.requiresBoundary)) &&
      (!info.strictOnly || strict);
    if (!applies) continue;

    const severity = group.severityOverrides?.[info.name] ?? info.defaultSeverity;
    if (severity === "off") continue;

    const options: Record<string, unknown> = {
      technology,
      role: group.role,
      platform: group.platform,
      ...(boundaries.length > 0 ? { boundaries } : {}),
      ...group.ruleOptions?.[info.name],
    };
    if (info.name === "no-premature-execution" && promiseRuleActive) {
      options["promiseRuleActive"] = true;
    }
    rules[`${pluginName}/${info.name}`] = [severity, options];
  }
  return rules;
}

/**
 * Expand domain groups into an Oxlint config fragment. The fragment spreads
 * into `.oxlintrc.json` or `defineConfig({...})` unchanged, which is what
 * keeps both config forms equivalent by construction.
 */
export function expandDomains(input: ExpandInput): OxlintConfigFragment {
  if (!(TECHNOLOGIES as readonly string[]).includes(input.technology)) {
    throw new Error(
      `oxlint-effect-plugin: unknown or omitted technology ${JSON.stringify(input.technology)}; v0 requires "effect-v4"`,
    );
  }
  if (input.groups.length === 0) {
    throw new Error("oxlint-effect-plugin: at least one domain group is required");
  }
  input.groups.forEach(assertValidGroup);

  const pluginName = input.pluginName ?? DEFAULT_PLUGIN_NAME;
  const specifier = input.pluginSpecifier ?? DEFAULT_PLUGIN_SPECIFIER;

  return {
    jsPlugins: [{ name: pluginName, specifier }],
    rules: {},
    overrides: input.groups.map((group) => ({
      files: [...group.files],
      rules: expandGroupRules(group, input.technology, pluginName),
    })),
  };
}
