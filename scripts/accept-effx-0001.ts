import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const semanticConfig = join(repoRoot, "scripts/tracers/fixtures/0001-effx-semantic/tsconfig.json");
const identityTracer = join(repoRoot, "scripts/tracers/0001-effx-semantic-identity.ts");
const relationTracer = join(repoRoot, "scripts/tracers/0001-effx-channel-relations.ts");
const tracer = join(repoRoot, "scripts/tracers/0001-effx-provider-seam.ts");
const redPath = join(repoRoot, "docs/acceptance/effx-0001-observed-red.txt");
const greenPath = join(repoRoot, "docs/acceptance/effx-0001-observed-green.txt");
const performancePath = join(repoRoot, "docs/acceptance/effx-0001-observed-performance.json");
const nonExecutableProvider = join(
  repoRoot,
  "scripts/tracers/fixtures/0001-effx-provider-seam-project-b/clean.ts",
);
const mode = process.argv[2] ?? "check";

if (mode !== "check" && mode !== "write") {
  console.error("usage: accept-effx-0001.ts [check|write]");
  process.exit(2);
}

type Summary = {
  readonly schemaVersion: number;
  readonly status: string;
  readonly outcome: string;
  readonly providers: {
    readonly effectTsgoVersion: string;
    readonly effectExecutable: string;
    readonly effectExecutableSha256: string;
    readonly typescriptVersion: string;
    readonly stockExecutable: string;
    readonly stockExecutableSha256: string;
  };
  readonly fixture: { readonly sourceSha256: string };
  readonly diagnostics: readonly {
    readonly code: number | string;
    readonly source: string;
    readonly range: unknown;
  }[];
  readonly codeAction: {
    readonly present: boolean;
    readonly hasWorkspaceEdit: boolean;
    readonly data?: unknown;
  };
  readonly advertisedCommands: readonly string[];
  readonly executedCommandAccepted: boolean;
  readonly staleCommandError: number | null;
  readonly unknownCommandError: number | null;
  readonly diagnosticLifecycle: {
    readonly unchangedPreserved: boolean;
    readonly cancellationForwarded: boolean;
    readonly closedDocumentRejected: boolean;
  };
  readonly timingsObserved: Readonly<Record<string, boolean>>;
  readonly memoryObserved: boolean;
  readonly measurements: {
    readonly timingsMs: Readonly<Record<string, number>>;
    readonly memory: {
      readonly coordinatorRssBefore: number;
      readonly coordinatorRssAfter: number;
    };
  };
  readonly protocolDirections: readonly string[];
  readonly termination: { readonly terminated: boolean };
  readonly unsupportedOperations: readonly {
    readonly operation: string;
    readonly reason: string;
    readonly responseErrorCode: number | null;
  }[];
  readonly unsupportedOperationCount: number;
  readonly errors: readonly string[];
};

const runTracer = async (
  env: Readonly<Record<string, string>> = {},
): Promise<{
  readonly exitCode: number;
  readonly summary: Summary;
}> => {
  const proc = Bun.spawn(["bun", "run", tracer, "--summary"], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (stdout.trim().length === 0) {
    throw new Error(`tracer emitted no summary: ${stderr.trim()}`);
  }
  return { exitCode, summary: JSON.parse(stdout) as Summary };
};

const runJsonScript = async (
  script: string,
  env: Readonly<Record<string, string>> = {},
): Promise<Record<string, unknown>> => {
  const proc = Bun.spawn(["bun", "run", script, semanticConfig], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`semantic tracer failed (${script}): ${stderr.trim()}`);
  }
  return JSON.parse(stdout) as Record<string, unknown>;
};

