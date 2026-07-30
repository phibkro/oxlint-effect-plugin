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
    name: "build (tsc -p tsconfig.build.json)",
    run: async () => {
      await exec(["rm", "-rf", join(repoRoot, "dist")]);
      await exec(["bun", local("tsc"), "-p", "tsconfig.build.json"]);
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
      const module = (await import(distIndex)) as {
        default: { meta: { name: string; version: string }; rules: Record<string, unknown> };
        expandDomains: unknown;
        recommended: { overrides: readonly unknown[] };
        strict: unknown;
        RULE_REGISTRY: readonly { name: string }[];
      };
      const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
        version: string;
        files: readonly string[];
        exports: Record<string, unknown>;
      };
      if (module.default.meta.name !== "effect-v4") throw new Error("plugin meta.name drifted");
      if (module.default.meta.version !== pkg.version) throw new Error("plugin version drifted");
      const ruleNames = Object.keys(module.default.rules);
      if (ruleNames.length !== module.RULE_REGISTRY.length) {
        throw new Error("plugin rules and registry disagree");
      }
      for (const info of module.RULE_REGISTRY) {
        if (!ruleNames.includes(info.name))
          throw new Error(`registry rule not exported: ${info.name}`);
      }
      if (typeof module.expandDomains !== "function") throw new Error("expandDomains missing");
      if (module.recommended.overrides.length === 0) throw new Error("recommended preset empty");
      for (const file of [
        "dist/index.js",
        "dist/index.d.ts",
        "LICENSE",
        "README.md",
        "PROVENANCE.md",
        "compatibility.json",
        "docs/tsgo-boundary.md",
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
