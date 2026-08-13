import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { translateOxlintJson, type OxlintJsonOutput } from "./diagnostics.js";
import type {
  EffxDiagnostic,
  EffxProject,
  ExternalEffxDiagnostic,
  SourceSnapshot,
} from "./effx-types.js";
import { EffxFailure, snapshotSource } from "./effx-types.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REVIEWED_PROVIDER_VERSIONS = {
  oxlint: "1.77.0",
  typescript: "7.0.2",
  "@effect/tsgo": "0.36.4",
} as const;
const reviewed = REVIEWED_PROVIDER_VERSIONS;

const resolvePackage = (project: EffxProject, name: string): string => {
  const relativeName = `${name}/package.json`;
  let current = project.root;
  while (true) {
    const path = resolve(current, "node_modules", relativeName);
    if (existsSync(path)) return path;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const bundled = resolve(packageRoot, "node_modules", relativeName);
  if (existsSync(bundled)) return bundled;
  throw new EffxFailure(
    "EFFX_PROVIDER_MISSING",
    `effx: required provider package ${name} is unavailable`,
  );
};

const packageVersion = (path: string): string => {
  const manifest = JSON.parse(readFileSync(path, "utf8")) as { version?: unknown };
  if (typeof manifest.version !== "string")
    throw new EffxFailure(
      "EFFX_PROVIDER_INVALID",
      `effx: provider manifest has no version: ${path}`,
    );
  return manifest.version;
};

const executable = (project: EffxProject, name: string, bin: string): string => {
  const override = name === "oxlint" ? process.env.EFFX_OXLINT_PATH : undefined;
  if (override !== undefined) {
    if (!existsSync(override))
      throw new EffxFailure(
        "EFFX_PROVIDER_MISSING",
        `effx: configured Oxlint executable is unavailable: ${override}`,
      );
    return override;
  }
  const manifestPath = resolvePackage(project, name);
  const actual = packageVersion(manifestPath);
  const expected = reviewed[name as keyof typeof reviewed];
  if (expected !== undefined && actual !== expected)
    throw new EffxFailure(
      "EFFX_PROVIDER_VERSION",
      `effx: ${name} ${actual} does not match reviewed ${expected}`,
    );
  const path = resolve(dirname(manifestPath), bin);
  if (!existsSync(path))
    throw new EffxFailure(
      "EFFX_PROVIDER_MISSING",
      `effx: provider executable is unavailable: ${path}`,
    );
  return path;
};

const run = (
  command: string,
  args: readonly string[],
  cwd: string,
): { stdout: string; stderr: string; status: number } => {
  const result = spawnSync(command, [...args], {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error !== undefined)
    throw new EffxFailure(
      "EFFX_PROVIDER_SPAWN",
      `effx: provider failed to start: ${result.error.message}`,
    );
  const status = result.status ?? 2;
  if (status !== 0 && status !== 1)
    throw new EffxFailure(
      "EFFX_PROVIDER_FAILED",
      `effx: provider exited ${status}: ${(result.stderr || result.stdout).trim()}`,
    );
  return { stdout: result.stdout, stderr: result.stderr, status };
};
export interface ProviderInspection {
  readonly id: string;
  readonly reviewedVersion: string;
  readonly version: string;
  readonly manifestPath: string;
  readonly executablePath: string;
  readonly executableOverride: boolean;
}

export function inspectCheckProviders(project: EffxProject): readonly ProviderInspection[] {
  const binaries: Readonly<Record<string, string>> = {
    oxlint: "bin/oxlint",
    typescript: "bin/tsc",
    "@effect/tsgo": "dist/effect-tsgo.cjs",
  };
  return Object.entries(REVIEWED_PROVIDER_VERSIONS).map(([id, reviewedVersion]) => {
    const manifestPath = resolvePackage(project, id);
    const version = packageVersion(manifestPath);
    if (version !== reviewedVersion)
      throw new EffxFailure(
        "EFFX_PROVIDER_VERSION",
        `effx: ${id} ${version} does not match reviewed ${reviewedVersion}`,
      );
    const override = id === "oxlint" ? process.env.EFFX_OXLINT_PATH : undefined;
    const executablePath = override ?? resolve(dirname(manifestPath), binaries[id]!);
    if (!existsSync(executablePath))
      throw new EffxFailure(
        "EFFX_PROVIDER_MISSING",
        `effx: provider executable is unavailable: ${executablePath}`,
      );
    return {
      id,
      reviewedVersion,
      version,
      manifestPath,
      executablePath,
      executableOverride: override !== undefined,
    };
  });
}

const snapshotByPath = (project: EffxProject, file: string): SourceSnapshot => {
  const absolute = isAbsolute(file) ? resolve(file) : resolve(project.root, file);
  const snapshot = project.snapshots.find((candidate) => resolve(candidate.path) === absolute);
  if (snapshot === undefined)
    throw new EffxFailure(
      "EFFX_PROVIDER_ATTRIBUTION",
      `effx: provider diagnostic references unanalyzed file ${file}`,
    );
  return snapshot;
};

const external = (input: {
  snapshot: SourceSnapshot;
  provider: string;
  engine: string;
  code: string;
  start: number;
  end: number;
  severity: "error" | "warning" | "message" | "suggestion";
  message: string;
  proof: "generic-ts-types" | "effect-types";
  system: "typescript" | "provider";
}): ExternalEffxDiagnostic => ({
  schemaVersion: 2,
  provider: input.provider,
  source: snapshotSource(input.snapshot),
  range: { start: input.start, end: input.end },
  severity: input.severity,
  message: input.message,
  proofKinds: [input.proof],
  suggestions: [],
  origin: { engine: input.engine, code: input.code },
  governed: false,
  code: input.code,
  subject: { kind: "external", system: input.system },
  family: "external",
});

const runOxlint = (project: EffxProject): EffxDiagnostic[] => {
  const bin = executable(project, "oxlint", "bin/oxlint");
  if (!existsSync(project.oxlintConfigPath))
    throw new EffxFailure(
      "EFFX_CONFIG_INVALID",
      `effx: Oxlint config not found: ${project.oxlintConfigPath}`,
    );
  const result = run(
    process.execPath,
    [
      bin,
      "--format",
      "json",
      "--config",
      project.oxlintConfigPath,
      ...project.snapshots.map(({ path }) => path),
    ],
    project.root,
  );
  let parsed: OxlintJsonOutput;
  try {
    parsed = JSON.parse(result.stdout) as OxlintJsonOutput;
  } catch (error) {
    throw new EffxFailure("EFFX_PROVIDER_OUTPUT", `effx: invalid Oxlint JSON: ${String(error)}`);
  }
  if (!Array.isArray(parsed.diagnostics))
    throw new EffxFailure("EFFX_PROVIDER_OUTPUT", "effx: Oxlint JSON omitted diagnostics");
  const pluginName = project.config.effect.pluginName ?? "effect";
  const governed = translateOxlintJson(parsed, { pluginName }).diagnostics.map((diagnostic) => {
    const snapshot = snapshotByPath(project, diagnostic.primarySpan.file);
    const base = {
      schemaVersion: 2 as const,
      provider: "oxlint",
      source: snapshotSource(snapshot),
      range: {
        start: diagnostic.primarySpan.offset,
        end: diagnostic.primarySpan.offset + diagnostic.primarySpan.length,
      },
      severity: diagnostic.severity,
      message: diagnostic.message,
      docs: diagnostic.docs,
      proofKinds: diagnostic.proofSources.map((source) =>
        source === "typed-oxlint"
          ? ("generic-ts-types" as const)
          : source === "tsgo"
            ? ("effect-types" as const)
            : source,
      ),
      suggestions: diagnostic.suggestions.map((suggestion) => ({
        applicability: suggestion.applicability,
        message: suggestion.message,
      })),
      origin: { engine: "oxlint", code: diagnostic.origin.code },
      governed: true as const,
      code: diagnostic.code,
      subject: diagnostic.subject,
      family: diagnostic.family,
      invariant: diagnostic.invariant,
    };
    return {
      ...base,
      ...(diagnostic.explanation === undefined ? {} : { explanation: diagnostic.explanation }),
      ...(diagnostic.help === undefined ? {} : { help: diagnostic.help }),
    };
  });
  const governedKeys = new Set(
    governed.map((diagnostic) => `${diagnostic.origin.code}:${diagnostic.range.start}`),
  );
  const generic = parsed.diagnostics
    .filter(
      (diagnostic) =>
        !governedKeys.has(`${diagnostic.code}:${diagnostic.labels[0]?.span.offset ?? -1}`),
    )
    .map((diagnostic) => {
      const snapshot = snapshotByPath(project, diagnostic.filename);
      const span = diagnostic.labels[0]?.span;
      if (span === undefined)
        throw new EffxFailure(
          "EFFX_PROVIDER_OUTPUT",
          `effx: Oxlint diagnostic ${diagnostic.code} has no primary span`,
        );
      return external({
        snapshot,
        provider: "oxlint",
        engine: "oxlint",
        code: String(diagnostic.code),
        start: span.offset,
        end: span.offset + span.length,
        severity:
          diagnostic.severity === "error" || diagnostic.severity === 2 ? "error" : "warning",
        message: diagnostic.message,
        proof: "generic-ts-types",
        system: "provider",
      });
    });
  return [...governed, ...generic];
};

const lineOffset = (text: string, line: number, column: number): number => {
  let offset = 0;
  for (let current = 1; current < line; current += 1) {
    const next = text.indexOf("\n", offset);
    if (next < 0) return text.length;
    offset = next + 1;
  }
  return Math.min(text.length, offset + Math.max(0, column - 1));
};

const runTypescript = (project: EffxProject): EffxDiagnostic[] => {
  const manifest = resolvePackage(project, "typescript");
  if (packageVersion(manifest) !== reviewed.typescript)
    throw new EffxFailure(
      "EFFX_PROVIDER_VERSION",
      `effx: TypeScript must be ${reviewed.typescript}`,
    );
  if (!existsSync(project.tsconfigPath))
    throw new EffxFailure(
      "EFFX_CONFIG_INVALID",
      `effx: tsconfig not found: ${project.tsconfigPath}`,
    );
  const bin = resolve(dirname(manifest), "bin/tsc");
  const node = process.execPath;
  const result = run(
    node,
    [bin, "--project", project.tsconfigPath, "--pretty", "false", "--noEmit"],
    project.root,
  );
  const diagnostics: EffxDiagnostic[] = [];
  const pattern = /^(.*)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/gm;
  for (const match of result.stdout.matchAll(pattern)) {
    const snapshot = snapshotByPath(project, match[1] ?? "");
    const start = lineOffset(snapshot.text, Number(match[2]), Number(match[3]));
    diagnostics.push(
      external({
        snapshot,
        provider: "typescript",
        engine: "typescript",
        code: match[5] ?? "typescript",
        start,
        end: start + 1,
        severity: match[4] === "warning" ? "warning" : "error",
        message: match[6] ?? "TypeScript diagnostic",
        proof: "generic-ts-types",
        system: "typescript",
      }),
    );
  }
  return diagnostics;
};

const runEffectTsgo = (project: EffxProject): EffxDiagnostic[] => {
  const bin = executable(project, "@effect/tsgo", "dist/effect-tsgo.cjs");
  const result = run(
    process.execPath,
    [bin, "diagnostics", "--project", project.tsconfigPath, "--format", "json"],
    project.root,
  );
  let parsed: { diagnostics?: unknown };
  try {
    parsed = JSON.parse(result.stdout) as { diagnostics?: unknown };
  } catch (error) {
    throw new EffxFailure(
      "EFFX_PROVIDER_OUTPUT",
      `effx: invalid Effect TSGO JSON: ${String(error)}`,
    );
  }
  if (!Array.isArray(parsed.diagnostics))
    throw new EffxFailure("EFFX_PROVIDER_OUTPUT", "effx: Effect TSGO JSON omitted diagnostics");
  return parsed.diagnostics.map((value) => {
    const diagnostic = value as Record<string, unknown>;
    if (
      typeof diagnostic.file !== "string" ||
      typeof diagnostic.start !== "number" ||
      typeof diagnostic.length !== "number" ||
      typeof diagnostic.code !== "number" ||
      typeof diagnostic.message !== "string"
    )
      throw new EffxFailure("EFFX_PROVIDER_OUTPUT", "effx: malformed Effect TSGO diagnostic");
    if (diagnostic.code < 370_000)
      throw new EffxFailure(
        "EFFX_PROVIDER_OUTPUT",
        `effx: unreviewed Effect TSGO diagnostic class ${diagnostic.code}`,
      );
    const snapshot = snapshotByPath(project, diagnostic.file);
    return external({
      snapshot,
      provider: "@effect/tsgo",
      engine: "@effect/tsgo",
      code: String(diagnostic.code),
      start: diagnostic.start,
      end: diagnostic.start + diagnostic.length,
      severity: diagnostic.severity === "warning" ? "warning" : "error",
      message: diagnostic.message,
      proof: "effect-types",
      system: "provider",
    });
  });
};

export interface ProviderObservation {
  readonly id: string;
  readonly version: string;
}
export interface ProviderCheckResult {
  readonly diagnostics: readonly EffxDiagnostic[];
  readonly providers: readonly ProviderObservation[];
}

export function runCheckProviders(project: EffxProject): ProviderCheckResult {
  return {
    diagnostics: [...runOxlint(project), ...runTypescript(project), ...runEffectTsgo(project)],
    providers: Object.entries(reviewed).map(([id, version]) => ({ id, version })),
  };
}
