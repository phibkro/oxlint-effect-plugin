/**
 * Observability capability: reject ambient `console` in Effect-bearing
 * operational code. Severe by default. One targeted suppression with a
 * nonempty `dev only:` reason admits a genuinely developer-only statement.
 * Local shadowing of `console` is not an ambient-global violation.
 */

import type { Identifier, MemberExpression, Program } from "../ast.js";
import { staticPropertyName } from "../ast.js";
import type { Rule, RuleContext } from "../plugin-api.js";
import {
  classifyAmbientUse,
  collectAmbientReferences,
  DOMAIN_SCHEMA_PROPERTIES,
  domainOptionsOf,
  formatMessage,
  REQUIRED_DOMAIN_SCHEMA_KEYS,
} from "../rule-support.js";
import { collectDirectives } from "../suppression.js";

export const RULE_NAME = "no-ambient-console";

const GLOBAL_OBJECT_NAMES = new Set(["globalThis", "window", "self"]);

export const noAmbientConsole: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject ambient console output in Effect-bearing operational code; prefer Effect.log*, effect/Console, or an injected service.",
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

    return {
      "Program:exit"(program: Program) {
        const globalScope = context.sourceCode.getScope(program);
        const ambient = collectAmbientReferences(globalScope);

        const hits: {
          identifier: Identifier;
          reportNode: import("../ast.js").Node;
          line: number;
        }[] = [];

        for (const identifier of ambient.get("console") ?? []) {
          const use = classifyAmbientUse(identifier);
          hits.push({
            identifier,
            reportNode: use.reportNode,
            line: use.reportNode.loc.start.line,
          });
        }
        // `globalThis.console`, `window.console`, `self.console` members.
        for (const globalName of GLOBAL_OBJECT_NAMES) {
          for (const identifier of ambient.get(globalName) ?? []) {
            const parent = identifier.parent ?? null;
            if (parent === null || parent.type !== "MemberExpression") continue;
            const member = parent as MemberExpression;
            if (member.object !== identifier) continue;
            if (staticPropertyName(member) === "console") {
              hits.push({ identifier, reportNode: member, line: member.loc.start.line });
            }
          }
        }

        const directives = collectDirectives(
          context.sourceCode.getAllComments(),
          context.sourceCode.text,
          RULE_NAME,
        );

        const suppressorByLine = new Map<number, (typeof directives)[number]>();
        for (const directive of directives) {
          if (directive.problems.length === 0 && !suppressorByLine.has(directive.appliesToLine)) {
            suppressorByLine.set(directive.appliesToLine, directive);
          }
        }

        const usedDirectives = new Set<(typeof directives)[number]>();
        for (const hit of hits) {
          const suppressor = suppressorByLine.get(hit.line);
          if (suppressor !== undefined) {
            usedDirectives.add(suppressor);
            continue;
          }
          context.report({
            node: hit.reportNode,
            message: formatMessage({
              rule: RULE_NAME,
              finding: "Ambient console output bypasses the Effect observability capability.",
              remedy:
                'Use Effect.log*, effect/Console, or an injected logging service; a genuinely developer-only statement may carry one targeted "oxlint-effect-plugin allow(no-ambient-console): dev only: <reason>" suppression.',
              domains,
            }),
          });
        }

        for (const directive of directives) {
          if (directive.problems.includes("broad-target")) {
            context.report({
              loc: directive.comment.loc,
              message: formatMessage({
                rule: RULE_NAME,
                finding: "Suppression directive is not targeted at exactly no-ambient-console.",
                remedy:
                  'Name exactly one rule: "oxlint-effect-plugin allow(no-ambient-console): dev only: <reason>". Broad or multi-rule suppressions are rejected.',
                domains,
              }),
            });
          } else if (directive.problems.includes("missing-reason")) {
            context.report({
              loc: directive.comment.loc,
              message: formatMessage({
                rule: RULE_NAME,
                finding: 'Suppression directive lacks a nonempty "dev only:" reason.',
                remedy:
                  'Append a concrete reason: "oxlint-effect-plugin allow(no-ambient-console): dev only: <reason>".',
                domains,
              }),
            });
          } else if (!usedDirectives.has(directive)) {
            context.report({
              loc: directive.comment.loc,
              message: formatMessage({
                rule: RULE_NAME,
                finding:
                  "Suppression directive does not suppress any ambient console use on its target line.",
                remedy: "Remove the unused suppression.",
                domains,
              }),
            });
          }
        }
      },
    };
  },
};
