/**
 * Shared, portable helpers for rule implementations.
 *
 * Everything here is pure over the AST/scope structures the linter provides:
 * no filesystem, process, network, clock, random, or runtime authority.
 */

import type { CallExpression, Identifier, MemberExpression, Node } from "./ast.js";
import { isIdentifier, staticPropertyName } from "./ast.js";
import type { DomainSelection } from "./domains.js";
import { describeSelection, isBoundary, isPlatform, isRole, isTechnology } from "./domains.js";
import type { RuleContext, Scope } from "./plugin-api.js";

export const LIMITATION = "limitation: syntax and scope analysis only, not type-aware verification";

export interface MessageParts {
  readonly rule: string;
  readonly finding: string;
  readonly remedy: string;
  readonly domains: Partial<DomainSelection>;
}

/**
 * Single diagnostic template. Every message identifies the rule, the finding
 * and rationale, a remedy, the selected domains, and the analysis limitation
 * (spec 0001 acceptance 17).
 */
export function formatMessage(parts: MessageParts): string {
  return (
    `effect/${parts.rule}: ${parts.finding} ${parts.remedy} ` +
    `[domains: ${describeSelection(parts.domains)}] [${LIMITATION}]`
  );
}

/** Domain selection passed to every rule by the config expansion. */
export function domainOptionsOf(context: RuleContext): Partial<DomainSelection> {
  const raw = context.options[0];
  if (typeof raw !== "object" || raw === null) {
    throw new Error(
      'oxlint-effect-plugin: rule configuration requires an options object with technology: "effect-v4"',
    );
  }
  const record = raw as Record<string, unknown>;
  const technology = record["technology"];
  if (!isTechnology(technology)) {
    throw new Error(
      `oxlint-effect-plugin: rule configuration requires technology "effect-v4"; received ${JSON.stringify(technology)}`,
    );
  }
  const role = record["role"];
  const platform = record["platform"];
  const boundaries = record["boundaries"];
  return {
    technology,
    ...(isRole(role) ? { role } : {}),
    ...(isPlatform(platform) ? { platform } : {}),
    ...(Array.isArray(boundaries) ? { boundaries: boundaries.filter(isBoundary) } : {}),
  };
}

/** Shared JSON-schema fragments for every rule's authoritative domains. */
export const DOMAIN_SCHEMA_PROPERTIES = {
  technology: { type: "string", enum: ["effect-v4"] },
  role: { type: "string" },
  platform: { type: "string" },
  boundaries: { type: "array", items: { type: "string" } },
} as const;

export const REQUIRED_DOMAIN_SCHEMA_KEYS = ["technology"] as const;

export function ruleOptionRecord(context: RuleContext): Record<string, unknown> {
  const raw = context.options[0];
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
}

/**
 * All references to ambient (environment-provided or undeclared) globals,
 * keyed by global name. Shadowed names never appear: a reference that
 * resolves to any declaration with definitions is not ambient.
 */
export function collectAmbientReferences(globalScope: Scope): Map<string, Identifier[]> {
  const ambient = new Map<string, Identifier[]>();
  const push = (node: Node): void => {
    if (!isIdentifier(node)) return;
    const list = ambient.get(node.name);
    if (list === undefined) ambient.set(node.name, [node]);
    else list.push(node);
  };
  for (const variable of globalScope.variables) {
    if (variable.defs.length === 0) {
      for (const reference of variable.references) push(reference.identifier);
    }
  }
  for (const reference of globalScope.through) push(reference.identifier);
  return ambient;
}

/** Syntactic classification of how an ambient global identifier is used. */
export interface AmbientUse {
  readonly expression: Node;
  readonly kind: "call" | "new" | "member" | "other";
  /** For `member`: static property name, e.g. `now` for `Date.now`. */
  readonly property: string | null;
  /** Node to report: the enclosing call/new/member when present. */
  readonly reportNode: Node;
  /** For `new`/`call`: argument count of the enclosing expression. */
  readonly argumentCount: number | null;
}

