/**
 * Schema.Opaque is a nominal type-level wrapper over a structural schema. Its
 * decoded values are not class instances, so instance fields and methods would
 * advertise runtime behavior that decoding does not construct.
 */

import type { Identifier, ImportDeclaration, Node, Program } from "../ast.js";
import { isIdentifier, staticPropertyName } from "../ast.js";
import {
  collectImportedBindings,
  importedBindingForReference,
  type ImportedBinding,
} from "../bindings.js";
import type { Rule, RuleContext } from "../plugin-api.js";
import {
  DOMAIN_SCHEMA_PROPERTIES,
  domainOptionsOf,
  formatMessage,
  REQUIRED_DOMAIN_SCHEMA_KEYS,
} from "../rule-support.js";

export const RULE_NAME = "no-opaque-instance-fields";

type ClassNode = Node & {
  readonly superClass?: Node | null;
  readonly body: { readonly body: readonly Node[] };
};

function valueImportLocals(body: readonly Node[]): Set<string> {
  const locals = new Set<string>();
  for (const statement of body) {
    if (statement.type !== "ImportDeclaration") continue;
    const declaration = statement as ImportDeclaration;
    if (declaration.importKind === "type") continue;
    for (const rawSpecifier of declaration.specifiers) {
      if (
        (rawSpecifier.type === "ImportSpecifier" ||
          rawSpecifier.type === "ImportNamespaceSpecifier" ||
          rawSpecifier.type === "ImportDefaultSpecifier") &&
        (rawSpecifier as { readonly importKind?: string }).importKind !== "type"
      ) {
        const local = (rawSpecifier as { readonly local?: Identifier }).local;
        if (local !== undefined) locals.add(local.name);
      }
    }
  }
  return locals;
}

function retainValueBindings(
  bindings: Map<string, ImportedBinding>,
  valueLocals: ReadonlySet<string>,
): Map<string, ImportedBinding> {
  for (const local of bindings.keys()) {
    if (!valueLocals.has(local)) bindings.delete(local);
  }
  return bindings;
}

export const noOpaqueInstanceFields: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject instance fields and methods on Schema.Opaque declarations because decoded values are structural, not class instances.",
    },
    schema: [
      {
        type: "object",
        properties: DOMAIN_SCHEMA_PROPERTIES,
        required: REQUIRED_DOMAIN_SCHEMA_KEYS,
        additionalProperties: false,
      },
    ],
  },
  create(context: RuleContext) {
    const domains = domainOptionsOf(context);
    let schemaBindings = new Map<string, ImportedBinding>();

    const isSchemaNamespace = (identifier: Identifier): boolean => {
      const binding = importedBindingForReference(schemaBindings, identifier);
      return (
        binding !== null &&
        ((binding.source === "effect" &&
          binding.kind === "named" &&
          binding.imported === "Schema") ||
          (binding.source === "effect/Schema" && binding.kind === "namespace"))
      );
    };

    const isOpaqueCallee = (node: Node): boolean => {
      if (isIdentifier(node)) {
        const binding = importedBindingForReference(schemaBindings, node);
        return (
          binding !== null &&
          binding.kind === "named" &&
          binding.imported === "Opaque" &&
          (binding.source === "effect" || binding.source === "effect/Schema")
        );
      }
      if (node.type !== "MemberExpression") return false;
      const member = node as import("../ast.js").MemberExpression;
      return (
        staticPropertyName(member) === "Opaque" &&
        isIdentifier(member.object) &&
        isSchemaNamespace(member.object)
      );
    };

    const checkClass = (node: ClassNode): void => {
      const outer = node.superClass;
      if (outer?.type !== "CallExpression") return;
      const inner = (outer as import("../ast.js").CallExpression).callee;
      if (inner.type !== "CallExpression") return;
      if (!isOpaqueCallee((inner as import("../ast.js").CallExpression).callee)) return;

      for (const member of node.body.body) {
        if (
          (member.type !== "PropertyDefinition" && member.type !== "MethodDefinition") ||
          (member as { readonly static?: boolean }).static === true ||
          (member.type === "MethodDefinition" &&
            (member as { readonly kind?: string }).kind === "constructor")
        ) {
          continue;
        }
        context.report({
          node: member,
          message: formatMessage({
            rule: RULE_NAME,
            finding:
              "A Schema.Opaque declaration defines an instance member that decoded values do not receive.",
            remedy:
              "Remove the instance member. Put behavior in pure functions or an explicit schema transformation whose runtime representation is constructed.",
            domains,
          }),
        });
      }
    };

    return {
      Program(program: Program) {
        const body = program.body ?? [];
        schemaBindings = retainValueBindings(
          collectImportedBindings(
            context,
            body,
            (source) => source === "effect" || source === "effect/Schema",
          ),
          valueImportLocals(body),
        );
      },
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
};
