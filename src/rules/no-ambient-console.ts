/**
 * Observability capability: reject ambient `console` in Effect-bearing
 * operational code. Severe by default. The external escape coordinator can
 * remove a matched diagnostic through one canonical, reasoned local exception.
 * Local shadowing of `console` is not an ambient-global violation.
 */

import type {
  CallExpression,
  ExpressionStatement,
  FunctionExpression,
  Identifier,
  ImportDeclaration,
  MemberExpression,
  Node,
  Program,
} from "../ast.js";
import { isIdentifier, staticPropertyName } from "../ast.js";
import {
  collectImportedBindings,
  importedBindingForReference,
  type ImportedBinding,
} from "../bindings.js";
import { planImport, type ImportPlan } from "../import-planner.js";
import type { Fix, Fixer, Rule, RuleContext, Scope } from "../plugin-api.js";
import {
  classifyAmbientUse,
  collectAmbientReferences,
  DOMAIN_SCHEMA_PROPERTIES,
  domainOptionsOf,
  formatMessage,
  isEffectModule,
  REQUIRED_DOMAIN_SCHEMA_KEYS,
} from "../rule-support.js";

export const RULE_NAME = "no-ambient-console";

const GLOBAL_OBJECT_NAMES = new Set(["globalThis", "window", "self"]);
const YIELD_FORBIDDEN_CONTEXTS = new Set(["StaticBlock", "ClassStaticBlock"]);

function isYieldForbiddenContext(node: Node): boolean {
  return YIELD_FORBIDDEN_CONTEXTS.has(node.type);
}

function visibleVariable(
  sourceCode: RuleContext["sourceCode"],
  node: Node,
  name: string,
): ImportedBinding["variable"] | null {
  let scope: Scope | null = sourceCode.getScope(node);
  while (scope !== null) {
    const variable = scope.variables.find((candidate) => candidate.name === name);
    if (variable !== undefined) return variable;
    scope = scope.upper;
  }
  return null;
}

function sameVariable(
  left: ImportedBinding["variable"],
  right: ImportedBinding["variable"],
): boolean {
  if (left === right) return true;
  if (left.name !== right.name) return false;
  return (left.identifiers ?? []).some((leftIdentifier) =>
    (right.identifiers ?? []).some((rightIdentifier) => {
      if (leftIdentifier === rightIdentifier) return true;
      const leftRange = leftIdentifier.range;
      const rightRange = rightIdentifier.range;
      return (
        leftRange !== undefined &&
        rightRange !== undefined &&
        leftRange[0] === rightRange[0] &&
        leftRange[1] === rightRange[1]
      );
    }),
  );
}

function bindingsVisibleFrom(
  sourceCode: RuleContext["sourceCode"],
  node: Node,
  topLevelBindings: ReadonlySet<string>,
): Set<string> {
  const bindings = new Set(topLevelBindings);
  let scope: Scope | null = sourceCode.getScope(node);
  while (scope !== null) {
    for (const variable of scope.variables) bindings.add(variable.name);
    scope = scope.upper;
  }
  return bindings;
}

function importedConsoleIsShadowed(
  sourceCode: RuleContext["sourceCode"],
  node: Node,
  effectBindings: ReadonlyMap<string, ImportedBinding>,
  local: string,
): boolean {
  for (const binding of effectBindings.values()) {
    if (
      binding.source === "effect" &&
      binding.kind === "named" &&
      binding.imported === "Console" &&
      binding.local.name === local
    ) {
      const visible = visibleVariable(sourceCode, node, local);
      return visible === null || !sameVariable(visible, binding.variable);
    }
  }
  return false;
}

interface ConsoleFixPlan {
  readonly replacementRange: readonly [number, number];
  readonly replacementText: string;
  readonly importPlan: ImportPlan;
}

function isEffectNamespaceBinding(binding: ImportedBinding): boolean {
  return (
    (binding.source === "effect" &&
      ((binding.kind === "named" && binding.imported === "Effect") ||
        binding.kind === "namespace")) ||
    (binding.source === "effect/Effect" &&
      (binding.kind === "namespace" || binding.kind === "default"))
  );
}

function isEffectGenCall(
  call: CallExpression,
  effectBindings: ReadonlyMap<string, ImportedBinding>,
): boolean {
  if (call.callee.type !== "MemberExpression") return false;
  const member = call.callee as MemberExpression;
  if (staticPropertyName(member) !== "gen" || !isIdentifier(member.object)) return false;
  const binding = importedBindingForReference(effectBindings, member.object);
  return binding !== null && isEffectNamespaceBinding(binding);
}

