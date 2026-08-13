import {
  isExpressionStatement,
  type ExpressionStatement,
  type Node,
  type SourceFile,
} from "typescript/unstable/ast";
import {
  API,
  SymbolFlags,
  type Project,
  type Symbol as TypeScriptSymbol,
  type Type,
  type TypeReference,
} from "typescript/unstable/async";
import { version as typescriptVersion } from "typescript";
import { dirname, resolve } from "node:path";

const configFile = resolve(process.argv[2] ?? "tsconfig.json");
const cwd = dirname(configFile);
const aliasesFile = resolve(cwd, "fixtures/aliases.ts");
const effectDeclarationPattern =
  /(?:^|\/)node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?effect\/dist\/Effect\.d\.ts$/;

type ApiOperationStatus = "available" | "missing" | "failed";
type ProbeDecision =
  | "accepted-effect"
  | "rejected-lookalike"
  | "rejected-non-effect"
  | "unsupported-identity";
type DeclarationProvenance = "effect-package" | "other";
type IdentityRoute =
  | "type-symbol"
  | "type-alias-symbol"
  | "base-type-symbol"
  | "base-type-alias-symbol"
  | "property-symbol"
  | "alias-target-symbol";

type DeclarationHandle = TypeScriptSymbol["declarations"][number];

interface ApiOperationRecord {
  readonly operation: string;
  calls: number;
  missingCalls: number;
  failedCalls: number;
  readonly unsupportedReasons: string[];
}

interface ApiOperationObservation {
  readonly operation: string;
  readonly status: ApiOperationStatus;
  readonly calls: number;
  readonly missingCalls: number;
  readonly failedCalls: number;
  readonly unsupportedReasons: readonly string[];
}

interface DeclarationObservation {
  readonly path: string;
  readonly sourceFile: string;
  readonly kind: number | null;
  readonly start: number | null;
  readonly end: number | null;
  readonly text: string | null;
  readonly provenance: DeclarationProvenance;
}

interface SymbolObservation {
  readonly id: number;
  readonly name: string;
  readonly escapedName: string;
  readonly flags: number;
  readonly checkFlags: number;
  readonly declarations: readonly DeclarationObservation[];
}

interface TypeArgumentObservation {
  readonly id: number;
  readonly flags: number;
  readonly renderedType: string | null;
}

interface TypeSummary {
  readonly id: number;
  readonly flags: number;
  readonly renderedType: string | null;
  readonly typeKind: "class-or-interface" | "type-reference" | "other" | "unsupported";
  readonly symbol: SymbolObservation | null;
  readonly aliasSymbol: SymbolObservation | null;
  readonly aliasTypeArguments: readonly TypeArgumentObservation[] | null;
  readonly aliasTypeArgumentsStatus: "observed" | "unsupported";
  readonly typeArguments: readonly TypeArgumentObservation[] | null;
  readonly typeArgumentsStatus: "observed" | "not-applicable" | "unsupported";
  readonly baseTypes: readonly TypeSummary[] | null;
  readonly baseTypesStatus: "observed" | "not-applicable" | "depth-limit" | "unsupported";
  readonly recursive?: boolean;
}

interface IdentityEvidence {
  readonly route: IdentityRoute;
  readonly chain: readonly string[];
  readonly typeId: number;
  readonly symbolName: string;
  readonly declarationPaths: readonly string[];
  readonly declarations: readonly DeclarationObservation[];
}

interface IdentityClassification {
  readonly decision: ProbeDecision;
  readonly reasonCode: string;
  readonly reason: string;
  readonly evidence: readonly IdentityEvidence[];
  readonly unsupportedOperations: readonly string[];
}

interface ProbeResult {
  readonly caseId: string;
  readonly expression: string;
  readonly file: string;
  readonly range: {
    readonly start: number;
    readonly end: number;
    readonly line: number;
    readonly character: number;
  };
  readonly observed: {
    readonly expressionSymbol: SymbolObservation | null;
    readonly inferredType: TypeSummary | null;
  };
  readonly inference: IdentityClassification;
  readonly unsupportedOperations: readonly string[];
}

const apiOperations = new Map<string, ApiOperationRecord>();