const runEffectOracle = async (): Promise<{
  readonly missingContext: {
    readonly code: number;
    readonly start: number;
    readonly length: number;
  };
  readonly floatingCode: number;
  readonly cleanDiagnosticCount: number;
}> => {
  const executable = join(repoRoot, "node_modules/@effect/tsgo/dist/effect-tsgo.cjs");
  const proc = Bun.spawn(
    ["bun", executable, "diagnostics", "--project", semanticConfig, "--format", "json"],
    { cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 1) {
    throw new Error(`Effect oracle expected diagnostic exit 1, got ${exitCode}: ${stderr.trim()}`);
  }
  const parsed = JSON.parse(stdout) as {
    readonly diagnostics?: readonly {
      readonly file: string;
      readonly name: string;
      readonly code: number;
      readonly start: number;
      readonly length: number;
    }[];
  };
  const diagnostics = parsed.diagnostics ?? [];
  const missingContext = diagnostics.find(({ name }) => name === "missingEffectContext");
  const floating = diagnostics.find(
    ({ name, file }) => name === "floatingEffect" && file.endsWith("/fixtures/floating.ts"),
  );
  if (missingContext === undefined) throw new Error("Effect oracle omitted missingEffectContext");
  if (floating === undefined) throw new Error("Effect oracle omitted canonical floatingEffect");
  return {
    missingContext,
    floatingCode: floating.code,
    cleanDiagnosticCount: diagnostics.filter(({ file }) => file.endsWith("/fixtures/clean.ts"))
      .length,
  };
};

type SemanticEvidence = {
  readonly identity: {
    readonly accepted: readonly string[];
    readonly rejected: readonly string[];
    readonly unsupported: readonly string[];
    readonly unsupportedCount: number;
    readonly unsupportedApiCount: number;
    readonly floatingOracleCode: number;
    readonly cleanDiagnosticCount: number;
    readonly experimentalApiFailureReported: boolean;
  };
  readonly channels: {
    readonly result: unknown;
    readonly oracleCode: unknown;
    readonly oracleStart: unknown;
    readonly oracleLength: unknown;
    readonly actualOracleCode: number;
    readonly actualOracleStart: number;
    readonly actualOracleLength: number;
    readonly relationCount: unknown;
    readonly unsupportedCount: number;
  };
};

const semanticEvidence = async (): Promise<SemanticEvidence> => {
  const [identity, channels, effectOracle, injectedFailure] = await Promise.all([
    runJsonScript(identityTracer),
    runJsonScript(relationTracer),
    runEffectOracle(),
    runJsonScript(identityTracer, {
      EFFX_INJECT_UNSTABLE_API_FAILURE: "Checker.getTypeAtLocation",
    }),
  ]);
  const accepted = identity.acceptedEffectExpressions as readonly { readonly caseId: string }[];
  const rejected = identity.rejectedLookalikes as readonly { readonly caseId: string }[];
  const unsupported = identity.unsupportedIdentityCases as readonly { readonly caseId: string }[];
  const unsupportedApi = identity.unsupportedApiOperations as readonly unknown[];
  const oracle = channels.oracle as {
    readonly diagnostic?: {
      readonly code?: unknown;
      readonly start?: unknown;
      readonly length?: unknown;
    };
  };
  const observedFacts = channels.observedFacts as { readonly relationCount?: unknown };
  const channelUnsupported = channels.unsupportedOperations as readonly unknown[];
  const experimentalApiFailureReported =
    (injectedFailure.unsupportedIdentityCases as readonly unknown[]).length > 0 &&
    (
      injectedFailure.apiOperations as readonly {
        readonly operation: string;
        readonly status: string;
      }[]
    ).some(
      ({ operation, status }) => operation === "Checker.getTypeAtLocation" && status === "failed",
    );
  return {
    identity: {
      accepted: accepted.map(({ caseId }) => caseId),
      rejected: rejected.map(({ caseId }) => caseId),
      unsupportedCount: unsupported.length,
      unsupported: unsupported.map(({ caseId }) => caseId),
      unsupportedApiCount: unsupportedApi.length,
      floatingOracleCode: effectOracle.floatingCode,
      cleanDiagnosticCount: effectOracle.cleanDiagnosticCount,
      experimentalApiFailureReported,
    },
    channels: {
      result: channels.result,
      oracleCode: oracle.diagnostic?.code,
      oracleStart: oracle.diagnostic?.start,
      oracleLength: oracle.diagnostic?.length,
      actualOracleCode: effectOracle.missingContext.code,
      actualOracleStart: effectOracle.missingContext.start,
      actualOracleLength: effectOracle.missingContext.length,
      relationCount: observedFacts.relationCount,
      unsupportedCount: channelUnsupported.length,
    },
  };
};

const normalize = (
  summary: Summary,
  semantic?: SemanticEvidence,
  failureCases?: Readonly<Record<string, boolean>>,
): string => {
  const value = {
    schemaVersion: summary.schemaVersion,
    status: summary.status,
    outcome: summary.outcome,
    providers: {
      effectTsgoVersion: summary.providers.effectTsgoVersion,
      effectExecutable: summary.providers.effectExecutable.replace(repoRoot, "<repo>"),
      effectExecutableSha256:
        summary.providers.effectExecutableSha256.length === 64 ? "<sha256>" : "",
      typescriptVersion: summary.providers.typescriptVersion,
      stockExecutable: summary.providers.stockExecutable.replace(repoRoot, "<repo>"),
      stockExecutableSha256:
        summary.providers.stockExecutableSha256.length === 64 ? "<sha256>" : "",
    },
    fixtureSourceSha256: summary.fixture.sourceSha256,
    diagnostics: summary.diagnostics,
    codeAction: summary.codeAction,
    advertisedCommands: summary.advertisedCommands,
    executedCommandAccepted: summary.executedCommandAccepted,
    staleCommandError: summary.staleCommandError,
    unknownCommandError: summary.unknownCommandError,
    diagnosticLifecycle: summary.diagnosticLifecycle,
    timingsObserved: summary.timingsObserved,
    memoryObserved: summary.memoryObserved,
    protocolDirections: summary.protocolDirections,
    terminationObserved: summary.termination.terminated,
    unsupportedOperations: summary.unsupportedOperations,
    ...(failureCases === undefined ? {} : { failureCases }),
    ...(semantic === undefined ? {} : { semantic }),
    unsupportedOperationCount: summary.unsupportedOperationCount,
    errors: summary.errors.map((error) => error.replace(repoRoot, "<repo>")),
  };
  return `${JSON.stringify(value, null, 2)}\n`;
};

const missingProvider = await runTracer({
  EFFX_STOCK_EXECUTABLE: "/definitely-missing/stock-tsc",
});
if (
  missingProvider.exitCode === 0 ||
  missingProvider.summary.outcome !== "blocked" ||
  missingProvider.summary.errors.length !== 1
) {
  throw new Error(
    `missing-provider run did not fail closed: ${JSON.stringify(missingProvider.summary)}`,
  );
}
const misVersionedProvider = await runTracer({
  EFFX_EXPECT_TYPESCRIPT_VERSION: "0.0.0-invalid",
});
if (
  misVersionedProvider.exitCode === 0 ||
  misVersionedProvider.summary.outcome !== "blocked" ||
  !misVersionedProvider.summary.errors.some((error) =>
    error.includes("expected typescript 0.0.0-invalid"),
  )
) {
  throw new Error(
    `mis-versioned provider run did not fail closed: ${JSON.stringify(misVersionedProvider.summary)}`,
  );
}
const nonExecutable = await runTracer({ EFFX_STOCK_EXECUTABLE: nonExecutableProvider });
if (
  nonExecutable.exitCode === 0 ||
  nonExecutable.summary.outcome !== "blocked" ||
  !nonExecutable.summary.errors.some((error) => error.includes("is not executable"))
) {
  throw new Error(
    `non-executable provider run did not fail closed: ${JSON.stringify(nonExecutable.summary)}`,
  );
}
const red = await runTracer({ EFFX_FAIL_AFTER_START: "1" });
if (
  red.exitCode === 0 ||
  red.summary.outcome !== "blocked" ||
  !red.summary.termination.terminated ||
  !red.summary.errors.includes("injected provider failure after process startup")
) {
  throw new Error(`started-provider failure did not clean up: ${JSON.stringify(red.summary)}`);
}

const green = await runTracer();
if (green.exitCode !== 0 || green.summary.outcome !== "worked") {
  throw new Error(`provider seam did not work: ${JSON.stringify(green.summary)}`);
}
if (
  green.summary.diagnostics.length !== 2 ||
  green.summary.diagnostics[0]?.code !== 377001 ||
  green.summary.diagnostics[0]?.source !== "@effect/tsgo" ||
  green.summary.diagnostics[1]?.code !== 2322 ||
  green.summary.diagnostics[1]?.source !== "typescript"
) {
  throw new Error(
    `canonical provider diagnostics drifted: ${JSON.stringify(green.summary.diagnostics)}`,
  );
}
if (
  !green.summary.codeAction.present ||
  green.summary.codeAction.hasWorkspaceEdit ||
  !green.summary.advertisedCommands.includes("effx.chooseEffectComposition") ||
  !green.summary.executedCommandAccepted ||
  !green.summary.diagnosticLifecycle.unchangedPreserved ||
  !green.summary.diagnosticLifecycle.cancellationForwarded ||
  !green.summary.diagnosticLifecycle.closedDocumentRejected ||
  green.summary.unsupportedOperationCount !== 1 ||
  green.summary.unsupportedOperations[0]?.operation !== "provider textDocument/diagnostic pull" ||
  green.summary.unsupportedOperations[0]?.responseErrorCode !== -32800 ||
  green.summary.staleCommandError !== -32001 ||
  green.summary.unknownCommandError !== -32001 ||
  !green.summary.termination.terminated ||
  Object.values(green.summary.timingsObserved).some((observed) => !observed)
) {
  throw new Error(`provider lifecycle contract drifted: ${JSON.stringify(green.summary)}`);
}
const semantic = await semanticEvidence();
const expectedIdentityCases = [
  "direct-imported-effect",
  "renamed-imported-effect",
  "namespace-qualified-effect",
  "direct-type-alias-effect",
  "wrapped-type-alias-effect",
  "function-returned-effect",
  "generic-effect-subtype",
];
if (
  JSON.stringify(semantic.identity.accepted) !== JSON.stringify(expectedIdentityCases) ||
  JSON.stringify(semantic.identity.rejected) !==
    JSON.stringify(["shadowed-effect-name", "local-effect-lookalike"]) ||
  JSON.stringify(semantic.identity.unsupported) !==
    JSON.stringify(["unresolved-effect-alias", "opaque-wrapper-provenance"]) ||
  semantic.identity.unsupportedCount !== 2 ||
  semantic.identity.unsupportedApiCount !== 0 ||
  semantic.identity.floatingOracleCode !== 377001 ||
  !semantic.identity.experimentalApiFailureReported ||
  semantic.identity.cleanDiagnosticCount !== 0 ||
  semantic.channels.result !== "reproduced" ||
  semantic.channels.oracleCode !== 377004 ||
  semantic.channels.oracleCode !== semantic.channels.actualOracleCode ||
  semantic.channels.oracleStart !== semantic.channels.actualOracleStart ||
  semantic.channels.oracleLength !== semantic.channels.actualOracleLength ||
  semantic.channels.relationCount !== 1 ||
  semantic.channels.unsupportedCount !== 0
) {
  throw new Error(`semantic provider evidence drifted: ${JSON.stringify(semantic)}`);
}

const performanceEvidence = {
  schemaVersion: 1,
  command: "bun run scripts/tracers/0001-effx-provider-seam.ts --summary",
  providers: {
    effectTsgoVersion: green.summary.providers.effectTsgoVersion,
    effectExecutableSha256: green.summary.providers.effectExecutableSha256,
    typescriptVersion: green.summary.providers.typescriptVersion,
    stockExecutableSha256: green.summary.providers.stockExecutableSha256,
  },
  fixtureSourceSha256: green.summary.fixture.sourceSha256,
  timingsMs: green.summary.measurements.timingsMs,
  memory: green.summary.measurements.memory,
};
if (mode === "write") {
  writeFileSync(performancePath, `${JSON.stringify(performanceEvidence, null, 2)}\n`);
} else {
  if (!existsSync(performancePath)) throw new Error("performance evidence is missing");
  const baseline = JSON.parse(readFileSync(performancePath, "utf8")) as typeof performanceEvidence;
  if (
    JSON.stringify(baseline.providers) !== JSON.stringify(performanceEvidence.providers) ||
    baseline.fixtureSourceSha256 !== performanceEvidence.fixtureSourceSha256 ||
    Object.values(baseline.timingsMs).some((value) => value <= 0) ||
    Object.values(performanceEvidence.timingsMs).some((value) => value <= 0) ||
    baseline.memory.coordinatorRssBefore <= 0 ||
    baseline.memory.coordinatorRssAfter <= 0
  ) {
    throw new Error("performance evidence provenance or measurements are invalid");
  }
  for (const [name, current] of Object.entries(performanceEvidence.timingsMs)) {
    const recorded = baseline.timingsMs[name];
    if (recorded === undefined || current > Math.max(5_000, recorded * 20)) {
      throw new Error(`performance measurement exceeded its recorded bound: ${name}`);
    }
  }
}

const artifacts = [
  {
    path: redPath,
    content: normalize(red.summary, undefined, {
      missingProviderBlocked: true,
      misVersionedProviderBlocked: true,
      nonExecutableProviderBlocked: true,
      startedProviderFailureCleanedUp: true,
    }),
  },
  { path: greenPath, content: normalize(green.summary, semantic) },
];

let drift = false;
for (const artifact of artifacts) {
  if (mode === "write") {
    writeFileSync(artifact.path, artifact.content);
    continue;
  }
  const current = existsSync(artifact.path) ? readFileSync(artifact.path, "utf8") : "";
  if (current !== artifact.content) {
    drift = true;
    console.error(`acceptance artifact drifted: ${artifact.path}`);
  }
}
if (drift) process.exit(1);
console.log(
  mode === "write" ? "effx tracer evidence recorded" : "effx tracer acceptance: byte-identical",
);
