/**
 * Shared oracle-matrix machinery (runtime adapter code; Bun-only).
 *
 * Responsibilities: expand the fixture matrix into oxlint configuration via
 * the plugin's own `expandDomains` (the same expansion consumers use),
 * collect inline `// expect:` markers from fixture files, run oxlint, and
 * diff actual against expected diagnostics.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { MATRIX, type FixtureGroup } from "../fixtures/matrix.js";
import { expandDomains } from "../src/config/expand.js";

export interface ExpectedDiagnostic {
  readonly file: string;
  readonly rule: string;
  readonly line: number;
}

export interface ActualDiagnostic extends ExpectedDiagnostic {
  readonly message: string;
}

export interface MatrixComparison {
  readonly expected: readonly ExpectedDiagnostic[];
  readonly actual: readonly ActualDiagnostic[];
  readonly missing: readonly ExpectedDiagnostic[];
  readonly unexpected: readonly ActualDiagnostic[];
  readonly perFamilyMissing: Readonly<Record<string, number>>;
}

const EXPECT_SAME_LINE = /\/\/\s*expect:\s*([a-z-,\s]+)$/;
const EXPECT_NEXT_LINE = /\/\/\s*expect-next-line:\s*([a-z-,\s]+)$/;

export function listFixtureFiles(fixturesRoot: string, group: FixtureGroup): string[] {
  return readdirSync(join(fixturesRoot, group.dir))
    .filter((name) => name.endsWith(".ts"))
    .toSorted()
    .map((name) => join(fixturesRoot, group.dir, name));
}

/** Inline markers in one fixture file → expected diagnostics. */
export function parseExpectations(repoRoot: string, filePath: string): ExpectedDiagnostic[] {
  const text = readFileSync(filePath, "utf8");
  const file = relative(repoRoot, filePath);
  const expected: ExpectedDiagnostic[] = [];
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index] ?? "";
    const same = EXPECT_SAME_LINE.exec(lineText);
    const next = EXPECT_NEXT_LINE.exec(lineText);
    const match = same ?? next;
    if (match === null) continue;
    const line = same !== null ? index + 1 : index + 2;
    for (const rule of (match[1] ?? "").split(",").map((entry) => entry.trim())) {
      if (rule.length > 0) expected.push({ file, rule, line });
    }
  }
  return expected;
}

export function collectExpected(repoRoot: string, fixturesRoot: string): ExpectedDiagnostic[] {
  const expected: ExpectedDiagnostic[] = [];
  for (const group of MATRIX) {
    for (const file of listFixtureFiles(fixturesRoot, group)) {
      expected.push(...parseExpectations(repoRoot, file));
    }
  }
  return expected;
}

/**
 * Oxlint configuration for the matrix. `pluginSpecifier` is the jsPlugins
 * import specifier: a relative path in repo mode, the package name in
 * consumer mode. Native rule categories are disabled so the oracle observes
 * only this plugin's diagnostics.
 */
export function buildMatrixConfig(pluginSpecifier: string): Record<string, unknown> {
  const fragment = expandDomains({
    technology: "effect-v4",
    pluginSpecifier,
    groups: MATRIX.map((group) => ({
      files: [`fixtures/${group.dir}/**/*.ts`],
      role: group.role,
      platform: group.platform,
      ...(group.boundaries !== undefined ? { boundaries: group.boundaries } : {}),
      ...(group.strictness !== undefined ? { strictness: group.strictness } : {}),
    })),
  });
  return {
    jsPlugins: fragment.jsPlugins,
    categories: { correctness: "off" },
    rules: fragment.rules,
    overrides: fragment.overrides,
  };
}

interface OxlintJsonDiagnostic {
  readonly message: string;
  readonly code: string;
  readonly filename: string;
  readonly labels: readonly { readonly span: { readonly line: number } }[];
}

const CODE_PATTERN = /^effect-v4\((.+)\)$/;

