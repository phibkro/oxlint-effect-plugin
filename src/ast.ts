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
}

export interface ImportSpecifierNode extends BaseNode {
  readonly type: "ImportSpecifier" | "ImportDefaultSpecifier" | "ImportNamespaceSpecifier";
  readonly local: Identifier;
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
