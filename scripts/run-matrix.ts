/**
 * Repo-mode oracle runner.
 *
 * Usage: bun run scripts/run-matrix.ts [--plugin <path>] [--config-form json|ts|both]
 *
 * Generates the matrix oxlint configuration (both `.oxlintrc.json` and
 * `oxlint.config.ts` forms), runs oxlint over fixtures/, compares against the
 * inline `// expect:` markers, and exits nonzero on any mismatch. With
 * `--plugin`, points jsPlugins at an alternative plugin build (used to
 * observe the oracle red against a non-reporting stub).
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildMatrixConfig,
  collectExpected,
  compareMatrix,
  formatComparison,
  parseOxlintOutput,
  runOxlint,
} from "./matrix-lib.js";

const repoRoot = join(import.meta.dir, "..");

const args = process.argv.slice(2);
const argValue = (flag: string): string | null => {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] ?? null) : null;
};

const pluginSpecifier = argValue("--plugin") ?? "./dist/index.js";
const configForm = argValue("--config-form") ?? "both";

const expected = collectExpected(repoRoot, join(repoRoot, "fixtures"));
const config = buildMatrixConfig(pluginSpecifier);

const scratch = mkdtempSync(join(tmpdir(), "oxlint-effect-v4-matrix-"));

interface FormResult {
  readonly form: string;
  readonly comparison: ReturnType<typeof compareMatrix>;
}

const results: FormResult[] = [];

try {
  const forms = configForm === "both" ? ["json", "ts"] : [configForm];
  for (const form of forms) {
    let configPath: string;
    if (form === "json") {
      configPath = join(repoRoot, ".matrix.oxlintrc.json");
      writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    } else {
      configPath = join(repoRoot, "matrix.oxlint.config.ts");
      writeFileSync(
        configPath,
        `import { defineConfig } from "oxlint";\n\nexport default defineConfig(${JSON.stringify(config, null, 2)});\n`,
      );
    }
    try {
      const { stdout } = await runOxlint({
        cwd: repoRoot,
        configPath,
        targets: ["fixtures"],
      });
      const actual = parseOxlintOutput(stdout, repoRoot, repoRoot);
      results.push({ form, comparison: compareMatrix(expected, actual) });
    } finally {
      rmSync(configPath, { force: true });
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

let failed = false;
for (const { form, comparison } of results) {
  console.log(`\n=== matrix run (config form: ${form}, plugin: ${pluginSpecifier}) ===`);
  console.log(formatComparison(comparison));
  if (comparison.missing.length > 0 || comparison.unexpected.length > 0) failed = true;
}

const normalize = (r: FormResult): string =>
  JSON.stringify(
    r.comparison.actual
      .map(({ file, rule, line }) => ({ file, rule, line }))
      .toSorted((x, y) => (x.file + x.line + x.rule < y.file + y.line + y.rule ? -1 : 1)),
  );

if (results.length === 2) {
  const [a, b] = results;
  if (a !== undefined && b !== undefined) {
    if (normalize(a) !== normalize(b)) {
      console.error("\nFAIL: .oxlintrc.json and oxlint.config.ts produced different diagnostics");
      failed = true;
    } else {
      console.log(
        "\nconfig-form equivalence: .oxlintrc.json and oxlint.config.ts diagnostics identical",
      );
    }
  }
}

process.exit(failed ? 1 : 0);
