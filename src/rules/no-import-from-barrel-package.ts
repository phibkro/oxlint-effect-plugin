/**
 * Optional package-topology policy adapted from @effect/eslint-plugin.
 *
 * Package roots are explicit consumer configuration. This rule does not infer
 * that an arbitrary dependency is a barrel and does not resolve the filesystem.
 */

import type { ImportDeclaration, ImportSpecifierNode } from "../ast.js";
import type { Rule, RuleContext } from "../plugin-api.js";
import {
  DOMAIN_SCHEMA_PROPERTIES,
  domainOptionsOf,
  formatMessage,
  REQUIRED_DOMAIN_SCHEMA_KEYS,
  ruleOptionRecord,
} from "../rule-support.js";

export const RULE_NAME = "no-import-from-barrel-package";

function importedName(specifier: ImportSpecifierNode): string {
  const imported = specifier.imported;
  if (imported?.type === "Identifier") return imported.name;
  if (imported?.type === "Literal" && typeof imported.value === "string") return imported.value;
  return specifier.local.name;
}

export const noImportFromBarrelPackage: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Reject named and namespace value imports from explicitly configured package barrels.",
    },
    schema: [
      {
        type: "object",
        properties: {
          ...DOMAIN_SCHEMA_PROPERTIES,
          packageNames: {
            type: "array",
            items: { type: "string", minLength: 1 },
            uniqueItems: true,
          },
        },
        required: [...REQUIRED_DOMAIN_SCHEMA_KEYS, "packageNames"],
        additionalProperties: false,
      },
    ],
  },
  create(context: RuleContext) {
    const domains = domainOptionsOf(context);
    const optionRecord = ruleOptionRecord(context);
    const packageNames = new Set(
      Array.isArray(optionRecord["packageNames"])
        ? (optionRecord["packageNames"] as unknown[]).filter(
            (value): value is string => typeof value === "string" && value.length > 0,
          )
        : [],
    );

    return {
      ImportDeclaration(node: ImportDeclaration) {
        if (node.importKind === "type") return;
        const source = node.source.value;
        if (typeof source !== "string" || !packageNames.has(source)) return;

        for (const rawSpecifier of node.specifiers) {
          if (
            rawSpecifier.type !== "ImportSpecifier" &&
            rawSpecifier.type !== "ImportNamespaceSpecifier"
          ) {
            continue;
          }
          const specifier = rawSpecifier as ImportSpecifierNode;
          if (specifier.importKind === "type") continue;
          const finding =
            specifier.type === "ImportNamespaceSpecifier"
              ? `Namespace import ${specifier.local.name} comes from configured barrel package ${JSON.stringify(source)}.`
              : `Value ${importedName(specifier)} is imported from configured barrel package ${JSON.stringify(source)}.`;
          context.report({
            node: specifier,
            message: formatMessage({
              rule: RULE_NAME,
              finding,
              remedy:
                "Import the owning module subpath explicitly. Select the subpath manually because package exports are not proven by syntax analysis.",
              domains,
            }),
          });
        }
      },
    };
  },
};
