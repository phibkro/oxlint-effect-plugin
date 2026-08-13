import { existsSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import type { Node, Program } from "@oxc-project/types";
import { parseSync, type Comment, type StaticImport } from "oxc-parser";
import type { EffxDiagnostic, EffxProject, ProjectGroup, SourceSnapshot } from "./effx-types.js";
import { EffxFailure } from "./effx-types.js";
import type { ImportEdge, ImportKind, ImportTarget } from "./import-closure.js";
import { groupsForPath } from "./project.js";
import type { RuleDiagnostic, SyntaxTarget } from "./suppression.js";

export interface SourceAnalysis {
  readonly comments: readonly Comment[];
  readonly syntaxTargets: readonly SyntaxTarget[];
  readonly ruleDiagnostics: readonly RuleDiagnostic[];
  readonly importEdges: readonly ImportEdge[];
}

interface NodeIndex {
  readonly nodes: readonly Node[];
  readonly parents: ReadonlyMap<Node, Node>;
}

const normalize = (path: string): string => path.split(sep).join("/");
const toLineColumn = (text: string, offset: number): { line: number; column: number } => {
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
};

const indexNodes = (program: Program): NodeIndex => {
  const nodes: Node[] = [];
  const parents = new Map<Node, Node>();
  const seen = new Set<object>();
  const visit = (value: unknown, parent?: Node): void => {
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, parent);
      return;
    }
    const record = value as Record<string, unknown>;
    const isNode =
      typeof record.type === "string" &&
      typeof record.start === "number" &&
      typeof record.end === "number";
    const current = isNode ? (value as Node) : parent;
    if (isNode) {
      const node = value as Node;
      nodes.push(node);
      if (parent !== undefined) parents.set(node, parent);
    }
    for (const child of Object.values(record)) visit(child, current);
  };
  visit(program);
  return {
    nodes: nodes.toSorted((left, right) => left.start - right.start || right.end - left.end),
    parents,
  };
};

const isBlock = (node: Node): boolean =>
  node.type === "Program" ||
  node.type === "BlockStatement" ||
  node.type === "StaticBlock" ||
  node.type === "TSModuleBlock";
const containingBlock = (node: Node, parents: ReadonlyMap<Node, Node>): Node => {
  let current = node;
  while (true) {
    const parent = parents.get(current);
    if (parent === undefined || isBlock(parent)) return parent ?? current;
    current = parent;
  }
};

const syntaxTargets = (comments: readonly Comment[], index: NodeIndex): readonly SyntaxTarget[] =>
  comments
    .filter(({ value }) => value.includes("oxlint-effect-plugin allow("))
    .map((comment, directiveIndex) => {
      const target = index.nodes.find(
        (node) => node.start >= comment.end && node.type.endsWith("Statement"),
      );
      if (target === undefined) return { directiveIndex, sameLexicalBlock: false, isNext: false };
      const block = containingBlock(target, index.parents);
      return {
        directiveIndex,
        nodeRange: { start: target.start, end: target.end },
        blockRange: { start: block.start, end: block.end },
        sameLexicalBlock:
          block.type === "Program" || (comment.start >= block.start && comment.end <= block.end),
        isNext: true,
      };
    });

const packageRoot = (specifier: string): string =>
  specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : (specifier.split("/")[0] ?? specifier);

const platformOf = (specifier: string): ImportTarget | null => {
  if (specifier === "effect" || specifier.startsWith("effect/")) return { kind: "effect" };
  const match = /^@effect\/platform-(node|bun|browser|deno|worker)(?:\/|$)/.exec(specifier);
  if (match === null) return null;
  const platform = match[1] === "worker" ? "web-worker" : match[1];
  if (
    platform !== "node" &&
    platform !== "bun" &&
    platform !== "browser" &&
    platform !== "deno" &&
    platform !== "web-worker"
  )
    return null;
  return { kind: "effect", platform };
};

