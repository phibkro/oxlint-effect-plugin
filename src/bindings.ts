/**
 * Lexical-binding helpers built on Oxlint's ESLint-v9-compatible SourceCode
 * scope API. Rules compare resolved Variable/Reference identity; an identifier
 * with the same spelling in a nested scope is deliberately not equivalent.
 */

import type { Identifier, ImportDeclaration, ImportSpecifierNode, Literal, Node } from "./ast.js";
import { isIdentifier } from "./ast.js";
import type { RuleContext, ScopeVariable } from "./plugin-api.js";

export type ImportKind = "named" | "namespace" | "default";

export interface ImportedBinding {
  readonly source: string;
  readonly kind: ImportKind;
  /** Exported name, `*` for namespace imports, or `default`. */
  readonly imported: string;
  readonly local: Identifier;
  readonly variable: ScopeVariable;
}

function sameNode(left: Node, right: Node): boolean {
  if (left === right) return true;
  if (left.range === undefined || right.range === undefined) return false;
  return left.range[0] === right.range[0] && left.range[1] === right.range[1];
}

export function variableOwnsReference(variable: ScopeVariable, identifier: Identifier): boolean {
  return variable.references.some((reference) => sameNode(reference.identifier, identifier));
}

export function bindingOwnsReference(binding: ImportedBinding, identifier: Identifier): boolean {
  return (
    binding.local.name === identifier.name && variableOwnsReference(binding.variable, identifier)
  );
}

export function importedBindingForReference(
  bindings: ReadonlyMap<string, ImportedBinding>,
  identifier: Identifier,
): ImportedBinding | null {
  const binding = bindings.get(identifier.name);
  return binding !== undefined && bindingOwnsReference(binding, identifier) ? binding : null;
}

function importedName(specifier: ImportSpecifierNode): string {
  if (specifier.type === "ImportNamespaceSpecifier") return "*";
  if (specifier.type === "ImportDefaultSpecifier") return "default";
  const imported = specifier.imported;
  if (isIdentifier(imported)) return imported.name;
  if (imported?.type === "Literal") {
    const value = (imported as Literal).value;
    if (typeof value === "string") return value;
  }
  return specifier.local.name;
}

/**
 * Collect imports and bind each local identifier to the ScopeVariable that
 * Oxlint resolved for it. `getDeclaredVariables` is the public ESLint v9 API
 * implemented by Oxlint; no Oxc-internal node IDs are assumed.
 */
export function collectImportedBindings(
  context: RuleContext,
  programBody: readonly Node[],
  matchesSource: (specifier: string) => boolean,
): Map<string, ImportedBinding> {
  const bindings = new Map<string, ImportedBinding>();
  for (const statement of programBody) {
    if (statement.type !== "ImportDeclaration") continue;
    const declaration = statement as ImportDeclaration;
    const source = declaration.source.value;
    if (typeof source !== "string" || !matchesSource(source)) continue;
    for (const rawSpecifier of declaration.specifiers) {
      if (
        rawSpecifier.type !== "ImportSpecifier" &&
        rawSpecifier.type !== "ImportNamespaceSpecifier" &&
        rawSpecifier.type !== "ImportDefaultSpecifier"
      ) {
        continue;
      }
      const specifier = rawSpecifier as ImportSpecifierNode;
      const variable = context.sourceCode
        .getDeclaredVariables(specifier)
        .find((candidate) => candidate.name === specifier.local.name);
      if (variable === undefined) continue;
      bindings.set(specifier.local.name, {
        source,
        kind:
          specifier.type === "ImportSpecifier"
            ? "named"
            : specifier.type === "ImportNamespaceSpecifier"
              ? "namespace"
              : "default",
        imported: importedName(specifier),
        local: specifier.local,
        variable,
      });
    }
  }
  return bindings;
}

/** Resolve a reference using ScopeVariable reference identity. */
export function resolveVariable(
  context: RuleContext,
  identifier: Identifier,
): ScopeVariable | null {
  let scope: import("./plugin-api.js").Scope | null = context.sourceCode.getScope(identifier);
  while (scope !== null) {
    for (const variable of scope.variables) {
      if (variable.name === identifier.name && variableOwnsReference(variable, identifier)) {
        return variable;
      }
    }
    scope = scope.upper;
  }
  return null;
}

/** True only for an environment-provided or unresolved reference. */
export function isAmbientReference(context: RuleContext, identifier: Identifier): boolean {
  const variable = resolveVariable(context, identifier);
  return variable === null || variable.defs.length === 0;
}

export function declaredVariable(
  context: RuleContext,
  declaration: Node,
  local: Identifier,
): ScopeVariable | null {
  return (
    context.sourceCode
      .getDeclaredVariables(declaration)
      .find((candidate) => candidate.name === local.name) ?? null
  );
}