export function classifyAmbientExpression(expression: Node): AmbientUse {
  const parent = expression.parent ?? null;
  if (parent !== null && parent.type === "MemberExpression") {
    const member = parent as MemberExpression;
    if (member.object === expression) {
      const grand = member.parent ?? null;
      if (
        grand !== null &&
        grand.type === "CallExpression" &&
        (grand as CallExpression).callee === member
      ) {
        return {
          expression,
          kind: "member",
          property: staticPropertyName(member),
          reportNode: grand,
          argumentCount: (grand as CallExpression).arguments.length,
        };
      }
      return {
        expression,
        kind: "member",
        property: staticPropertyName(member),
        reportNode: member,
        argumentCount: null,
      };
    }
  }
  if (
    parent !== null &&
    parent.type === "CallExpression" &&
    (parent as CallExpression).callee === expression
  ) {
    return {
      expression,
      kind: "call",
      property: null,
      reportNode: parent,
      argumentCount: (parent as CallExpression).arguments.length,
    };
  }
  if (
    parent !== null &&
    parent.type === "NewExpression" &&
    (parent as { callee?: Node }).callee === expression
  ) {
    return {
      expression,
      kind: "new",
      property: null,
      reportNode: parent,
      argumentCount: (parent as { arguments: readonly Node[] }).arguments.length,
    };
  }
  return { expression, kind: "other", property: null, reportNode: expression, argumentCount: null };
}

export function classifyAmbientUse(identifier: Identifier): AmbientUse {
  return classifyAmbientExpression(identifier);
}

export interface AmbientGlobalObjectMember {
  /** Ambient global object (`globalThis`, `window`, `self`, or Node `global`). */
  readonly object: Identifier;
  /** First statically named member, e.g. `fetch` in `globalThis.fetch(...)`. */
  readonly globalName: string;
  readonly expression: MemberExpression;
  /** Use relative to the qualified global value, not to the global object. */
  readonly use: AmbientUse;
}

const AMBIENT_GLOBAL_OBJECTS = ["globalThis", "window", "self", "global"] as const;

/**
 * Resolve statically named members reached through ambient global objects.
 *
 * The input map already excludes lexically shadowed roots. Computed
 * non-literals are intentionally skipped because their authority cannot be
 * established by AST/scope evidence alone.
 */
export function collectAmbientGlobalObjectMembers(
  ambient: ReadonlyMap<string, readonly Identifier[]>,
): AmbientGlobalObjectMember[] {
  const members: AmbientGlobalObjectMember[] = [];
  for (const objectName of AMBIENT_GLOBAL_OBJECTS) {
    for (const object of ambient.get(objectName) ?? []) {
      const parent = object.parent;
      if (parent?.type !== "MemberExpression") continue;
      const expression = parent as MemberExpression;
      if (expression.object !== object) continue;
      const globalName = staticPropertyName(expression);
      if (globalName === null) continue;
      members.push({
        object,
        globalName,
        expression,
        use: classifyAmbientExpression(expression),
      });
    }
  }
  return members;
}

/** String value of a statically analyzable module/source literal. */
export function staticStringValue(node: Node | null | undefined): string | null {
  if (node?.type !== "Literal") return null;
  const value = (node as import("./ast.js").Literal).value;
  return typeof value === "string" ? value : null;
}

const EFFECT_MODULE_PATTERN = /^effect(?:\/|$)/;

export function isEffectModule(specifier: string): boolean {
  return EFFECT_MODULE_PATTERN.test(specifier);
}

const PLATFORM_PACKAGE_PATTERN = /^@effect\/platform-(node|node-shared|bun|browser|deno)(?:\/|$)/;

export function platformPackageTarget(specifier: string): string | null {
  const match = PLATFORM_PACKAGE_PATTERN.exec(specifier);
  if (match === null) return null;
  const target = match[1];
  return target === "node-shared" ? "node" : (target ?? null);
}

/** Walk `parent` links until the predicate matches or the tree ends. */
export function findEnclosing(node: Node, predicate: (candidate: Node) => boolean): Node | null {
  let current: Node | null | undefined = node.parent;
  while (current != null) {
    if (predicate(current)) return current;
    current = current.parent;
  }
  return null;
}
