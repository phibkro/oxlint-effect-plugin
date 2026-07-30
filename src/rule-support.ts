/**
 * Shared, portable helpers for rule implementations.
 *
 * Everything here is pure over the AST/scope structures the linter provides:
 * no filesystem, process, network, clock, random, or runtime authority.
 */

import type { CallExpression, Identifier, MemberExpression, Node } from "./ast.js";
import { isIdentifier, staticPropertyName } from "./ast.js";
import type { DomainSelection } from "./domains.js";
import { describeSelection, isBoundary, isPlatform, isRole } from "./domains.js";
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
    `effect-v4/${parts.rule}: ${parts.finding} ${parts.remedy} ` +
    `[domains: ${describeSelection(parts.domains)}] [${LIMITATION}]`
  );
}

/** Domain selection passed to every rule by the config expansion. */
export function domainOptionsOf(context: RuleContext): Partial<DomainSelection> {
  const raw = context.options[0];
  if (typeof raw !== "object" || raw === null) return {};
  const record = raw as Record<string, unknown>;
  const role = record["role"];
  const platform = record["platform"];
  const boundaries = record["boundaries"];
  return {
    ...(isRole(role) ? { role } : {}),
    ...(isPlatform(platform) ? { platform } : {}),
    ...(Array.isArray(boundaries) ? { boundaries: boundaries.filter(isBoundary) } : {}),
  };
}

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
  readonly identifier: Identifier;
  readonly kind: "call" | "new" | "member" | "other";
  /** For `member`: static property name, e.g. `now` for `Date.now`. */
  readonly property: string | null;
  /** Node to report: the enclosing call/new/member when present. */
  readonly reportNode: Node;
  /** For `new`/`call`: argument count of the enclosing expression. */
  readonly argumentCount: number | null;
}

export function classifyAmbientUse(identifier: Identifier): AmbientUse {
  const parent = identifier.parent ?? null;
  if (parent !== null && parent.type === "MemberExpression") {
    const member = parent as MemberExpression;
    if (member.object === identifier) {
      const grand = member.parent ?? null;
      if (
        grand !== null &&
        grand.type === "CallExpression" &&
        (grand as CallExpression).callee === member
      ) {
        return {
          identifier,
          kind: "member",
          property: staticPropertyName(member),
          reportNode: grand,
          argumentCount: (grand as CallExpression).arguments.length,
        };
      }
      return {
        identifier,
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
    (parent as CallExpression).callee === identifier
  ) {
    return {
      identifier,
      kind: "call",
      property: null,
      reportNode: parent,
      argumentCount: (parent as CallExpression).arguments.length,
    };
  }
  if (
    parent !== null &&
    parent.type === "NewExpression" &&
    (parent as { callee?: Node }).callee === identifier
  ) {
    return {
      identifier,
      kind: "new",
      property: null,
      reportNode: parent,
      argumentCount: (parent as { arguments: readonly Node[] }).arguments.length,
    };
  }
  return { identifier, kind: "other", property: null, reportNode: identifier, argumentCount: null };
}

/**
 * Local bindings imported from a module whose specifier satisfies the
 * predicate. Maps local name -> imported source specifier.
 */
export function collectImportedBindings(
  programBody: readonly Node[],
  matchesSource: (specifier: string) => boolean,
): Map<string, string> {
  const bindings = new Map<string, string>();
  for (const statement of programBody) {
    if (statement.type !== "ImportDeclaration") continue;
    const declaration = statement as { source: { value: unknown }; specifiers: readonly Node[] };
    const specifier = declaration.source.value;
    if (typeof specifier !== "string" || !matchesSource(specifier)) continue;
    for (const spec of declaration.specifiers) {
      const local = (spec as { local?: Node }).local;
      if (local !== undefined && isIdentifier(local)) bindings.set(local.name, specifier);
    }
  }
  return bindings;
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