const resolveLocal = (importer: string, specifier: string): string | null => {
  const base = isAbsolute(specifier) ? specifier : resolve(dirname(importer), specifier);
  const emittedExtension = /\.(?:js|jsx|mjs|cjs)$/.exec(base)?.[0];
  const sourceBase =
    emittedExtension === undefined
      ? []
      : [
          `${base.slice(0, -emittedExtension.length)}${
            emittedExtension === ".mjs"
              ? ".mts"
              : emittedExtension === ".cjs"
                ? ".cts"
                : emittedExtension === ".jsx"
                  ? ".tsx"
                  : ".ts"
          }`,
        ];
  const candidates = [
    base,
    ...sourceBase,
    ...[".ts", ".tsx", ".mts", ".cts"].map((suffix) => `${base}${suffix}`),
    ...["index.ts", "index.tsx", "index.mts", "index.cts"].map((name) => resolve(base, name)),
  ];
  return candidates.find(existsSync) ?? null;
};

const importKind = (entry: StaticImport): ImportKind =>
  entry.entries.length === 0
    ? "side-effect"
    : entry.entries.every(({ isType }) => isType)
      ? "type"
      : "value";

const targetOf = (
  project: EffxProject,
  snapshot: SourceSnapshot,
  specifier: string,
): ImportTarget => {
  const effect = platformOf(specifier);
  if (effect !== null) return effect;
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const resolved = resolveLocal(snapshot.path, specifier);
    if (resolved === null) return { kind: "unknown" };
    const group = groupsForPath(project, resolved)[0];
    return group === undefined ? { kind: "unknown" } : { kind: "project", role: group.role };
  }
  const manifest = resolve(project.root, "node_modules", packageRoot(specifier), "package.json");
  return existsSync(manifest) ||
    project.importPolicy.trustedPureDependencies.some(
      ({ specifier: trusted }) => trusted === specifier,
    ) ||
    project.groups.some(({ adapterDependencies }) =>
      adapterDependencies.some(
        (dependency) => specifier === dependency || specifier.startsWith(`${dependency}/`),
      ),
    )
    ? { kind: "package" }
    : { kind: "unknown" };
};

const edges = (
  project: EffxProject,
  snapshot: SourceSnapshot,
  group: ProjectGroup,
  imports: readonly StaticImport[],
): readonly ImportEdge[] =>
  imports.map((entry) => {
    const position = toLineColumn(snapshot.text, entry.moduleRequest.start);
    return {
      importer: {
        file: normalize(relative(project.root, snapshot.path)),
        role: group.role,
        platform: group.platform,
        adapterDependencies: group.adapterDependencies,
      },
      target: targetOf(project, snapshot, entry.moduleRequest.value),
      specifier: entry.moduleRequest.value,
      kind: importKind(entry),
      span: {
        offset: entry.moduleRequest.start,
        length: entry.moduleRequest.end - entry.moduleRequest.start,
        ...position,
      },
    };
  });

const isRuleDiagnosticFor = (
  diagnostic: EffxDiagnostic,
  snapshot: SourceSnapshot,
): diagnostic is EffxDiagnostic & {
  readonly governed: true;
  readonly subject: { readonly kind: "rule"; readonly ruleName: string };
} =>
  diagnostic.governed &&
  diagnostic.subject.kind === "rule" &&
  diagnostic.source.uri === snapshot.uri;

export function analyzeSource(
  project: EffxProject,
  snapshot: SourceSnapshot,
  diagnostics: readonly EffxDiagnostic[],
): SourceAnalysis {
  const parsed = parseSync(snapshot.path, snapshot.text, {
    lang: extname(snapshot.path) === ".tsx" ? "tsx" : "ts",
    sourceType: "module",
    range: true,
  });
  const errors = parsed.errors.filter(({ severity }) => severity === "Error");
  if (errors.length > 0)
    throw new EffxFailure(
      "EFFX_PARSE_FAILED",
      `effx: could not parse ${snapshot.path}: ${errors.map(({ message }) => message).join("; ")}`,
    );
  const group = groupsForPath(project, snapshot.path)[0];
  if (group === undefined)
    throw new EffxFailure("EFFX_CONFIG_INVALID", `effx: no group governs ${snapshot.path}`);
  return {
    comments: parsed.comments,
    syntaxTargets: syntaxTargets(parsed.comments, indexNodes(parsed.program)),
    ruleDiagnostics: diagnostics
      .filter((diagnostic) => isRuleDiagnosticFor(diagnostic, snapshot))
      .map((diagnostic) => ({
        rule: diagnostic.subject.ruleName,
        range: diagnostic.range,
        diagnostic,
      })),
    importEdges: edges(project, snapshot, group, parsed.module.staticImports),
  };
}
