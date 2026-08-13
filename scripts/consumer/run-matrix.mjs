/**
 * Isolated-consumer oracle runner (plain JavaScript, no TypeScript loader).
 *
 * Runs inside a temporary consumer directory that installed
 * @phibkro/oxlint-effect-plugin from its packed tarball. Loads the compiled
 * plugin API through the package export map, expands the fixture matrix into
 * both oxlint config forms, runs the consumer's own oxlint over the copied
 * fixtures, and compares diagnostics against the inline `// expect:` markers.
 *
 * Marker grammar mirrors scripts/matrix-lib.ts in the repository; the repo
 * check gate runs both parsers against the same fixtures, so parser drift
 * surfaces as an oracle mismatch.
 *
 * Works under both Bun and Node via process.execPath.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const consumerRoot = process.cwd();
const PKG = "@phibkro/oxlint-effect-plugin";

const fail = (message) => {
  console.error(`CONSUMER FAIL: ${message}`);
  process.exit(1);
};

// --- 1. the packed artifact must resolve to compiled JavaScript -------------
const resolvedUrl = import.meta.resolve(PKG);
const resolvedPath = fileURLToPath(resolvedUrl);
if (!resolvedPath.includes(join("node_modules", "@phibkro", "oxlint-effect-plugin"))) {
  fail(`package resolved outside consumer node_modules: ${resolvedPath}`);
}
if (!resolvedPath.endsWith(join("dist", "index.js"))) {
  fail(`package did not resolve to compiled dist/index.js: ${resolvedPath}`);
}
const installedRoot = resolvedPath.slice(0, resolvedPath.indexOf(join("dist", "index.js")));
if (existsSync(join(installedRoot, "src", "index.ts"))) {
  fail("installed package contains repository TypeScript sources");
}
const packageMetadata = JSON.parse(readFileSync(join(installedRoot, "package.json"), "utf8"));
const compatibilityMetadata = JSON.parse(
  readFileSync(join(installedRoot, "compatibility.json"), "utf8"),
);
const expectedTechnology = {
  name: "effect",
  domain: "effect-v4",
  major: 4,
  reviewed: "4.0.0-rc.108",
  reviewPolicy: "exact",
};
if (
  packageMetadata.name !== PKG ||
  JSON.stringify(packageMetadata.effectCompatibility) !== JSON.stringify(expectedTechnology) ||
  compatibilityMetadata.package?.name !== PKG ||
  JSON.stringify(compatibilityMetadata.technology) !== JSON.stringify(expectedTechnology)
) {
  fail("version-neutral identity or Effect compatibility metadata drifted");
}

const api = await import(PKG);
const auditApi = await import(`${PKG}/suppression-audit`);
const plugin = api.default;
if (plugin.meta.name !== "effect") fail(`unexpected plugin name ${plugin.meta.name}`);
if (Object.keys(plugin.rules).length !== api.RULE_REGISTRY.length) {
  fail("plugin rules and registry disagree");
}
if (
  auditApi.auditNativeDisableDirectives("// oxlint-disable").at(0)?.reason !==
  "broad-native-disable"
) {
  fail("portable suppression-audit subpath did not detect native bypass");
}
for (const apiName of [
  "effect",
  "importClosurePolicy",
  "auditEffectTSEscapes",
  "evaluateImportClosure",
  "explainEffectTS",
  "translateOxlintJson",
]) {
  if (typeof api[apiName] !== "function") fail(`missing EffectTS API ${apiName}`);
}
const projectedPolicy = api.importClosurePolicy({
  trustedPureDependencies: [{ specifier: "date-fns/format", reason: "reviewed total transform" }],
  groups: [
    { files: ["fixtures/src/**"], role: "application", platform: "portable" },
    {
      files: ["fixtures/adapters/**"],
      role: "runtime-adapter",
      platform: "node",
      adapterDependencies: ["stripe"],
    },
  ],
});
if (
  projectedPolicy.trustedPureDependencies[0]?.specifier !== "date-fns/format" ||
  projectedPolicy.groups[1]?.adapterDependencies[0] !== "stripe"
) {
  fail("packed import closure policy projection drifted");
}
if (api.explainEffectTS("EFT3101")?.invariant !== "effect-owned-asynchronous-computation") {
  fail("explain API did not resolve EFT3101");
}
const importViolation = api.evaluateImportClosure({
  edges: [
    {
      importer: { file: "src/app.ts", role: "application", platform: "portable" },
      specifier: "stripe",
      kind: "value",
      target: { kind: "package" },
      span: { offset: 0, length: 6, line: 1, column: 1 },
    },
  ],
});
if (importViolation[0]?.code !== "EFT5101") fail("import closure did not reject a raw SDK");
const escapeFinding = api.auditEffectTSEscapes({
  file: "src/generated.ts",
  sourceText: "// oxlint-effect-plugin ignore-file:\n// reason:",
}).findings[0];
if (escapeFinding?.code !== "EFT9011" || escapeFinding.schemaVersion !== 1) {
  fail("escape audit did not emit a versioned file diagnostic");
}
const translated = api.translateOxlintJson(
  {
    diagnostics: [
      {
        message: "native",
        severity: "error",
        code: "effect(no-untyped-throw)",
        filename: "src/app.ts",
        labels: [{ span: { offset: 0, length: 5, line: 1, column: 1 } }],
      },
    ],
  },
  { pluginName: "effect" },
);
if (translated.diagnostics[0]?.code !== "EFT3201") {
  fail("diagnostic translation did not resolve EFT3201");
}
const explainCli = spawnSync(
  join(consumerRoot, "node_modules", ".bin", "effx"),
  ["explain", "EFT3101"],
  {
    encoding: "utf8",
  },
);
if (
  explainCli.status !== 0 ||
  !explainCli.stdout.includes("effect-owned-asynchronous-computation")
) {
  fail(`packed explain CLI failed: ${explainCli.stderr}`);
}
for (const { input, errorText } of [
  { input: { groups: [] }, errorText: "at least one rule group is required" },
  {
    input: { strictness: "recomended", groups: [] },
    errorText: 'unknown strictness "recomended"',
  },
]) {
  try {
    api.effect(input);
    fail(`invalid configuration was accepted: ${JSON.stringify(input)}`);
  } catch (error) {
    if (!String(error).includes(errorText)) throw error;
  }
}

// --- 2. expand the matrix through the installed package ---------------------
const matrix = JSON.parse(readFileSync(join(consumerRoot, "matrix.json"), "utf8")).groups;
const fragment = api.effect({
  groups: matrix.map((group) => ({
    files: [`fixtures/${group.dir}/**/*.ts`],
    role: group.role,
    platform: group.platform,
    ...(group.boundaries === undefined ? {} : { boundaries: group.boundaries }),
    ...(group.severityOverrides === undefined
      ? {}
      : { severityOverrides: group.severityOverrides }),
    ...(group.ruleOptions === undefined ? {} : { ruleOptions: group.ruleOptions }),
  })),
});
const config = {
  jsPlugins: fragment.jsPlugins,
  categories: { correctness: "off" },
  rules: fragment.rules,
  overrides: fragment.overrides,
};

// --- 3. expected diagnostics from inline markers -----------------------------
const EXPECT_SAME = /\/\/\s*expect:\s*([a-z-,\s]+)$/;
const EXPECT_NEXT = /\/\/\s*expect-next-line:\s*([a-z-,\s]+)$/;
const expected = [];
for (const group of matrix) {
  const dir = join(consumerRoot, "fixtures", group.dir);
  for (const name of readdirSync(dir)
    .filter((entry) => entry.endsWith(".ts"))
    .toSorted()) {
    const lines = readFileSync(join(dir, name), "utf8").split("\n");
    lines.forEach((lineText, index) => {
      const same = EXPECT_SAME.exec(lineText);
      const next = EXPECT_NEXT.exec(lineText);
      const match = same ?? next;
      if (match === null) return;
      const line = same === null ? index + 2 : index + 1;
      for (const rule of match[1].split(",").map((entry) => entry.trim())) {
        if (rule.length > 0) expected.push(`fixtures/${group.dir}/${name}:${line}:${rule}`);
      }
    });
  }
}

// --- 4. run oxlint in both config forms --------------------------------------
const oxlintBin = join(consumerRoot, "node_modules", "oxlint", "bin", "oxlint");
if (!existsSync(oxlintBin)) fail("consumer oxlint binary missing");

const runForm = (form) => {
  let configPath;
  if (form === "json") {
    configPath = join(consumerRoot, ".oxlintrc.matrix.json");
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  } else {
    configPath = join(consumerRoot, "matrix.oxlint.config.ts");
    writeFileSync(
      configPath,
      `import { defineConfig } from "oxlint";\n\nexport default defineConfig(${JSON.stringify(config, null, 2)});\n`,
    );
  }
  const result = spawnSync(
    process.execPath,
    [oxlintBin, "--config", configPath, "--format", "json", "fixtures"],
    { cwd: consumerRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  rmSync(configPath, { force: true });
  if (result.stdout.trim().length === 0) {
    fail(`oxlint produced no output (${form}): ${result.stderr}`);
  }
  const parsed = JSON.parse(result.stdout);
  return parsed.diagnostics
    .map((diagnostic) => {
      const code = /^effect\((.+)\)$/.exec(diagnostic.code);
      if (code === null) return null;
      return `${diagnostic.filename}:${diagnostic.labels[0]?.span.line ?? 0}:${code[1]}`;
    })
    .filter((entry) => entry !== null);
};

const diff = (expectedList, actualList) => {
  const remaining = [...actualList];
  const missing = [];
  for (const entry of expectedList) {
    const index = remaining.indexOf(entry);
    if (index >= 0) remaining.splice(index, 1);
    else missing.push(entry);
  }
  return { missing, unexpected: remaining };
};

const forms = {};
for (const form of ["json", "ts"]) {
  const actual = runForm(form);
  const { missing, unexpected } = diff(expected, actual);
  forms[form] = actual;
  console.log(
    `consumer matrix (${form}): expected=${expected.length} actual=${actual.length} missing=${missing.length} unexpected=${unexpected.length}`,
  );
  if (missing.length > 0 || unexpected.length > 0) {
    for (const entry of missing) console.error(`  missing: ${entry}`);
    for (const entry of unexpected) console.error(`  unexpected: ${entry}`);
    fail(`oracle mismatch in ${form} config form`);
  }
}

if (JSON.stringify(forms.json.toSorted()) !== JSON.stringify(forms.ts.toSorted())) {
  fail("config forms produced different diagnostics");
}

console.log(`CONSUMER OK: ${PKG} loaded compiled artifact, matrix green in both config forms`);