function generatorContaining(
  statement: ExpressionStatement,
  effectBindings: ReadonlyMap<string, ImportedBinding>,
): FunctionExpression | null {
  let current: Node = statement;
  while (current.parent != null) {
    const parent: Node = current.parent;
    if (isYieldForbiddenContext(parent)) return null;
    if (parent.type === "FunctionExpression") {
      const generator = parent as FunctionExpression;
      if (generator.generator !== true) return null;
      const invocation = generator.parent;
      if (invocation?.type !== "CallExpression") return null;
      const call = invocation as CallExpression;
      if (call.arguments[0] !== generator || !isEffectGenCall(call, effectBindings)) return null;
      return generator;
    }
    if (
      parent.type === "FunctionDeclaration" ||
      parent.type === "ArrowFunctionExpression" ||
      parent.type === "MethodDefinition"
    ) {
      return null;
    }
    current = parent;
  }
  return null;
}

function consoleLogFix(
  identifier: Identifier,
  ambientConsole: ReadonlySet<Identifier>,
  effectBindings: ReadonlyMap<string, ImportedBinding>,
  sourceCode: RuleContext["sourceCode"],
  sourceText: string,
  importDeclarations: readonly ImportDeclaration[],
  topLevelBindings: ReadonlySet<string>,
): ConsoleFixPlan | null {
  if (!ambientConsole.has(identifier)) return null;
  const memberNode = identifier.parent;
  if (memberNode?.type !== "MemberExpression") return null;
  const member = memberNode as MemberExpression;
  if (member.object !== identifier || member.computed || staticPropertyName(member) !== "log") {
    return null;
  }
  const callNode = member.parent;
  if (callNode?.type !== "CallExpression") return null;
  const call = callNode as CallExpression;
  if (call.callee !== member) return null;
  const statementNode = call.parent;
  if (statementNode?.type !== "ExpressionStatement") return null;
  const statement = statementNode as ExpressionStatement;
  if (statement.expression !== call || generatorContaining(statement, effectBindings) === null) {
    return null;
  }
  const callRange = call.range;
  const memberRange = member.range;
  if (callRange === undefined || memberRange === undefined) return null;
  if (memberRange[1] > callRange[1] || callRange[0] > memberRange[0]) return null;
  const callSuffix = sourceText.slice(memberRange[1], callRange[1]);
  const importPlan = planImport({
    sourceText,
    importDeclarations,
    topLevelBindings: bindingsVisibleFrom(sourceCode, call, topLevelBindings),
    request: { module: "effect", symbol: "Console", preferredLocal: "Console" },
  });
  if (importPlan === null) return null;
  if (importedConsoleIsShadowed(sourceCode, call, effectBindings, importPlan.local)) return null;
  return {
    replacementRange: callRange,
    replacementText: `yield* ${importPlan.local}.log${callSuffix}`,
    importPlan,
  };
}

export const noAmbientConsole: Rule = {
  meta: {
    type: "problem",
    fixable: "code",
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
        const body = (program as Program & { readonly body?: readonly Node[] }).body ?? [];
        const effectBindings = collectImportedBindings(context, body, isEffectModule);
        const importDeclarations = body.filter(
          (node): node is ImportDeclaration => node.type === "ImportDeclaration",
        );
        const topLevelBindings = new Set(globalScope.variables.map((variable) => variable.name));
        for (const node of body) {
          for (const variable of context.sourceCode.getDeclaredVariables(node)) {
            topLevelBindings.add(variable.name);
          }
        }
        const ambientConsole = new Set(ambient.get("console") ?? []);
        const hits: {
          identifier: Identifier;
          reportNode: Node;
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

        for (const hit of hits) {
          const fixPlan = consoleLogFix(
            hit.identifier,
            ambientConsole,
            effectBindings,
            context.sourceCode,
            context.sourceCode.text,
            importDeclarations,
            topLevelBindings,
          );
          context.report({
            node: hit.reportNode,
            message: formatMessage({
              rule: RULE_NAME,
              finding: "Ambient console output bypasses the Effect observability capability.",
              remedy:
                "Use Effect.log*, effect/Console, or an injected logging service. If external interop requires an escape, use the canonical two-line reasoned local exception and run the escape audit.",
              domains,
            }),
            ...(fixPlan === null
              ? {}
              : {
                  fix: (fixer: Fixer): readonly Fix[] => [
                    fixer.replaceTextRange(fixPlan.replacementRange, fixPlan.replacementText),
                    ...fixPlan.importPlan.edits.map((edit) =>
                      edit.range[0] === edit.range[1]
                        ? fixer.insertTextBeforeRange(edit.range, edit.text)
                        : fixer.replaceTextRange(edit.range, edit.text),
                    ),
                  ],
                }),
          });
        }
      },
    };
  },
};
