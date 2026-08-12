/**
 * Minimal structural AST types for the ESTree shapes this plugin inspects.
 *
 * The plugin deliberately owns these narrow types instead of depending on
 * `@types/estree`: Oxlint hands rules ESTree-compatible nodes with an added
 * `parent` link (as ESLint does), and the rules only navigate the small
 * surface described here.
 */

export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

export interface SourceLocation {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

export interface BaseNode {
  readonly type: string;
  readonly loc: SourceLocation;
  readonly range?: readonly [number, number];
  readonly parent?: Node | null;
}

export interface Identifier extends BaseNode {
  readonly type: "Identifier";
  readonly name: string;
}

export interface Literal extends BaseNode {
  readonly type: "Literal";
  readonly value: string | number | boolean | null | RegExp | bigint;
}

export interface MemberExpression extends BaseNode {
  readonly type: "MemberExpression";
  readonly object: Node;
  readonly property: Node;
  readonly computed: boolean;
}

export interface CallExpression extends BaseNode {
  readonly type: "CallExpression";
  readonly callee: Node;
  readonly arguments: readonly Node[];
}

export interface NewExpression extends BaseNode {
  readonly type: "NewExpression";
  readonly callee: Node;
  readonly arguments: readonly Node[];
}

export interface ImportDeclaration extends BaseNode {
  readonly type: "ImportDeclaration";
  readonly source: Literal;
  readonly specifiers: readonly Node[];
  readonly importKind?: "type" | "value";
  /** ESTree import attributes/assertions; either makes a merge unsafe. */
  readonly attributes?: readonly unknown[];
  readonly assertions?: readonly unknown[];
}

export interface ImportSpecifierNode extends BaseNode {
  readonly type: "ImportSpecifier" | "ImportDefaultSpecifier" | "ImportNamespaceSpecifier";
  readonly local: Identifier;
  /** Present only for `ImportSpecifier`; Oxc follows the ESTree shape. */
  readonly imported?: Identifier | Literal;
  readonly importKind?: "type" | "value";
}

export interface ExpressionStatement extends BaseNode {
  readonly type: "ExpressionStatement";
  readonly expression: Node;
}

export interface BlockStatement extends BaseNode {
  readonly type: "BlockStatement";
  readonly body: readonly Node[];
}

export interface FunctionExpression extends BaseNode {
  readonly type: "FunctionExpression";
  readonly id: Identifier | null;
  readonly params: readonly Node[];
  readonly body: Node;
  readonly generator?: boolean;
  readonly async?: boolean;
}

export interface YieldExpression extends BaseNode {
  readonly type: "YieldExpression";
  readonly argument: Node | null;
  readonly delegate: boolean;
}

export interface VariableDeclarator extends BaseNode {
  readonly type: "VariableDeclarator";
  readonly id: Node;
  readonly init: Node | null;
}

export interface VariableDeclaration extends BaseNode {
  readonly type: "VariableDeclaration";
  readonly kind: "const" | "let" | "var" | "using" | "await using";
  readonly declarations: readonly VariableDeclarator[];
}

export interface ExportNamedDeclaration extends BaseNode {
  readonly type: "ExportNamedDeclaration";
  readonly source: Literal | null;
}

export interface ExportAllDeclaration extends BaseNode {
  readonly type: "ExportAllDeclaration";
  readonly source: Literal;
}

export interface ImportExpression extends BaseNode {
  readonly type: "ImportExpression";
  readonly source: Node;
}

export interface ThrowStatement extends BaseNode {
  readonly type: "ThrowStatement";
  readonly argument: Node;
}

export interface Program extends BaseNode {
  readonly type: "Program";
  readonly body?: readonly Node[];
}

/** Catch-all for nodes the plugin does not narrow further. */
export interface UnknownNode extends BaseNode {
  readonly [key: string]: unknown;
}

export type Node =
  | Identifier
  | Literal
  | MemberExpression
  | CallExpression
  | NewExpression
  | ImportDeclaration
  | ImportSpecifierNode
  | ExpressionStatement
  | BlockStatement
  | FunctionExpression
  | YieldExpression
  | VariableDeclarator
  | VariableDeclaration
  | ExportNamedDeclaration
  | ExportAllDeclaration
  | ImportExpression
  | ThrowStatement
  | Program
  | UnknownNode;

export interface Comment {
  readonly type: "Line" | "Block";
  readonly value: string;
  readonly loc: SourceLocation;
}

export function isIdentifier(node: Node | null | undefined, name?: string): node is Identifier {
  if (node == null || node.type !== "Identifier") return false;
  return name === undefined || (node as Identifier).name === name;
}

/**
 * Static property name of a member expression: `a.b` and `a["b"]` both give
 * `"b"`; a computed non-literal property gives `null`.
 */
export function staticPropertyName(member: MemberExpression): string | null {
  if (!member.computed && isIdentifier(member.property)) return member.property.name;
  if (member.computed && member.property.type === "Literal") {
    const value = (member.property as Literal).value;
    return typeof value === "string" ? value : null;
  }
  return null;
}
