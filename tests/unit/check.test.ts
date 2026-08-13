import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EffxDiagnostic, EffxProject, SourceSnapshot } from "../../src/effx-types.js";
import { applyCheckPolicy } from "../../src/policy-check.js";
import { loadEffxProject } from "../../src/project.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const project = (source: string, effectOverrides: Record<string, unknown> = {}): EffxProject => {
  const root = mkdtempSync(join(tmpdir(), "effx-check-unit-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "main.ts"), source);
  writeFileSync(join(root, ".oxlintrc.json"), '{"rules":{}}\n');
  writeFileSync(
    join(root, "tsconfig.json"),
    '{"compilerOptions":{"strict":true,"noEmit":true},"include":["src/**/*.ts"]}\n',
  );
  writeFileSync(
    join(root, "effx.config.json"),
    JSON.stringify({
      effect: {
        groups: [{ files: ["src/**/*.ts"], role: "application", platform: "portable" }],
        ...effectOverrides,
      },
      oxlintConfig: ".oxlintrc.json",
      tsconfig: "tsconfig.json",
    }),
  );
  return loadEffxProject(root);
};

const governed = (snapshot: SourceSnapshot, start: number, end: number): EffxDiagnostic => ({
  schemaVersion: 2,
  provider: "oxlint",
  source: {
    uri: snapshot.uri,
    version: 1,
    versionAuthority: "coordinator",
    sha256: snapshot.sha256,
  },
  range: { start, end },
  severity: "error",
  message: "Ambient console access is outside EffectTS.",
  proofKinds: ["scope"],
  suggestions: [],
  origin: { engine: "oxlint", code: "effect(no-ambient-console)" },
  governed: true,
  code: "EFT2101",
  subject: { kind: "rule", rule: "effect/no-ambient-console", ruleName: "no-ambient-console" },
  family: "observability",
  invariant: "effect-owned-observability",
});

describe("effx check policy", () => {
  test("suppresses one exact local rule and rejects stale escapes", () => {
    const source = [
      "// oxlint-effect-plugin allow(no-ambient-console):",
      "// reason: vendor callback is lifted at this boundary",
      'console.log("x");',
    ].join("\n");
    const loaded = project(source);
    const snapshot = loaded.snapshots[0]!;
    const start = source.lastIndexOf("console");
    expect(applyCheckPolicy(loaded, [governed(snapshot, start, source.length)])).toEqual([]);
    expect(applyCheckPolicy(loaded, [])).toMatchObject([{ code: "EFT9002" }]);
  });

  test("keeps native disable findings through a valid file opt-out", () => {
    const loaded = project(
      [
        "// oxlint-effect-plugin ignore-file:",
        "// reason: generated vendor bindings",
        "// oxlint-disable",
        'console.log("x");',
      ].join("\n"),
    );
    const snapshot = loaded.snapshots[0]!;
    const start = snapshot.text.indexOf("console");
    expect(
      applyCheckPolicy(loaded, [governed(snapshot, start, start + 11)]).map(({ code }) => code),
    ).toEqual(["EFT9031"]);
  });

  test("rejects raw packages and accepts reasoned trusted-pure packages", () => {
    const raw = project('import sdk from "vendor-sdk"\nsdk()\n');
    expect(applyCheckPolicy(raw, []).map(({ code }) => code)).toContain("EFT5101");
    const trusted = project('import format from "date-fns/format"\nformat(new Date(), "")\n', {
      trustedPureDependencies: [
        { specifier: "date-fns/format", reason: "Pure formatting of supplied dates" },
      ],
    });
    expect(applyCheckPolicy(trusted, []).map(({ code }) => code)).not.toContain("EFT5101");
  });

  test("preserves UTF-16 diagnostic ranges after non-ASCII text", () => {
    const loaded = project('const face = "😀"\nconsole.log(face)\n');
    const snapshot = loaded.snapshots[0]!;
    const start = snapshot.text.indexOf("console");
    expect(applyCheckPolicy(loaded, [governed(snapshot, start, start + 7)])[0]?.range).toEqual({
      start,
      end: start + 7,
    });
  });
});
