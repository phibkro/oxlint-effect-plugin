/**
 * Structural types for the ESLint-v9-compatible plugin surface Oxlint loads.
 *
 * Only the members this plugin actually uses are modeled; the shapes stay
 * assignable to both ESLint v9 and Oxlint JS-plugin expectations.
 */

import type { Comment, Node, Program, SourceLocation } from "./ast.js";

export interface ScopeReference {
  readonly identifier: Node;
}

export interface ScopeVariable {
  readonly name: string;
  /** Empty for environment-provided globals such as `Date` or `console`. */
  readonly defs: readonly unknown[];
  readonly identifiers?: readonly Node[];
  readonly references: readonly ScopeReference[];
}

export interface Scope {
  readonly type: string;
  readonly upper: Scope | null;
  readonly variables: readonly ScopeVariable[];
  /** References that resolve to no declaration in any scope. */
  readonly through: readonly ScopeReference[];
}

export interface SourceCode {
  readonly text: string;
  getScope(node: Node): Scope;
  getDeclaredVariables(node: Node): readonly ScopeVariable[];
  getAllComments(): readonly Comment[];
}

export interface ReportDescriptor {
  readonly node?: Node;
  readonly loc?: SourceLocation;
  readonly message: string;
}

export interface RuleContext {
  readonly id: string;
  readonly options: readonly unknown[];
  readonly sourceCode: SourceCode;
  report(descriptor: ReportDescriptor): void;
}

export type RuleVisitor = {
  readonly [selector: string]: ((node: never) => void) | undefined;
} & {
  readonly Program?: (node: Program) => void;
  readonly "Program:exit"?: (node: Program) => void;
};

export interface RuleMeta {
  readonly type: "problem" | "suggestion" | "layout";
  readonly docs: {
    readonly description: string;
    readonly url?: string;
  };
  readonly schema: readonly unknown[];
  readonly messages?: Readonly<Record<string, string>>;
}

export interface Rule {
  readonly meta: RuleMeta;
  create(context: RuleContext): RuleVisitor;
}

export interface PluginMeta {
  readonly name: string;
  readonly version: string;
}

export interface Plugin {
  readonly meta: PluginMeta;
  readonly rules: Readonly<Record<string, Rule>>;
}