export function parseOxlintOutput(
  stdout: string,
  repoRoot: string,
  cwd: string,
): ActualDiagnostic[] {
  const parsed = JSON.parse(stdout) as { diagnostics: readonly OxlintJsonDiagnostic[] };
  const actual: ActualDiagnostic[] = [];
  for (const diagnostic of parsed.diagnostics) {
    const code = CODE_PATTERN.exec(diagnostic.code);
    if (code === null) continue;
    const line = diagnostic.labels[0]?.span.line ?? 0;
    actual.push({
      file: relative(repoRoot, join(cwd, diagnostic.filename)),
      rule: code[1] ?? "",
      line,
      message: diagnostic.message,
    });
  }
  return actual;
}

const key = (d: ExpectedDiagnostic): string => `${d.file}:${d.line}:${d.rule}`;

export function familyOfRule(rule: string): string {
  return rule;
}

export function compareMatrix(
  expected: readonly ExpectedDiagnostic[],
  actual: readonly ActualDiagnostic[],
): MatrixComparison {
  const actualCounts = new Map<string, number>();
  for (const diagnostic of actual) {
    actualCounts.set(key(diagnostic), (actualCounts.get(key(diagnostic)) ?? 0) + 1);
  }
  const missing: ExpectedDiagnostic[] = [];
  for (const diagnostic of expected) {
    const k = key(diagnostic);
    const count = actualCounts.get(k) ?? 0;
    if (count > 0) actualCounts.set(k, count - 1);
    else missing.push(diagnostic);
  }
  const expectedCounts = new Map<string, number>();
  for (const diagnostic of expected) {
    expectedCounts.set(key(diagnostic), (expectedCounts.get(key(diagnostic)) ?? 0) + 1);
  }
  const unexpected: ActualDiagnostic[] = [];
  for (const diagnostic of actual) {
    const k = key(diagnostic);
    const count = expectedCounts.get(k) ?? 0;
    if (count > 0) expectedCounts.set(k, count - 1);
    else unexpected.push(diagnostic);
  }
  const perFamilyMissing: Record<string, number> = {};
  for (const diagnostic of missing) {
    perFamilyMissing[diagnostic.rule] = (perFamilyMissing[diagnostic.rule] ?? 0) + 1;
  }
  return { expected, actual, missing, unexpected, perFamilyMissing };
}

export async function runOxlint(args: {
  readonly cwd: string;
  readonly configPath: string;
  readonly targets: readonly string[];
}): Promise<{ stdout: string; exitCode: number }> {
  const oxlintBin = join(args.cwd, "node_modules", ".bin", "oxlint");
  const proc = Bun.spawn(
    ["bun", oxlintBin, "--config", args.configPath, "--format", "json", ...args.targets],
    { cwd: args.cwd, stdout: "pipe", stderr: "pipe" },
  );
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (stdout.trim().length === 0) {
    throw new Error(`oxlint produced no JSON output (exit ${exitCode}): ${stderr}`);
  }
  return { stdout, exitCode };
}

export function formatComparison(comparison: MatrixComparison): string {
  const lines: string[] = [];
  lines.push(
    `expected=${comparison.expected.length} actual-plugin-diagnostics=${comparison.actual.length} missing=${comparison.missing.length} unexpected=${comparison.unexpected.length}`,
  );
  if (comparison.missing.length > 0) {
    lines.push("", "missing (expected but not reported):");
    for (const d of comparison.missing) lines.push(`  ${d.file}:${d.line} ${d.rule}`);
    lines.push("", "missing per rule family:");
    for (const [rule, count] of Object.entries(comparison.perFamilyMissing)) {
      lines.push(`  ${rule}: ${count}`);
    }
  }
  if (comparison.unexpected.length > 0) {
    lines.push("", "unexpected (reported but not expected):");
    for (const d of comparison.unexpected)
      lines.push(`  ${d.file}:${d.line} ${d.rule} — ${d.message}`);
  }
  return lines.join("\n");
}