const operationRecord = (operation: string): ApiOperationRecord => {
  const existing = apiOperations.get(operation);
  if (existing !== undefined) return existing;
  const created: ApiOperationRecord = {
    operation,
    calls: 0,
    missingCalls: 0,
    failedCalls: 0,
    unsupportedReasons: [],
  };
  apiOperations.set(operation, created);
  return created;
};

const addUnsupportedReason = (record: ApiOperationRecord, reason: string): void => {
  if (!record.unsupportedReasons.includes(reason)) record.unsupportedReasons.push(reason);
};

const methodOf = (receiver: unknown, methodName: string): unknown => {
  if (receiver === undefined || receiver === null) return undefined;
  try {
    return (receiver as Record<string, unknown>)[methodName];
  } catch {
    return undefined;
  }
};

const registerOperation = (operation: string, receiver: unknown, methodName: string): boolean => {
  const record = operationRecord(operation);
  if (typeof methodOf(receiver, methodName) === "function") return true;
  record.missingCalls += 1;
  addUnsupportedReason(record, `missing method ${methodName}`);
  return false;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const callOperation = async <T>(
  operation: string,
  receiver: unknown,
  methodName: string,
  unsupported: Set<string>,
  action: () => T | Promise<T>,
): Promise<T | undefined> => {
  const record = operationRecord(operation);
  if (typeof methodOf(receiver, methodName) !== "function") {
    const reason = `${operation}: missing method ${methodName}`;
    record.missingCalls += 1;
    addUnsupportedReason(record, reason);
    unsupported.add(reason);
    return undefined;
  }

  record.calls += 1;
  try {
    if (process.env.EFFX_INJECT_UNSTABLE_API_FAILURE === operation) {
      throw new Error("injected unstable API failure");
    }
    return await action();
  } catch (error) {
    const reason = `${operation}: ${errorMessage(error)}`;
    record.failedCalls += 1;
    addUnsupportedReason(record, reason);
    unsupported.add(reason);
    return undefined;
  }
};

const operationObservations = (): readonly ApiOperationObservation[] =>
  [...apiOperations.values()].map((record) => ({
    operation: record.operation,
    status: record.failedCalls > 0 ? "failed" : record.missingCalls > 0 ? "missing" : "available",
    calls: record.calls,
    missingCalls: record.missingCalls,
    failedCalls: record.failedCalls,
    unsupportedReasons: record.unsupportedReasons,
  }));

const normalizePath = (value: string): string => value.replaceAll("\\", "/");

const declarationProvenance = (path: string): DeclarationProvenance =>
  effectDeclarationPattern.test(normalizePath(path)) ? "effect-package" : "other";

const registerProjectApiSurface = (project: Project): void => {
  const operations = [
    { operation: "Program.getSourceFile", receiver: project.program, method: "getSourceFile" },
    {
      operation: "Checker.getTypeAtLocation",
      receiver: project.checker,
      method: "getTypeAtLocation",
    },
    {
      operation: "Checker.getSymbolAtLocation",
      receiver: project.checker,
      method: "getSymbolAtLocation",
    },
    { operation: "Checker.typeToString", receiver: project.checker, method: "typeToString" },
    {
      operation: "Checker.getTypeArguments",
      receiver: project.checker,
      method: "getTypeArguments",
    },
    {
      operation: "Checker.getAliasedSymbol",
      receiver: project.checker,
      method: "getAliasedSymbol",
    },
    {
      operation: "Checker.getImmediateAliasedSymbol",
      receiver: project.checker,
      method: "getImmediateAliasedSymbol",
    },
    { operation: "Checker.isUnknownSymbol", receiver: project.checker, method: "isUnknownSymbol" },
    {
      operation: "Checker.getDeclaredTypeOfSymbol",
      receiver: project.checker,
      method: "getDeclaredTypeOfSymbol",
    },
    { operation: "Checker.getApparentType", receiver: project.checker, method: "getApparentType" },
    { operation: "Checker.getBaseTypes", receiver: project.checker, method: "getBaseTypes" },
    {
      operation: "Checker.getPropertiesOfType",
      receiver: project.checker,
      method: "getPropertiesOfType",
    },
  ];
  for (const entry of operations) registerOperation(entry.operation, entry.receiver, entry.method);
};

const registerTypeApiSurface = (type: Type): void => {
  const operations = [
    { operation: "Type.getSymbol", method: "getSymbol" },
    { operation: "Type.getAliasSymbol", method: "getAliasSymbol" },
    { operation: "Type.getAliasTypeArguments", method: "getAliasTypeArguments" },
    { operation: "Type.isClassOrInterface", method: "isClassOrInterface" },
    { operation: "Type.isTypeReference", method: "isTypeReference" },
    { operation: "Type.getBaseTypes", method: "getBaseTypes" },
  ];
  for (const entry of operations) registerOperation(entry.operation, type, entry.method);
};

const collectExpressionStatements = (sourceFile: SourceFile): ExpressionStatement[] => {
  const statements: ExpressionStatement[] = [];
  const visit = (node: Node): void => {
    if (isExpressionStatement(node)) statements.push(node);
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return statements;
};

const observeDeclaration = async (
  handle: DeclarationHandle,
  project: Project,
  unsupported: Set<string>,
): Promise<DeclarationObservation> => {
  const handlePath = normalizePath(String(handle.path));
  const node = await callOperation("NodeHandle.resolve", handle, "resolve", unsupported, () =>
    handle.resolve(project),
  );
  const sourceFile = node?.getSourceFile();
  let text: string | null = null;
  if (node !== undefined) {
    try {
      const fullText = node.getText(sourceFile);
      text = fullText.length > 240 ? `${fullText.slice(0, 237)}...` : fullText;
    } catch {
      text = null;
    }
  }
  return {
    path: handlePath,
    sourceFile: normalizePath(sourceFile?.fileName ?? handlePath),
    kind: node?.kind ?? handle.kind ?? null,
    start: node?.pos ?? null,
    end: node?.end ?? null,
    text,
    provenance: declarationProvenance(handlePath),
  };
};

const observeSymbol = async (
  symbol: TypeScriptSymbol | undefined,
  project: Project,
  unsupported: Set<string>,
): Promise<SymbolObservation | null> => {
  if (symbol === undefined) return null;
  const declarations: DeclarationObservation[] = [];
  for (const declaration of symbol.declarations) {
    registerOperation("NodeHandle.resolve", declaration, "resolve");
    declarations.push(await observeDeclaration(declaration, project, unsupported));
  }
  return {
    id: symbol.id,
    name: symbol.name,
    escapedName: String(symbol.escapedName),
    flags: Number(symbol.flags),
    checkFlags: Number(symbol.checkFlags),
    declarations,
  };
};

const observeTypeArguments = async (
  types: readonly Type[],
  checker: Project["checker"],
  unsupported: Set<string>,
): Promise<readonly TypeArgumentObservation[]> => {
  const result: TypeArgumentObservation[] = [];
  for (const type of types) {
    const renderedType = await callOperation(
      "Checker.typeToString",
      checker,
      "typeToString",
      unsupported,
      () => checker.typeToString(type),
    );
    result.push({
      id: type.id,
      flags: Number(type.flags),
      renderedType: renderedType ?? null,
    });
  }
  return result;
};

const observeTypeSummary = async (
  type: Type,
  checker: Project["checker"],
  project: Project,
  unsupported: Set<string>,
  depth: number,
  seen: Set<number>,
): Promise<TypeSummary> => {
  if (seen.has(type.id)) {
    return {
      id: type.id,
      flags: Number(type.flags),
      renderedType: null,
      typeKind: "other",
      symbol: null,
      aliasSymbol: null,
      aliasTypeArguments: null,
      aliasTypeArgumentsStatus: "unsupported",
      typeArguments: null,
      typeArgumentsStatus: "unsupported",
      baseTypes: null,
      baseTypesStatus: "depth-limit",
      recursive: true,
    };
  }
  seen.add(type.id);
  registerTypeApiSurface(type);

  const renderedType = await callOperation(
    "Checker.typeToString",
    checker,
    "typeToString",
    unsupported,
    () => checker.typeToString(type),
  );
  const symbol = await callOperation("Type.getSymbol", type, "getSymbol", unsupported, () =>
    type.getSymbol(),
  );
  const aliasSymbol = await callOperation(
    "Type.getAliasSymbol",
    type,
    "getAliasSymbol",
    unsupported,
    () => type.getAliasSymbol(),
  );
  const symbolObservation = await observeSymbol(symbol, project, unsupported);
  const aliasSymbolObservation = await observeSymbol(aliasSymbol, project, unsupported);

  const aliasTypeArguments = await callOperation(
    "Type.getAliasTypeArguments",
    type,
    "getAliasTypeArguments",
    unsupported,
    () => type.getAliasTypeArguments(),
  );
  const aliasTypeArgumentObservations =
    aliasTypeArguments === undefined
      ? null
      : await observeTypeArguments(aliasTypeArguments, checker, unsupported);
  const aliasTypeArgumentsStatus = aliasTypeArguments === undefined ? "unsupported" : "observed";

  const classOrInterface = await callOperation(
    "Type.isClassOrInterface",
    type,
    "isClassOrInterface",
    unsupported,
    () => type.isClassOrInterface(),
  );
  const typeReference = await callOperation(
    "Type.isTypeReference",
    type,
    "isTypeReference",
    unsupported,
    () => type.isTypeReference(),
  );
  const typeArguments =
    typeReference === true
      ? await callOperation(
          "Checker.getTypeArguments",
          checker,
          "getTypeArguments",
          unsupported,
          () => checker.getTypeArguments(type as TypeReference),
        )
      : undefined;
  const typeArgumentObservations =
    typeArguments === undefined || typeReference !== true
      ? null
      : await observeTypeArguments(typeArguments, checker, unsupported);
  const typeArgumentsStatus =
    typeReference !== true
      ? typeReference === undefined
        ? "unsupported"
        : "not-applicable"
      : typeArguments === undefined
        ? "unsupported"
        : "observed";

  let baseTypes: readonly TypeSummary[] | null = null;
  let baseTypesStatus: TypeSummary["baseTypesStatus"];
  if (classOrInterface !== true) {
    baseTypesStatus = classOrInterface === undefined ? "unsupported" : "not-applicable";
  } else if (depth >= 1) {
    baseTypesStatus = "depth-limit";
  } else {
    const bases = await callOperation("Type.getBaseTypes", type, "getBaseTypes", unsupported, () =>
      type.getBaseTypes(),
    );
    if (bases === undefined) {
      baseTypesStatus = "unsupported";
    } else {
      baseTypesStatus = "observed";
      const summaries: TypeSummary[] = [];
      for (const base of bases) {
        summaries.push(
          await observeTypeSummary(base, checker, project, unsupported, depth + 1, seen),
        );
      }
      baseTypes = summaries;
    }
  }

  return {
    id: type.id,
    flags: Number(type.flags),
    renderedType: renderedType ?? null,
    typeKind:
      classOrInterface === true
        ? "class-or-interface"
        : typeReference === true
          ? "type-reference"
          : classOrInterface === undefined || typeReference === undefined
            ? "unsupported"
            : "other",
    symbol: symbolObservation,
    aliasSymbol: aliasSymbolObservation,
    aliasTypeArguments: aliasTypeArgumentObservations,
    aliasTypeArgumentsStatus,
    typeArguments: typeArgumentObservations,
    typeArgumentsStatus,
    baseTypes,
    baseTypesStatus,
  };
};

const classifyIdentity = async (
  type: Type,
  checker: Project["checker"],
  project: Project,
  unsupported: Set<string>,
): Promise<IdentityClassification> => {
  const visited = new Set<number>();
  const visitedAliasSymbols = new Set<number>();
  const lookalikeEvidence: IdentityEvidence[] = [];
  let sawSymbol = false;
  let sawDeclaration = false;
  let depthLimited = false;

  const inspect = async (
    candidate: Type,
    chain: readonly string[],
    depth: number,
  ): Promise<IdentityEvidence | undefined> => {
    if (visited.has(candidate.id)) return undefined;
    if (depth > 8) {
      depthLimited = true;
      return undefined;
    }
    visited.add(candidate.id);
    registerTypeApiSurface(candidate);

    const recordSymbol = (
      route: IdentityRoute,
      observation: SymbolObservation | null,
      symbolChain: readonly string[],
    ): IdentityEvidence | undefined => {
      if (observation === null) return undefined;
      sawSymbol = true;
      if (observation.declarations.length > 0) sawDeclaration = true;
      const effectDeclarations = observation.declarations.filter(
        (declaration) => declaration.provenance === "effect-package",
      );
      if (effectDeclarations.length > 0) {
        return {
          route,
          chain: symbolChain,
          typeId: candidate.id,
          symbolName: observation.name,
          declarationPaths: effectDeclarations.map((declaration) => declaration.path),
          declarations: effectDeclarations,
        };
      }
      if (observation.name === "Effect" && observation.declarations.length > 0) {
        lookalikeEvidence.push({
          route,
          chain: symbolChain,
          typeId: candidate.id,
          symbolName: observation.name,
          declarationPaths: observation.declarations.map((declaration) => declaration.path),
          declarations: observation.declarations,
        });
      }
      return undefined;
    };

    const candidateSymbol = await callOperation(
      "Type.getSymbol",
      candidate,
      "getSymbol",
      unsupported,
      () => candidate.getSymbol(),
    );
    const candidateAliasSymbol = await callOperation(
      "Type.getAliasSymbol",
      candidate,
      "getAliasSymbol",
      unsupported,
      () => candidate.getAliasSymbol(),
    );
    const symbolObservation = await observeSymbol(candidateSymbol, project, unsupported);
    const aliasSymbolObservation = await observeSymbol(candidateAliasSymbol, project, unsupported);
    const directRoute: IdentityRoute = chain.length === 1 ? "type-symbol" : "base-type-symbol";
    const directAliasRoute: IdentityRoute =
      chain.length === 1 ? "type-alias-symbol" : "base-type-alias-symbol";
    const directMatch =
      recordSymbol(directRoute, symbolObservation, chain) ??
      recordSymbol(directAliasRoute, aliasSymbolObservation, chain);
    if (directMatch !== undefined) return directMatch;

    const aliasSymbols = [candidateAliasSymbol, candidateSymbol].filter(
      (symbol): symbol is TypeScriptSymbol =>
        symbol !== undefined && (Number(symbol.flags) & SymbolFlags.Alias) !== 0,
    );
    for (const aliasSymbol of aliasSymbols) {
      if (visitedAliasSymbols.has(aliasSymbol.id)) continue;
      visitedAliasSymbols.add(aliasSymbol.id);
      const immediateAlias = await callOperation(
        "Checker.getImmediateAliasedSymbol",
        checker,
        "getImmediateAliasedSymbol",
        unsupported,
        () => checker.getImmediateAliasedSymbol(aliasSymbol),
      );
      const resolvedAlias = await callOperation(
        "Checker.getAliasedSymbol",
        checker,
        "getAliasedSymbol",
        unsupported,
        () => checker.getAliasedSymbol(aliasSymbol),
      );
      const aliasTargets = [immediateAlias, resolvedAlias].filter(
        (symbol): symbol is TypeScriptSymbol => symbol !== undefined,
      );
      const visitedTargets = new Set<number>();
      for (const aliasTarget of aliasTargets) {
        if (visitedTargets.has(aliasTarget.id)) continue;
        visitedTargets.add(aliasTarget.id);
        const unknown = await callOperation(
          "Checker.isUnknownSymbol",
          checker,
          "isUnknownSymbol",
          unsupported,
          () => checker.isUnknownSymbol(aliasTarget),
        );
        if (unknown === true) continue;
        const targetObservation = await observeSymbol(aliasTarget, project, unsupported);
        const targetMatch = recordSymbol("alias-target-symbol", targetObservation, [
          ...chain,
          "alias-target",
        ]);
        if (targetMatch !== undefined) return targetMatch;
      }
    }
    const declaredTypeSymbols = [candidateAliasSymbol, candidateSymbol].filter(
      (symbol): symbol is TypeScriptSymbol =>
        symbol !== undefined && (Number(symbol.flags) & SymbolFlags.TypeAlias) !== 0,
    );
    for (const aliasSymbol of declaredTypeSymbols) {
      const declaredType = await callOperation(
        "Checker.getDeclaredTypeOfSymbol",
        checker,
        "getDeclaredTypeOfSymbol",
        unsupported,
        () => checker.getDeclaredTypeOfSymbol(aliasSymbol),
      );
      if (declaredType !== undefined && declaredType.id !== candidate.id) {
        const declaredMatch = await inspect(declaredType, [...chain, "declared-type"], depth + 1);
        if (declaredMatch !== undefined) return declaredMatch;
      }
    }

    const apparentType = await callOperation(
      "Checker.getApparentType",
      checker,
      "getApparentType",
      unsupported,
      () => checker.getApparentType(candidate),
    );
    if (apparentType !== undefined && apparentType.id !== candidate.id) {
      const apparentMatch = await inspect(apparentType, [...chain, "apparent-type"], depth + 1);
      if (apparentMatch !== undefined) return apparentMatch;
    }

    const classOrInterface = await callOperation(
      "Type.isClassOrInterface",
      candidate,
      "isClassOrInterface",
      unsupported,
      () => candidate.isClassOrInterface(),
    );
    if (classOrInterface === true) {
      const interfaceCandidate = candidate.isClassOrInterface() ? candidate : undefined;
      const checkerBases =
        interfaceCandidate === undefined
          ? undefined
          : await callOperation("Checker.getBaseTypes", checker, "getBaseTypes", unsupported, () =>
              checker.getBaseTypes(interfaceCandidate),
            );
      const typeBases = await callOperation(
        "Type.getBaseTypes",
        candidate,
        "getBaseTypes",
        unsupported,
        () => candidate.getBaseTypes(),
      );
      const bases = new Map<number, Type>();
      for (const base of checkerBases ?? []) bases.set(base.id, base);
      for (const base of typeBases ?? []) bases.set(base.id, base);
      for (const base of bases.values()) {
        const match = await inspect(base, [...chain, "base-type"], depth + 1);
        if (match !== undefined) return match;
      }
    }

    const properties = await callOperation(
      "Checker.getPropertiesOfType",
      checker,
      "getPropertiesOfType",
      unsupported,
      () => checker.getPropertiesOfType(candidate),
    );
    for (const property of properties ?? []) {
      const propertyObservation = await observeSymbol(property, project, unsupported);
      const propertyMatch = recordSymbol("property-symbol", propertyObservation, [
        ...chain,
        "property",
      ]);
      if (propertyMatch !== undefined) return propertyMatch;
    }
    return undefined;
  };

  const match = await inspect(type, ["inferred-type"], 0);
  if (match !== undefined) {
    const viaBase =
      match.route === "base-type-symbol" ||
      match.route === "base-type-alias-symbol" ||
      match.route === "property-symbol";
    return {
      decision: "accepted-effect",
      reasonCode: viaBase ? "canonical-effect-base-declaration" : "canonical-effect-declaration",
      reason: viaBase
        ? `The inferred type reaches the canonical Effect declaration through ${match.chain.join(" -> ")}.`
        : "The inferred type has a declaration in effect/dist/Effect.d.ts.",
      evidence: [match],
      unsupportedOperations: [...unsupported],
    };
  }

  if (lookalikeEvidence.length > 0) {
    return {
      decision: "rejected-lookalike",
      reasonCode: "effect-name-without-canonical-provenance",
      reason:
        "The symbol is named Effect, but its declarations are outside effect/dist/Effect.d.ts.",
      evidence: lookalikeEvidence,
      unsupportedOperations: [...unsupported],
    };
  }

  if (depthLimited || unsupported.size > 0 || !sawSymbol || !sawDeclaration) {
    const reason = depthLimited
      ? "The base-type walk reached its safety limit before canonical Effect provenance was observed."
      : unsupported.size > 0
        ? "The unstable async API reported an unavailable operation before canonical Effect provenance was established."
        : "The inferred type did not expose enough symbol declarations to establish Effect identity.";
    return {
      decision: "unsupported-identity",
      reasonCode: "effect-identity-provenance-unavailable",
      reason,
      evidence: [],
      unsupportedOperations: [...unsupported],
    };
  }

  return {
    decision: "rejected-non-effect",
    reasonCode: "no-canonical-effect-provenance",
    reason: "No canonical Effect declaration or Effect base type was observed.",
    evidence: [],
    unsupportedOperations: [...unsupported],
  };
};

const caseIdForStatement = (statement: Node, sourceFile: SourceFile, expression: string): string =>
  /probe:([a-z0-9-]+)/.exec(statement.getFullText(sourceFile))?.[1] ?? expression;

const buildOutput = (
  results: readonly ProbeResult[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> => {
  const accepted = results
    .filter((result) => result.inference.decision === "accepted-effect")
    .map((result) => ({ caseId: result.caseId, expression: result.expression }));
  const rejected = results
    .filter(
      (result) =>
        result.inference.decision === "rejected-lookalike" ||
        result.inference.decision === "rejected-non-effect",
    )
    .map((result) => ({
      caseId: result.caseId,
      expression: result.expression,
      reasonCode: result.inference.reasonCode,
    }));
  const unsupported = results
    .filter((result) => result.inference.decision === "unsupported-identity")
    .map((result) => ({
      caseId: result.caseId,
      expression: result.expression,
      reasonCode: result.inference.reasonCode,
      reason: result.inference.reason,
    }));
  return {
    schemaVersion: 1,
    status: "tracked",
    engine: {
      package: "typescript",
      version: typescriptVersion,
      api: "unstable/async",
      support: "experimental",
    },
    probe: {
      name: "effect-alias-identity",
      fixture: "fixtures/aliases.ts",
      identityBasis: "symbol declarations and interface base types",
    },
    apiOperations: operationObservations(),
    unsupportedApiOperations: operationObservations().filter(
      (operation) => operation.status !== "available",
    ),
    acceptedEffectExpressions: accepted,
    rejectedLookalikes: rejected,
    unsupportedIdentityCases: unsupported,
    results,
    ...extra,
  };
};

const api = new API({ cwd });
let output: Record<string, unknown> = buildOutput([]);
try {
  const snapshot = await api.updateSnapshot({ openProject: configFile });
  let target: { readonly project: Project; readonly sourceFile: SourceFile } | undefined;

  for (const project of snapshot.getProjects()) {
    registerProjectApiSurface(project);
    const projectIssues = new Set<string>();
    const sourceFile = await callOperation(
      "Program.getSourceFile",
      project.program,
      "getSourceFile",
      projectIssues,
      () => project.program.getSourceFile(aliasesFile),
    );
    if (sourceFile !== undefined) {
      target = { project, sourceFile };
      break;
    }
  }

  if (target === undefined) {
    output = buildOutput([], {
      unsupportedIdentityCases: [
        {
          caseId: "aliases-fixture",
          reasonCode: "fixture-not-in-project",
          reason: `The configured project did not expose ${normalizePath(aliasesFile)} through Program.getSourceFile.`,
        },
      ],
    });
  } else {
    const { project, sourceFile } = target;
    const results: ProbeResult[] = [];
    for (const statement of collectExpressionStatements(sourceFile)) {
      const expression = statement.expression;
      const expressionText = expression.getText(sourceFile);
      const caseId = caseIdForStatement(statement, sourceFile, expressionText);
      const start = expression.getStart(sourceFile);
      const end = expression.getEnd();
      const location = sourceFile.getLineAndCharacterOfPosition(start);
      const unsupported = new Set<string>();
      const expressionSymbol = await callOperation(
        "Checker.getSymbolAtLocation",
        project.checker,
        "getSymbolAtLocation",
        unsupported,
        () => project.checker.getSymbolAtLocation(expression),
      );
      const inferredType = await callOperation(
        "Checker.getTypeAtLocation",
        project.checker,
        "getTypeAtLocation",
        unsupported,
        () => project.checker.getTypeAtLocation(expression),
      );

      let typeSummary: TypeSummary | null = null;
      let inference: IdentityClassification;
      if (inferredType === undefined) {
        inference = {
          decision: "unsupported-identity",
          reasonCode: "inferred-type-unavailable",
          reason: "Checker.getTypeAtLocation did not return a type for this expression.",
          evidence: [],
          unsupportedOperations: [...unsupported],
        };
      } else {
        typeSummary = await observeTypeSummary(
          inferredType,
          project.checker,
          project,
          unsupported,
          0,
          new Set<number>(),
        );
        inference = await classifyIdentity(inferredType, project.checker, project, unsupported);
      }

      results.push({
        caseId,
        expression: expressionText,
        file: normalizePath(sourceFile.fileName),
        range: {
          start,
          end,
          line: location.line,
          character: location.character,
        },
        observed: {
          expressionSymbol: await observeSymbol(expressionSymbol, project, unsupported),
          inferredType: typeSummary,
        },
        inference,
        unsupportedOperations: [...unsupported],
      });
    }
    output = buildOutput(results);
  }
} catch (error) {
  output = buildOutput([], {
    probeError: {
      reasonCode: "probe-operation-failed",
      reason: errorMessage(error),
    },
  });
} finally {
  try {
    await api.close();
  } catch (error) {
    output = {
      ...output,
      apiCloseError: {
        reasonCode: "api-close-failed",
        reason: errorMessage(error),
      },
    };
  }
}

console.log(JSON.stringify(output, null, 2));
