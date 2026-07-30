/**
 * Typed failure and totality: reject `throw` only in roles whose contract is
 * total or whose failures belong in an Effect error channel. This is not a
 * JavaScript-wide ban; the config expansion enables the rule per declared
 * role.
 */

import type { ThrowStatement } from "../ast.js";
import type { Rule, RuleContext } from "../plugin-api.js";
import { domainOptionsOf, formatMessage } from "../rule-support.js";

export const RULE_NAME = "no-untyped-throw";

export const noUntypedThrow: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject throw statements in roles whose failures belong in the Effect error channel.",
    },
    schema: [
      {
        type: "object",
        properties: {
          role: { type: "string" },
          platform: { type: "string" },
          boundaries: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context: RuleContext) {
    const domains = domainOptionsOf(context);
    return {
      ThrowStatement(node: ThrowStatement) {
        context.report({
          node,
          message: formatMessage({
            rule: RULE_NAME,
            finding:
              "`throw` escapes the typed failure contract of this role; failures here belong in the Effect error channel.",
            remedy:
              "Use Effect.fail with a tagged error (e.g. Data.TaggedError) or return a total value; reserve throw for roles with untyped-boundary contracts.",
            domains,
          }),
        });
      },
    };
  },
};
