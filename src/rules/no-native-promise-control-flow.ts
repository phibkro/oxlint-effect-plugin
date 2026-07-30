/**
 * Effect execution topology: native Promise control flow bypasses Effect's
 * structured concurrency, error channel, and interruption model.
 *
 * Severe in `effect-library`, `service`, and `application` roles for:
 * async functions/methods/arrows, `await` expressions, `new Promise`,
 * ambient `Promise` static control-flow methods (`all`, `allSettled`, `any`,
 * `race`, `resolve`, `reject`, `try`, `withResolvers`), and
 * `Effect.runPromise*` variants outside admitted composition-root/test
 * domains.
 *
 * Runtime adapters may use native Promise mechanics only inside the argument
 * of `Effect.tryPromise`, `Effect.promise` (genuinely non-rejecting
 * promises), or `Effect.async` (with cancellation mapped where available).
 *
 * Not diagnosed (syntax/scope cannot establish them): `Promise` type
 * references and declared external Promise signatures, promise-returning
 * expressions, and `.then`/`.catch`/`.finally` on arbitrary values — those
 * belong to the type-aware `@effect/tsgo` companion.
 * Local shadowing of `Promise` and Effect bindings is respected.
 */

import type { CallExpression, MemberExpression, Node, Program } from "../ast.js";
import { isIdentifier, staticPropertyName } from "../ast.js";
import type { Rule, RuleContext } from "../plugin-api.js";
import {
  classifyAmbientUse,
  collectAmbientReferences,
  collectImportedBindings,
  domainOptionsOf,
  findEnclosing,
  formatMessage,
  isEffectModule,
} from "../rule-support.js";
import { RUN_PROMISE_MEMBERS } from "./no-premature-execution.js";

export const RULE_NAME = "no-native-promise-control-flow";

const PROMISE_STATIC_CONTROL_FLOW = new Set([
  "all", "allSettled", "any", "race", "resolve", "reject", "try", "withResolvers",
]);

const EFFECT_PROMISE_WRAPPERS = new Set(["tryPromise", "promise", "async"]);

const ASYNC_FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

export const noNativePromiseControlFlow: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject native Promise control flow (async/await, new Promise, Promise combinators, Effect.runPromise*) in Effect-bearing roles outside composition roots and tests.",
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
    const role = domains.role;

    if (role === "composition-root" || role === "test") return {};

    const adapterMode = role === "runtime-adapter";

    let effectBindings = new Map<string, string>();

    const isEffectNamespaceName = (name: string): boolean => {
      const source = effectBindings.get(name);
      return source === "effect" || source === "effect/Effect";
    };

    /**
     * Runtime-adapter allowance: the node lives inside an argument of
     * `Effect.tryPromise`, `Effect.promise`, or `Effect.async`.
     */
    const isInsideEffectPromiseWrapper = (node: Node): boolean => {
      const wrapper = findEnclosing(node, (candidate) => {
        if (candidate.type !== "CallExpression") return false;
        const callee = (candidate as CallExpression).callee;
        if (callee.type !== "MemberExpression") return false;
        const member = callee as MemberExpression;
        if (!isIdentifier(member.object) || !isEffectNamespaceName(member.object.name)) return false;
        const property = staticPropertyName(member);
        return property !== null && EFFECT_PROMISE_WRAPPERS.has(property);
      });
      return wrapper !== null;
    };

    const report = (node: Node, finding: string): void => {
      if (adapterMode && isInsideEffectPromiseWrapper(node)) return;
      context.report({
        node,
        message: formatMessage({
          rule: RULE_NAME,
          finding,
          remedy: adapterMode
            ? "Runtime adapters may use native Promise mechanics only inside Effect.tryPromise, Effect.promise (non-rejecting), or Effect.async with cancellation mapped where available."
            : "Model the computation as an Effect (Effect.gen, Effect.tryPromise at a runtime adapter, structured concurrency combinators); only the composition root or a test may run promises.",
          domains,
        }),
      });
    };

    const checkFunction = (node: Node): void => {
      if ((node as { async?: boolean }).async === true) {
        report(node, "Async function declares native Promise control flow outside Effect.");
      }
    };

    return {
      Program(program: Program) {
        const body = (program as { body?: readonly Node[] }).body ?? [];
        effectBindings = collectImportedBindings(body, isEffectModule);
      },
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
      AwaitExpression(node: Node) {
        // The enclosing async function is already reported; still report the
        // await site when it is not inside a reported async function in the
        // same file (top-level await).
        const enclosing = findEnclosing(node, (candidate) => ASYNC_FUNCTION_TYPES.has(candidate.type));
        if (enclosing === null) {
          report(node, "Top-level await executes native Promise control flow outside Effect.");
        }
      },
      "Program:exit"(program: Program) {
        const globalScope = context.sourceCode.getScope(program);
        const ambient = collectAmbientReferences(globalScope);
        for (const identifier of ambient.get("Promise") ?? []) {
          const use = classifyAmbientUse(identifier);
          if (use.kind === "new") {
            report(use.reportNode, "`new Promise` constructs native promise control flow outside Effect.");
          } else if (use.kind === "member" && use.property !== null && PROMISE_STATIC_CONTROL_FLOW.has(use.property)) {
            report(use.reportNode, `\`Promise.${use.property}\` orchestrates native promise control flow outside Effect.`);
          }
        }
      },
      CallExpression(node: CallExpression) {
        if (node.callee.type !== "MemberExpression") return;
        const member = node.callee as MemberExpression;
        if (!isIdentifier(member.object) || !isEffectNamespaceName(member.object.name)) return;
        const property = staticPropertyName(member);
        if (property !== null && RUN_PROMISE_MEMBERS.has(property)) {
          context.report({
            node,
            message: formatMessage({
              rule: RULE_NAME,
              finding: `\`${member.object.name}.${property}\` executes an Effect as a native promise outside an admitted composition-root or test domain.`,
              remedy: "Move final promise execution to the composition root.",
              domains,
            }),
          });
        }
      },
    };
  },
};
