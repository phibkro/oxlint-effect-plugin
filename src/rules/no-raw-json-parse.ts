/**
 * External decoding: raw JSON parsing at a declared `external-data` boundary
 * bypasses explicit Effect Schema decoding.
 *
 * Only JSON syntax is claimed: other syntaxes require their own explicit
 * parser/Schema seam, and this rule does not pretend Schema parses every
 * syntax. Local shadowing of `JSON` is respected.
 */

import type { Program } from "../ast.js";
import type { Rule, RuleContext } from "../plugin-api.js";
import {
  classifyAmbientUse,
  collectAmbientReferences,
  DOMAIN_SCHEMA_PROPERTIES,
  domainOptionsOf,
  formatMessage,
  REQUIRED_DOMAIN_SCHEMA_KEYS,
} from "../rule-support.js";

export const RULE_NAME = "no-raw-json-parse";

export const noRawJsonParse: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject raw JSON.parse at declared external-data boundaries in favor of explicit Effect Schema decoding.",
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
        for (const identifier of ambient.get("JSON") ?? []) {
          const use = classifyAmbientUse(identifier);
          if (use.kind === "member" && use.property === "parse") {
            context.report({
              node: use.reportNode,
              message: formatMessage({
                rule: RULE_NAME,
                finding:
                  "Raw JSON.parse at a declared external-data boundary produces unvalidated data.",
                remedy:
                  "Decode through an explicit effect/Schema seam (e.g. Schema.decodeUnknownEffect over the parsed value, or a Schema JSON codec). Lint cannot validate data; it only enforces the decoding seam.",
                domains,
              }),
            });
          }
        }
      },
    };
  },
};
