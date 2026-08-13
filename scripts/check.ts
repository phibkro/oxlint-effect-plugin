/**
 * `bun run check` — the always-green gate.
 *
 * Runs formatting, lint, type checking, unit tests, portable-import checks,
 * package export checks, documentation/generation consistency, and the
 * oracle matrix in both config forms. A missing required tool fails rather
 * than degrading to a warning.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  assertCompatibilityState,
  assertReviewedRuntimeVersions,
  parseRuntimeVersion,
} from "./compatibility-policy.js";

const repoRoot = join(import.meta.dir, "..");

interface Step {
  readonly name: string;
  readonly run: () => Promise<void> | void;
}

async function exec(cmd: readonly string[], opts: { cwd?: string } = {}): Promise<void> {
  const bin = cmd[0];
  if (bin === undefined) throw new Error("empty command");
  const proc = Bun.spawn([...cmd], {
    cwd: opts.cwd ?? repoRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) throw new Error(`${cmd.join(" ")} exited ${exitCode}`);
}

async function capture(
  cmd: readonly string[],
  opts: { cwd?: string } = {},
): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }> {
  const bin = cmd[0];
  if (bin === undefined) throw new Error("empty command");
  const proc = Bun.spawn([...cmd], {
    cwd: opts.cwd ?? repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

const local = (bin: string): string => {
  const path = join(repoRoot, "node_modules", ".bin", bin);
  if (!existsSync(path)) {
    throw new Error(`required tool missing: ${bin} (expected at ${path}); run bun install`);
  }
  return path;
};

const SOURCE_DIRS = ["src", "scripts", "tests"];

const steps: Step[] = [
  {
    name: "format (oxfmt --check)",
    run: () => exec(["bun", local("oxfmt"), "--check", ...SOURCE_DIRS]),
  },
  {
    name: "lint (oxlint native rules over repo sources)",
    run: () => exec(["bun", local("oxlint"), "--config", ".oxlintrc.json", ...SOURCE_DIRS]),
  },
  {
    name: "types (tsc --noEmit)",
    run: () => exec(["bun", local("tsc"), "--noEmit", "-p", "tsconfig.json"]),
  },
  {
    name: "unit tests (bun test)",
    run: () => exec(["bun", "test", "tests/unit"]),
  },
  {
    name: "native suppression host-gate",
    run: () => exec(["bun", "run", "scripts/audit-suppressions.ts", "src", "fixtures"]),
  },
  {
    name: "full compatibility table, lock, and exact reviewed runtimes",
    run: async () => {
      const compatibility = JSON.parse(readFileSync(join(repoRoot, "compatibility.json"), "utf8"));
      assertCompatibilityState({
        packageJson: JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")),
        compatibility,
        lock: Bun.JSONC.parse(readFileSync(join(repoRoot, "bun.lock"), "utf8")),
      });
      const node = await capture(["nix", "shell", "nixpkgs#nodejs", "-c", "node", "--version"]);
      if (node.exitCode !== 0) throw new Error(`Node version probe failed: ${node.stderr}`);
      const deno = await capture(["deno", "--version"]);
      if (deno.exitCode !== 0) throw new Error(`Deno version probe failed: ${deno.stderr}`);
      assertReviewedRuntimeVersions(compatibility, {
        bun: Bun.version,
        node: parseRuntimeVersion("node", node.stdout),
        deno: parseRuntimeVersion("deno", deno.stdout),
      });
    },
  },
  {
    name: "typed companions (Oxlint generic + Effect TSGO observed-red probes)",
    run: async () => {
      const nodeShell = ["nix", "shell", "nixpkgs#nodejs", "-c"] as const;
      const generic = await capture([
        ...nodeShell,
        "bun",
        local("oxlint"),
        "--config",
        "fixtures/type-aware/.oxlintrc.json",
        "fixtures/type-aware/unsafe-assertion.ts",
      ]);
      if (
        generic.exitCode !== 1 ||
        !`${generic.stdout}\n${generic.stderr}`.includes("no-unsafe-type-assertion")
      ) {
        throw new Error(
          `Oxlint --type-aware probe did not produce the pinned typed diagnostic\n${generic.stdout}\n${generic.stderr}`,
        );
      }

      const executable = await capture([...nodeShell, local("effect-tsgo"), "get-exe-path"]);
      if (executable.exitCode !== 0) {
        throw new Error(`effect-tsgo get-exe-path failed:\n${executable.stderr}`);
      }
      const executablePath = executable.stdout.trim();
      if (!executablePath.includes("node_modules/@effect/tsgo-")) {
        throw new Error(`effect-tsgo returned unexpected executable path: ${executablePath}`);
      }
      const effect = await capture([
        ...nodeShell,
        local("effect-tsgo"),
        "diagnostics",
        "--project",
        "fixtures/type-aware/tsconfig.json",
        "--format",
        "json",
      ]);
      if (
        effect.exitCode !== 1 ||
        !effect.stdout.includes('"name": "floatingEffect"') ||
        !effect.stdout.includes('"errors": 1')
      ) {
        throw new Error(
          `@effect/tsgo probe did not produce the pinned floatingEffect diagnostic\n${effect.stdout}\n${effect.stderr}`,
        );
      }
    },
  },
  {
    name: "build and verify ignored distribution output",
    run: () => exec(["bun", "run", "build"]),
  },
  {
    name: "approved Console repair through real Oxlint RuleTester",
    run: () =>
      exec(["nix", "shell", "nixpkgs#nodejs", "-c", "node", "scripts/verify-console-fix.mjs"]),
  },
  {
    name: "authoritative role and platform runtime rejection",
    run: async () => {
      for (const { config, context } of [
        { config: "fixtures/domain-validation/missing-role.json", context: "role" },
        { config: "fixtures/domain-validation/invalid-role.json", context: "role" },
        { config: "fixtures/domain-validation/missing-platform.json", context: "platform" },
        { config: "fixtures/domain-validation/invalid-platform.json", context: "platform" },
      ]) {
        const result = await capture([
          "bun",
          local("oxlint"),
          "--config",
          config,
          "fixtures/domain-validation/input.ts",
        ]);
        const output = `${result.stdout}\n${result.stderr}`;
        if (result.exitCode === 0 || !output.includes(context)) {
          throw new Error(
            `${config} was not rejected for its ${context} declaration\n${result.stdout}\n${result.stderr}`,
          );
        }
      }
    },
  },
  {
    name: "portable core imports (dist has only relative imports)",
    run: () => {
      const offenders: string[] = [];
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) walk(path);
          else if (entry.name.endsWith(".js")) {
            const text = readFileSync(path, "utf8");
            for (const match of text.matchAll(
              /\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|(?:^|\n)\s*import\s*["']([^"']+)["']/g,
            )) {
              const specifier = match[1] ?? match[2] ?? match[3] ?? "";
              if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
                offenders.push(`${path}: ${specifier}`);
              }
            }
          }
        }
      };
      walk(join(repoRoot, "dist"));
      if (offenders.length > 0) {
        throw new Error(`portable core must import nothing external:\n${offenders.join("\n")}`);
      }
    },
  },
  {
    name: "package exports (compiled plugin shape and files)",
    run: async () => {
      const distIndex = join(repoRoot, "dist", "index.js");
      // Runtime-selected build output: this check must load the generated dist artifact.
      const module = (await import(distIndex)) as {
        default: { meta: { name: string; version: string }; rules: Record<string, unknown> };
        effect: unknown;
        importClosurePolicy: unknown;
        auditNativeDisableDirectives: unknown;
        auditEffectTSEscapes: unknown;
        evaluateImportClosure: unknown;
        explainEffectTS: unknown;
        translateOxlintJson: unknown;
        RULE_REGISTRY: readonly { rule: string }[];
      } & Record<string, unknown>;
      const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
        version: string;
        files: readonly string[];
        exports: Record<string, unknown>;
        engines: { node: string };
        devDependencies: Record<string, string>;
      };
      if (module.default.meta.name !== "effect") throw new Error("plugin meta.name drifted");
      if (module.default.meta.version !== pkg.version) throw new Error("plugin version drifted");
      const ruleNames = Object.keys(module.default.rules);
      if (ruleNames.length !== module.RULE_REGISTRY.length) {
        throw new Error("plugin rules and registry disagree");
      }
      for (const info of module.RULE_REGISTRY) {
        if (!ruleNames.includes(info.rule))
          throw new Error(`registry rule not exported: ${info.rule}`);
      }
      if (typeof module.effect !== "function") throw new Error("effect builder missing");
      if (typeof module.importClosurePolicy !== "function") {
        throw new Error("import-closure policy builder missing");
      }
      for (const removedName of [
        "expandDomains",
        "expandImportClosurePolicy",
        "recommended",
        "strict",
        "TECHNOLOGIES",
        "isTechnology",
      ]) {
        if (removedName in module) {
          throw new Error(`removed public export remains: ${removedName}`);
        }
      }
      if (typeof module.auditNativeDisableDirectives !== "function") {
        throw new Error("suppression audit export missing");
      }
      for (const apiName of [
        "auditEffectTSEscapes",
        "evaluateImportClosure",
        "explainEffectTS",
        "translateOxlintJson",
      ] as const) {
        if (typeof module[apiName] !== "function") throw new Error(`${apiName} export missing`);
      }
      for (const file of [
        "dist/index.js",
        "dist/index.d.ts",
        "dist/cli.js",
        "dist/cli.d.ts",
        "LICENSE",
        "README.md",
        "PROVENANCE.md",
        "compatibility.json",
        "docs/tsgo-boundary.md",
        "docs/import-closure.md",
        "docs/suppression-audit.md",
        "guidance/effectts-knowledge.json",
        "guidance/AGENTS.fragment.md",
        "guidance/skills/effectts-programming/SKILL.md",
      ]) {
        if (!existsSync(join(repoRoot, file))) throw new Error(`distributed file missing: ${file}`);
      }
    },
  },
  {
    name: "generation consistency (docs, compatibility, version, matrix)",
    run: () => exec(["bun", "run", "scripts/generate.ts", "check"]),
  },
  {
    name: "observed-red/green oracle evidence consistency",
    run: () => exec(["bun", "run", "scripts/record-oracle-evidence.ts", "check"]),
  },
  {
    name: "effx provider seam tracer acceptance",
    run: () => exec(["bun", "run", "scripts/accept-effx-0001.ts"]),
  },
  {
    name: "oracle matrix (json + ts config forms, equivalence)",
    run: () => exec(["bun", "run", "scripts/run-matrix.ts"]),
  },
];

let failed = false;
for (const step of steps) {
  console.log(`\n--- check: ${step.name} ---`);
  try {
    await step.run();
    console.log(`ok: ${step.name}`);
  } catch (error) {
    console.error(`FAIL: ${step.name}:`, error instanceof Error ? error.message : error);
    failed = true;
    break;
  }
}

if (failed) process.exit(1);
console.log("\ncheck: all gates green");
