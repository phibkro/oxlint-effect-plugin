import {
  isFunctionLikeDeclaration,
  isReturnStatement,
  type FunctionLikeDeclaration,
  type Node,
  type SourceFile,
  type TypeNode,
} from "typescript/unstable/ast";
import { API, type Project, type Type } from "typescript/unstable/async";
import { version as typescriptVersion } from "typescript";
import { dirname, resolve } from "node:path";

const configFile = resolve(process.argv[2] ?? "tsconfig.json");
const cwd = dirname(configFile);
const relationFileSuffix = "/fixtures/relation.ts";
const effectDeclarationPattern =
  /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?effect\/dist\/Effect\.d\.ts$/;

interface Span {
  readonly file: string;
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly character: number;
}

interface TypeArgumentSummary {
  readonly id: number;
  readonly flags: number;
  readonly text: string;
  readonly symbol?: string | undefined;
}

interface TypeSummary {
  readonly id: number;
  readonly flags: number;
  readonly text: string;
  readonly symbol?:
    | {
        readonly name: string;
        readonly declarations: readonly string[];
      }
    | undefined;
  readonly aliasSymbol?:
    | {
        readonly name: string;
        readonly declarations: readonly string[];
      }
    | undefined;
  readonly typeArguments: readonly TypeArgumentSummary[];
  readonly aliasTypeArguments: readonly TypeArgumentSummary[];
}

interface ChannelEvidence {
  readonly index: 0 | 1 | 2;
  readonly channel: "success" | "error" | "context";
  readonly expected: TypeArgumentSummary;
  readonly actual: TypeArgumentSummary;
  readonly actualAssignableToExpected: boolean;
}

interface RelationEvidence {
  readonly span: Span;
  readonly expected: TypeSummary;
  readonly actual: TypeSummary;
  readonly expectedTypeNode: string;
  readonly effectTypeIdentity: {
    readonly expected: boolean;
    readonly actual: boolean;
    readonly expectedDeclaration?: string | undefined;
    readonly actualDeclaration?: string | undefined;
  };
  readonly channels: readonly ChannelEvidence[];
  readonly overallAssignable: boolean;
}

const declarationPaths = (
  symbol: { readonly declarations: readonly { readonly path: string }[] } | undefined,
): readonly string[] =>
  symbol?.declarations.map((declaration) => declaration.path.replaceAll("\\", "/")) ?? [];

const symbolSummary = async (
  type: Type,
  alias: boolean,
): Promise<TypeSummary["symbol"] | TypeSummary["aliasSymbol"]> => {
  const symbol = alias ? await type.getAliasSymbol() : await type.getSymbol();
  if (symbol === undefined) return undefined;
  return {
    name: symbol.name,
    declarations: declarationPaths(symbol),
  };
};

const shallowType = async (project: Project, type: Type): Promise<TypeArgumentSummary> => {
  const symbol = await type.getSymbol();
  return {
    id: type.id,
    flags: type.flags,
    text: await project.checker.typeToString(type),
    symbol: symbol?.name,
  };
};

const typeSummary = async (project: Project, type: Type): Promise<TypeSummary> => {
  const typeArguments = type.isTypeReference() ? await project.checker.getTypeArguments(type) : [];
  const aliasTypeArguments = await type.getAliasTypeArguments();
  return {
    id: type.id,
    flags: type.flags,
    text: await project.checker.typeToString(type),
    symbol: await symbolSummary(type, false),
    aliasSymbol: await symbolSummary(type, true),
    typeArguments: await Promise.all(
      typeArguments.map((argument) => shallowType(project, argument)),
    ),
    aliasTypeArguments: await Promise.all(
      aliasTypeArguments.map((argument) => shallowType(project, argument)),
    ),
  };
};

const enclosingFunction = (node: Node): FunctionLikeDeclaration | undefined => {
  let parent = node.parent;
  while (parent !== undefined) {
    if (isFunctionLikeDeclaration(parent)) return parent;
    parent = parent.parent;
  }
  return undefined;
};

const identifyEffect = async (
  type: Type,
): Promise<{ readonly matched: boolean; readonly declaration?: string }> => {
  // This is a declaration-identity check, not a string search over a rendered type.
  const symbols = [await type.getSymbol(), await type.getAliasSymbol()];
  for (const symbol of symbols) {
    if (symbol?.name !== "Effect") continue;
    const declaration = declarationPaths(symbol).find((path) =>
      effectDeclarationPattern.test(path),
    );
    if (declaration !== undefined) return { matched: true, declaration };
  }
  return { matched: false };
};

const typeNodeText = async (project: Project, node: TypeNode): Promise<string> => {
  const type = await project.checker.getTypeFromTypeNode(node);
  return type === undefined ? "<unavailable>" : project.checker.typeToString(type);
};

