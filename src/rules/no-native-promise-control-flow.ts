/**
 * Reject high-confidence native Promise control flow in Effect-owned roles.
 *
 * Detection is Oxc AST + lexical-scope analysis. Imported Effect APIs and
 * immutable Promise aliases are matched by resolved binding identity, never
 * identifier spelling. Type-dependent promise-returning expressions and
 * arbitrary `.then`/`.catch`/`.finally` remain @effect/tsgo's responsibility.
 */

import type {
  CallExpression,
  Identifier,
  MemberExpression,
  NewExpression,
  Node,
  Program,
  VariableDeclarator,
} from "../ast.js";
import { isIdentifier, staticPropertyName } from "../ast.js";
import {
  collectImportedBindings,
  declaredVariable,
  importedBindingForReference,
  isAmbientReference,
  variableOwnsReference,
  type ImportedBinding,
} from "../bindings.js";
import type { Rule, RuleContext, ScopeVariable } from "../plugin-api.js";
import {
  DOMAIN_SCHEMA_PROPERTIES,
  domainOptionsOf,
  findEnclosing,
  formatMessage,
  isEffectModule,
  REQUIRED_DOMAIN_SCHEMA_KEYS,
} from "../rule-support.js";
import { RUN_PROMISE_MEMBERS } from "./no-premature-execution.js";

export const RULE_NAME = "no-native-promise-control-flow";

const PROMISE_STATIC_CONTROL_FLOW = new Set([
  "all",
  "allSettled",
  "any",
  "race",
  "resolve",
  "reject",
  "try",
  "withResolvers",
]);
const EFFECT_PROMISE_WRAPPERS = new Set(["tryPromise", "promise", "async"]);
const ASYNC_FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

function isEffectNamespace(binding: ImportedBinding): boolean {
  return (
    (binding.source === "effect/Effect" &&
      (binding.kind === "namespace" || binding.kind === "default")) ||
    (binding.source === "effect" && binding.kind === "named" && binding.imported === "Effect")
  );
}

function isNamedEffectApi(binding: ImportedBinding, member: string): boolean {
  return (
    binding.kind === "named" && binding.imported === member && binding.source === "effect/Effect"
  );
}

export const noNativePromiseControlFlow: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject native Promise control flow (async/await, Promise construction/combinators, Effect.runPromise*) in Effect-owned roles outside composition roots and tests.",
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
    const role = domains.role;
    if (role === "composition-root" || role === "test") return {};

    const adapterMode = role === "runtime-adapter";
    let effectBindings = new Map<string, ImportedBinding>();
    const promiseAliases = new Set<ScopeVariable>();

    const effectCallMember = (call: CallExpression): string | null => {
      const callee = call.callee;
      if (isIdentifier(callee)) {
        const binding = importedBindingForReference(effectBindings, callee);
        if (binding === null) return null;
        for (const member of [...EFFECT_PROMISE_WRAPPERS, ...RUN_PROMISE_MEMBERS]) {
          if (isNamedEffectApi(binding, member)) return member;
        }
        return null;
      }
      if (callee.type !== "MemberExpression") return null;
      const member = callee as MemberExpression;
      if (!isIdentifier(member.object)) return null;
      const binding = importedBindingForReference(effectBindings, member.object);
      if (binding === null || !isEffectNamespace(binding)) return null;
      return staticPropertyName(member);
    };

    const isInsideEffectPromiseWrapper = (node: Node): boolean =>
      findEnclosing(node, (candidate) => {
        if (candidate.type !== "CallExpression") return false;
        const member = effectCallMember(candidate as CallExpression);
        return member !== null && EFFECT_PROMISE_WRAPPERS.has(member);
      }) !== null;

    const report = (node: Node, finding: string): void => {
      if (adapterMode && isInsideEffectPromiseWrapper(node)) return;
      context.report({
        node,
        message: formatMessage({
          rule: RULE_NAME,
          finding,
          remedy: adapterMode
            ? "Runtime adapters may use native Promise mechanics only inside an imported Effect.tryPromise, Effect.promise (non-rejecting), or Effect.async boundary with cancellation mapped where available."
            : "Model the computation as an Effect and keep final promise execution in a composition root or controlled test.",
          domains,
        }),
      });
    };

    const isAmbientGlobalObject = (node: Node): node is Identifier =>
      isIdentifier(node) &&
      (node.name === "globalThis" || node.name === "window" || node.name === "self") &&
      isAmbientReference(context, node);

    const isPromiseValue = (node: Node): boolean => {
      if (isIdentifier(node)) {
        if (node.name === "Promise" && isAmbientReference(context, node)) return true;
        for (const alias of promiseAliases) {
          if (variableOwnsReference(alias, node)) return true;
        }
        return false;
      }
      if (node.type !== "MemberExpression") return false;
      const member = node as MemberExpression;
      return isAmbientGlobalObject(member.object) && staticPropertyName(member) === "Promise";
    };

    const checkFunction = (node: Node): void => {
      if ((node as { async?: boolean }).async === true) {
        report(node, "Async function declares native Promise control flow outside Effect.");
      }
    };

    return {
      Program(program: Program) {
        const body = (program as { body?: readonly Node[] }).body ?? [];
        effectBindings = collectImportedBindings(context, body, isEffectModule);
      },
      VariableDeclarator(node: VariableDeclarator) {
        const parent = node.parent;
        if (parent?.type !== "VariableDeclaration") return;
        if ((parent as { kind?: string }).kind !== "const") return;
        if (!isIdentifier(node.id) || node.init === null || !isPromiseValue(node.init)) return;
        const variable = declaredVariable(context, node, node.id);
        if (variable !== null) promiseAliases.add(variable);
      },
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
      AwaitExpression(node: Node) {
        const enclosing = findEnclosing(node, (candidate) =>
          ASYNC_FUNCTION_TYPES.has(candidate.type),
        );
        if (enclosing === null) {
          report(node, "Top-level await executes native Promise control flow outside Effect.");
        }
      },
      ForOfStatement(node: Node) {
        if ((node as { await?: boolean }).await !== true) return;
        const enclosing = findEnclosing(node, (candidate) =>
          ASYNC_FUNCTION_TYPES.has(candidate.type),
        );
        if (enclosing === null) {
          report(
            node,
            "Top-level `for await` executes native Promise control flow outside Effect.",
          );
        }
      },
      NewExpression(node: NewExpression) {
        if (isPromiseValue(node.callee)) {
          report(node, "`new Promise` constructs native promise control flow outside Effect.");
        }
      },
      CallExpression(node: CallExpression) {
        const effectMember = effectCallMember(node);
        if (effectMember !== null && RUN_PROMISE_MEMBERS.has(effectMember)) {
          context.report({
            node,
            message: formatMessage({
              rule: RULE_NAME,
              finding: `Imported Effect.${effectMember} executes an Effect as a native promise outside an admitted composition-root or test domain.`,
              remedy: "Move final promise execution to the composition root.",
              domains,
            }),
          });
          return;
        }

        if (node.callee.type !== "MemberExpression") return;
        const member = node.callee as MemberExpression;
        const property = staticPropertyName(member);
        if (
          property !== null &&
          PROMISE_STATIC_CONTROL_FLOW.has(property) &&
          isPromiseValue(member.object)
        ) {
          report(
            node,
            `\`Promise.${property}\` orchestrates native promise control flow outside Effect.`,
          );
        }
      },
    };
  },
};
