/**
 * Effect execution topology. Imported APIs are recognized through Oxc lexical
 * binding identity, so same-spelled locals never inherit import authority.
 */

import type { CallExpression, MemberExpression, Node, Program } from "../ast.js";
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
  isEffectModule,
  platformPackageTarget,
  REQUIRED_DOMAIN_SCHEMA_KEYS,
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

function isEffectNamespace(binding: ImportedBinding): boolean {
  return (
    (binding.source === "effect/Effect" &&
      (binding.kind === "namespace" || binding.kind === "default")) ||
    (binding.source === "effect" && binding.kind === "named" && binding.imported === "Effect")
  );
}

function isManagedRuntimeNamespace(binding: ImportedBinding): boolean {
  return (
    (binding.source === "effect/ManagedRuntime" &&
      (binding.kind === "namespace" || binding.kind === "default")) ||
    (binding.source === "effect" &&
      binding.kind === "named" &&
      binding.imported === "ManagedRuntime")
  );
}

function isNamedApi(binding: ImportedBinding, module: "Effect" | "ManagedRuntime", name: string) {
  const path = `effect/${module}`;
  return binding.kind === "named" && binding.imported === name && binding.source === path;
}

export const noPrematureExecution: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject imported Effect execution, ManagedRuntime construction, platform runMain, and final platform-layer provision outside a composition root.",
    },
    schema: [
      {
        type: "object",
        properties: {
          ...DOMAIN_SCHEMA_PROPERTIES,
          promiseRuleActive: { type: "boolean" },
          additionalFinalLayerIdentifiers: { type: "array", items: { type: "string" } },
        },
        required: REQUIRED_DOMAIN_SCHEMA_KEYS,
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
    if (role === "composition-root" || role === "test") return {};

    let effectBindings = new Map<string, ImportedBinding>();
    let platformBindings = new Map<string, ImportedBinding>();

    const effectMember = (
      call: CallExpression,
    ): { member: string; module: "Effect" | "ManagedRuntime" } | null => {
      const callee = call.callee;
      if (isIdentifier(callee)) {
        const binding = importedBindingForReference(effectBindings, callee);
        if (binding === null) return null;
        for (const member of [...RUN_MEMBERS, ...RUN_PROMISE_MEMBERS, "provide"]) {
          if (isNamedApi(binding, "Effect", member)) return { member, module: "Effect" };
        }
        if (isNamedApi(binding, "ManagedRuntime", "make")) {
          return { member: "make", module: "ManagedRuntime" };
        }
        return null;
      }
      if (callee.type !== "MemberExpression") return null;
      const memberExpression = callee as MemberExpression;
      if (!isIdentifier(memberExpression.object)) return null;
      const binding = importedBindingForReference(effectBindings, memberExpression.object);
      if (binding === null) return null;
      const member = staticPropertyName(memberExpression);
      if (member === null) return null;
      if (isEffectNamespace(binding)) return { member, module: "Effect" };
      if (isManagedRuntimeNamespace(binding)) return { member, module: "ManagedRuntime" };
      return null;
    };

    const isFinalLayerExpression = (node: Node): boolean => {
      let root = node;
      while (root.type === "MemberExpression") root = (root as MemberExpression).object;
      if (!isIdentifier(root)) return false;
      if (extraFinalLayers.has(root.name)) return true;
      const binding = importedBindingForReference(platformBindings, root);
      if (binding === null) return false;
      return (
        FINAL_LAYER_IDENTIFIER.test(binding.local.name) ||
        FINAL_LAYER_IDENTIFIER.test(binding.imported) ||
        /\/(?:Node|Bun|Deno|Browser)[A-Za-z]*(?:Services|Context)$/.test(binding.source)
      );
    };

    const platformRunMain = (call: CallExpression): ImportedBinding | null => {
      const callee = call.callee;
      if (isIdentifier(callee)) {
        const binding = importedBindingForReference(platformBindings, callee);
        return binding !== null &&
          binding.kind === "named" &&
          binding.imported === "runMain" &&
          /\/[^/]*Runtime$/.test(binding.source)
          ? binding
          : null;
      }
      if (callee.type !== "MemberExpression") return null;
      const member = callee as MemberExpression;
      if (staticPropertyName(member) !== "runMain" || !isIdentifier(member.object)) return null;
      const binding = importedBindingForReference(platformBindings, member.object);
      if (binding === null) return null;
      const runtimeNamespace =
        binding.local.name.endsWith("Runtime") ||
        binding.imported.endsWith("Runtime") ||
        /\/[^/]*Runtime$/.test(binding.source);
      return runtimeNamespace ? binding : null;
    };

    return {
      Program(program: Program) {
        const body = (program as { body?: readonly Node[] }).body ?? [];
        effectBindings = collectImportedBindings(context, body, isEffectModule);
        platformBindings = collectImportedBindings(
          context,
          body,
          (specifier) => platformPackageTarget(specifier) !== null,
        );
      },
      CallExpression(node: CallExpression) {
        const effect = effectMember(node);
        if (effect !== null) {
          const isRun = RUN_MEMBERS.has(effect.member);
          const isRunPromise = RUN_PROMISE_MEMBERS.has(effect.member);
          if (effect.module === "Effect" && (isRun || (isRunPromise && !promiseRuleActive))) {
            context.report({
              node,
              message: formatMessage({
                rule: RULE_NAME,
                finding: `Imported Effect.${effect.member} executes an Effect outside a composition root; libraries and applications may only describe programs.`,
                remedy:
                  "Move execution to the composition root (or a test with controlled execution).",
                domains,
              }),
            });
            return;
          }
          if (effect.module === "ManagedRuntime" && effect.member === "make") {
            context.report({
              node,
              message: formatMessage({
                rule: RULE_NAME,
                finding:
                  "Imported ManagedRuntime.make builds an executable runtime outside a composition root.",
                remedy: "Construct runtimes in the composition root; describe layers here instead.",
                domains,
              }),
            });
            return;
          }
          if (effect.module === "Effect" && effect.member === "provide") {
            if (node.arguments.some(isFinalLayerExpression)) {
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
            }
            return;
          }
        }

        const platformRuntime = platformRunMain(node);
        if (platformRuntime !== null) {
          context.report({
            node,
            message: formatMessage({
              rule: RULE_NAME,
              finding: `Imported ${platformRuntime.imported}.runMain runs a program outside a composition root.`,
              remedy: "Only the composition root may run the final program.",
              domains,
            }),
          });
        }
      },
    };
  },
};
