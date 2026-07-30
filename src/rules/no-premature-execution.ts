/**
 * Effect execution topology: libraries may describe Effects but only
 * composition roots may execute them.
 *
 * Rejects `Effect.run*`, `ManagedRuntime.make`, and platform `*Runtime.runMain`
 * outside a `composition-root` (tests are also admitted for controlled
 * execution), and rejects final provision of official platform layers that
 * prematurely closes a reusable library's requirements. Layer construction
 * and internal service composition remain admitted.
 *
 * Family split: when the companion `no-native-promise-control-flow` rule is
 * active for the same file group (`promiseRuleActive: true`), the
 * `Effect.runPromise*` variants are reported by that rule alone, keeping one
 * diagnostic per violation.
 */

import type { CallExpression, MemberExpression, Program } from "../ast.js";
import { isIdentifier, staticPropertyName } from "../ast.js";
import type { Rule, RuleContext } from "../plugin-api.js";
import {
  collectImportedBindings,
  domainOptionsOf,
  formatMessage,
  isEffectModule,
  platformPackageTarget,
  ruleOptionRecord,
} from "../rule-support.js";

export const RULE_NAME = "no-premature-execution";

export const RUN_MEMBERS = new Set([
  "runSync",
  "runSyncExit",
  "runSyncWith",
  "runSyncExitWith",
  "runFork",
  "runForkWith",
  "runCallback",
  "runCallbackWith",
]);
export const RUN_PROMISE_MEMBERS = new Set([
  "runPromise",
  "runPromiseExit",
  "runPromiseWith",
  "runPromiseExitWith",
]);

const FINAL_LAYER_IDENTIFIER = /^(Node|Bun|Deno|Browser)[A-Za-z]*(Services|Context)$/;

export const noPrematureExecution: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject Effect execution (Effect.run*, ManagedRuntime.make, platform runMain) and final platform-layer provision outside a composition root.",
    },
    schema: [
      {
        type: "object",
        properties: {
          role: { type: "string" },
          platform: { type: "string" },
          boundaries: { type: "array", items: { type: "string" } },
          promiseRuleActive: { type: "boolean" },
          additionalFinalLayerIdentifiers: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context: RuleContext) {
    const domains = domainOptionsOf(context);
    const role = domains.role;
    const optionRecord = ruleOptionRecord(context);
    const promiseRuleActive = optionRecord["promiseRuleActive"] === true;
    const extraFinalLayers = new Set(
      Array.isArray(optionRecord["additionalFinalLayerIdentifiers"])
        ? (optionRecord["additionalFinalLayerIdentifiers"] as unknown[]).filter(
            (value): value is string => typeof value === "string",
          )
        : [],
    );

    // Roles admitted to execute; the expansion normally disables this rule
    // for them, so this is defense in depth for manual configuration.
    if (role === "composition-root" || role === "test") {
      return {};
    }

    let effectBindings = new Map<string, string>();
    let platformBindings = new Map<string, string>();

    // A final-layer expression is rooted at a binding imported from an
    // official @effect/platform-* package (e.g. `NodeServices.layer`), or at
    // an identifier the consumer declared as final. The name pattern alone is
    // not sufficient evidence without the platform import.
    const isFinalLayerExpression = (node: import("../ast.js").Node): boolean => {
      let root = node;
      while (root.type === "MemberExpression") root = (root as MemberExpression).object;
      if (!isIdentifier(root)) return false;
      if (extraFinalLayers.has(root.name)) return true;
      return platformBindings.has(root.name) && FINAL_LAYER_IDENTIFIER.test(root.name);
    };

    return {
      Program(program: Program) {
        const body = (program as { body?: readonly import("../ast.js").Node[] }).body ?? [];
        effectBindings = collectImportedBindings(body, isEffectModule);
        platformBindings = collectImportedBindings(
          body,
          (specifier) => platformPackageTarget(specifier) !== null,
        );
      },
      CallExpression(node: CallExpression) {
        if (node.callee.type !== "MemberExpression") return;
        const member = node.callee as MemberExpression;
        if (!isIdentifier(member.object)) return;
        const objectName = member.object.name;
        const property = staticPropertyName(member);
        if (property === null) return;

        // Effect.run* — only for bindings imported from effect modules;
        // local shadowing therefore never triggers.
        const bindingSource = effectBindings.get(objectName);
        if (bindingSource !== undefined) {
          const isEffectNamespace = bindingSource === "effect" || bindingSource === "effect/Effect";
          const isManagedRuntimeNamespace =
            bindingSource === "effect" || bindingSource === "effect/ManagedRuntime";
          const isRun = RUN_MEMBERS.has(property);
          const isRunPromise = RUN_PROMISE_MEMBERS.has(property);
          if ((isRun || (isRunPromise && !promiseRuleActive)) && isEffectNamespace) {
            context.report({
              node,
              message: formatMessage({
                rule: RULE_NAME,
                finding: `\`Effect.${property}\` executes an Effect outside a composition root; libraries and applications may only describe programs.`,
                remedy:
                  "Move execution to the composition root (or a test with controlled execution).",
                domains,
              }),
            });
            return;
          }
          if (objectName === "ManagedRuntime" && property === "make" && isManagedRuntimeNamespace) {
            context.report({
              node,
              message: formatMessage({
                rule: RULE_NAME,
                finding:
                  "`ManagedRuntime.make` builds an executable runtime outside a composition root.",
                remedy: "Construct runtimes in the composition root; describe layers here instead.",
                domains,
              }),
            });
            return;
          }
          if (isEffectNamespace && property === "provide") {
            for (const argument of node.arguments) {
              if (isFinalLayerExpression(argument)) {
                context.report({
                  node,
                  message: formatMessage({
                    rule: RULE_NAME,
                    finding:
                      "Final provision of an official platform layer prematurely closes this code's requirements.",
                    remedy:
                      "Leave requirements open; the composition root selects live layers. Layer construction and internal service composition remain admitted.",
                    domains,
                  }),
                });
                return;
              }
            }
          }
          return;
        }

        // Platform runtime entry points, e.g. NodeRuntime.runMain.
        if (platformBindings.has(objectName) && property === "runMain") {
          context.report({
            node,
            message: formatMessage({
              rule: RULE_NAME,
              finding: `\`${objectName}.runMain\` runs a program outside a composition root.`,
              remedy: "Only the composition root may run the final program.",
              domains,
            }),
          });
        }
      },
    };
  },
};