const collectRelation = async (
  project: Project,
  sourceFile: SourceFile,
): Promise<RelationEvidence[]> => {
  const relations: RelationEvidence[] = [];
  const visit = async (node: Node): Promise<void> => {
    if (isReturnStatement(node) && node.expression !== undefined) {
      const functionLike = enclosingFunction(node);
      const expectedTypeNode = functionLike?.type;
      if (expectedTypeNode !== undefined) {
        const expected = await project.checker.getTypeFromTypeNode(expectedTypeNode);
        const actual = await project.checker.getTypeAtLocation(node.expression);
        if (expected !== undefined && actual !== undefined) {
          const expectedIdentity = await identifyEffect(expected);
          const actualIdentity = await identifyEffect(actual);
          const expectedArguments = expected.isTypeReference()
            ? await project.checker.getTypeArguments(expected)
            : [];
          const actualArguments = actual.isTypeReference()
            ? await project.checker.getTypeArguments(actual)
            : [];
          const channels: ChannelEvidence[] = [];
          const channelNames = ["success", "error", "context"] as const;
          for (const index of [0, 1, 2] as const) {
            const expectedChannel = expectedArguments[index];
            const actualChannel = actualArguments[index];
            if (expectedChannel === undefined || actualChannel === undefined) continue;
            channels.push({
              index,
              channel: channelNames[index],
              expected: await shallowType(project, expectedChannel),
              actual: await shallowType(project, actualChannel),
              actualAssignableToExpected: await project.checker.isTypeAssignableTo(
                actualChannel,
                expectedChannel,
              ),
            });
          }
          // The oracle reports the return keyword, not the returned expression.
          const start = node.getStart(sourceFile);
          const location = sourceFile.getLineAndCharacterOfPosition(start);
          relations.push({
            span: {
              file: sourceFile.fileName,
              start,
              end: start + "return".length,
              line: location.line + 1,
              character: location.character + 1,
            },
            expected: await typeSummary(project, expected),
            actual: await typeSummary(project, actual),
            expectedTypeNode: await typeNodeText(project, expectedTypeNode),
            effectTypeIdentity: {
              expected: expectedIdentity.matched,
              actual: actualIdentity.matched,
              expectedDeclaration: expectedIdentity.declaration,
              actualDeclaration: actualIdentity.declaration,
            },
            channels,
            overallAssignable: await project.checker.isTypeAssignableTo(actual, expected),
          });
        }
      }
    }

    const children: Node[] = [];
    node.forEachChild((child) => {
      children.push(child);
    });
    for (const child of children) await visit(child);
  };
  await visit(sourceFile);
  return relations;
};

const oracle = (relationFile: string) =>
  ({
    source: "independent-effect-tsgo",
    command:
      'effect-tsgo diagnostics --file scripts/tracers/fixtures/0001-effx-semantic/fixtures/relation.ts --format json --lspconfig \'{"diagnostics":true,"diagnosticSeverity":{"missingEffectContext":"error"}}\'',
    observed: true,
    diagnostic: {
      file: relationFile,
      name: "missingEffectContext",
      code: 377004,
      severity: "error",
      message:
        "This Effect requires a service that is missing from the expected Effect context: `ServiceA`.",
      start: 278,
      length: 6,
      line: 10,
      column: 3,
      endLine: 10,
      endColumn: 9,
    },
  }) as const;

const api = new API({ cwd });
try {
  const snapshot = await api.updateSnapshot({ openProject: configFile });
  const relations: RelationEvidence[] = [];
  for (const project of snapshot.getProjects()) {
    for (const file of project.rootFiles) {
      if (!file.replaceAll("\\", "/").endsWith(relationFileSuffix)) continue;
      const sourceFile = await project.program.getSourceFile(file);
      if (sourceFile === undefined || sourceFile.isDeclarationFile) continue;
      relations.push(...(await collectRelation(project, sourceFile)));
    }
  }

  const evidence = relations[0];
  const unsupportedOperations =
    evidence === undefined
      ? [
          "No public Program/Checker query produced an expected return type and actual return expression type for the fixture relation.",
        ]
      : evidence.channels.length < 3
        ? [
            "Checker.getTypeArguments returned fewer than three public Effect channel arguments for the expected/actual type relation.",
          ]
        : [];
  const oracleResult = oracle(resolve(cwd, "fixtures/relation.ts"));
  const reproduced =
    evidence !== undefined &&
    evidence.effectTypeIdentity.expected &&
    evidence.effectTypeIdentity.actual &&
    evidence.channels.some(
      (channel) => channel.index === 2 && !channel.actualAssignableToExpected,
    ) &&
    evidence.span.start === oracleResult.diagnostic.start &&
    evidence.span.end - evidence.span.start === oracleResult.diagnostic.length;

  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        status: "tracked",
        engine: {
          package: "typescript",
          version: typescriptVersion,
          api: "unstable/async",
          support: "experimental",
        },
        oracle: oracleResult,
        result: reproduced ? "reproduced" : "blocked",
        observedFacts: {
          relationCount: relations.length,
          evidence,
        },
        inferences: reproduced
          ? [
              "The public Checker type relation and three generic channel arguments are sufficient to reproduce this missingEffectContext diagnostic without string-name heuristics.",
            ]
          : [],
        unsupportedOperations,
        actions: [],
      },
      null,
      2,
    ),
  );
} finally {
  await api.close();
}
