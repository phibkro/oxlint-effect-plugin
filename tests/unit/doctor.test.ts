import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctor, renderDoctorHuman } from "../../src/doctor.js";

const roots: string[] = [];
afterEach(() => {
  delete process.env.EFFX_OXLINT_PATH;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const project = (): string => {
  const root = mkdtempSync(join(tmpdir(), "effx-doctor-unit-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/main.ts"), "export const value = 1\n");
  writeFileSync(join(root, ".oxlintrc.json"), '{"rules":{}}\n');
  writeFileSync(join(root, "tsconfig.json"), '{"compilerOptions":{"strict":true,"noEmit":true}}\n');
  writeFileSync(
    join(root, "effx.config.json"),
    JSON.stringify({
      effect: { groups: [{ files: ["src/**/*.ts"], role: "application", platform: "portable" }] },
      oxlintConfig: ".oxlintrc.json",
      tsconfig: "tsconfig.json",
    }),
  );
  return root;
};

describe("effx doctor", () => {
  test("reports exact providers and names unverified future guarantees", () => {
    const output = doctor({ cwd: project() });
    expect(output.status).toBe(0);
    expect(
      output.checks.filter((check) => check.status === "pass").map((check) => check.id),
    ).toEqual([
      "project",
      "config:effx",
      "config:oxlint",
      "config:typescript",
      "provider:oxlint",
      "provider:typescript",
      "provider:@effect/tsgo",
    ]);
    expect(
      output.checks.filter((check) => check.status === "unverified").map((check) => check.id),
    ).toEqual([
      "binary-hash",
      "registry-integrity",
      "patch-detection",
      "editor-ownership",
      "daemon-custody",
      "platform-artifact-provenance",
    ]);
    expect(renderDoctorHuman(output)).toStartWith("effx doctor: healthy\n");
  });

  test("fails closed for a missing configured provider", () => {
    process.env.EFFX_OXLINT_PATH = join(project(), "missing-oxlint");
    const output = doctor({ cwd: project() });
    expect(output.status).toBe(2);
    expect(output.failure?.code).toBe("EFFX_PROVIDER_MISSING");
  });

  test("fails closed for an invalid project configuration", () => {
    const root = project();
    writeFileSync(join(root, "effx.config.json"), '{"effect":{"groups":[]}}\n');
    const output = doctor({ cwd: root });
    expect(output.status).toBe(2);
    expect(output.failure?.code).toBe("EFFX_CONFIG_INVALID");
  });
});
