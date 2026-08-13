import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const cli = join(root, "node_modules", "@phibkro", "oxlint-effect-plugin", "dist", "cli.js");
const node = process.execPath;

const writeProject = (name, source, config) => {
  const dir = join(root, name);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "main.ts"), source);
  writeFileSync(join(dir, "effx.config.json"), `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(
    join(dir, "tsconfig.json"),
    '{"compilerOptions":{"strict":true,"noEmit":true},"include":["src/**/*.ts"]}\n',
  );
  writeFileSync(join(dir, ".oxlintrc.json"), '{"rules":{}}\n');
  return dir;
};

const config = {
  effect: { groups: [{ files: ["src/**/*.ts"], role: "application", platform: "portable" }] },
  oxlintConfig: ".oxlintrc.json",
  tsconfig: "tsconfig.json",
};

const run = (cwd, args, env = process.env) =>
  spawnSync(node, [cli, "check", ...args], { cwd, env, encoding: "utf8" });
const runDoctor = (cwd, args, env = process.env) =>
  spawnSync(node, [cli, "doctor", ...args], { cwd, env, encoding: "utf8" });
const parse = (result) => {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`invalid check JSON (${result.status}): ${result.stdout}\n${result.stderr}`);
  }
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const valid = writeProject("check-valid", "export const value = 1\n", config);
const validJsonRun = run(valid, ["--format", "json"]);
const validJson = parse(validJsonRun);
assert(
  validJsonRun.status === 0,
  `valid status ${validJsonRun.status}: ${validJsonRun.stdout}\n${validJsonRun.stderr}`,
);
assert(
  validJson.schemaVersion === 2 && validJson.status === 0 && validJson.diagnostics.length === 0,
  `invalid clean envelope: ${validJsonRun.stdout}`,
);
const validHuman = run(valid, []);
assert(
  validHuman.status === 0 && validHuman.stdout === "effx check: clean\n",
  `invalid clean human output: ${validHuman.stdout}`,
);

const doctorRun = runDoctor(valid, ["--format", "json"]);
const doctorJson = parse(doctorRun);
assert(
  doctorRun.status === 0 &&
    doctorJson.schemaVersion === 1 &&
    doctorJson.status === 0 &&
    doctorJson.checks.some(
      (check) => check.id === "provider:@effect/tsgo" && check.status === "pass",
    ) &&
    doctorJson.checks.some((check) => check.id === "binary-hash" && check.status === "unverified"),
  `doctor did not report bounded provider health: ${doctorRun.stdout}\n${doctorRun.stderr}`,
);
const doctorHuman = runDoctor(valid, []);
assert(
  doctorHuman.status === 0 && doctorHuman.stdout.startsWith("effx doctor: healthy\n"),
  `invalid doctor human output: ${doctorHuman.stdout}`,
);

const invalid = writeProject("check-invalid", "export const value = 1\n", {
  effect: { groups: [] },
});
const invalidRun = run(invalid, ["--format", "json"]);
const invalidJson = parse(invalidRun);
assert(
  invalidRun.status === 2 &&
    invalidJson.status === 2 &&
    invalidJson.diagnostics.length === 0 &&
    invalidJson.failure?.code === "EFFX_CONFIG_INVALID",
  `invalid config did not fail closed: ${invalidRun.stdout}`,
);

const violation = writeProject("check-violation", 'import sdk from "vendor-sdk"\nsdk()\n', config);
const violationRun = run(violation, ["--format", "json"]);
const violationJson = parse(violationRun);
assert(
  violationRun.status === 1 && violationJson.status === 1,
  `violation status drifted: ${violationRun.stdout}`,
);
assert(
  violationJson.diagnostics.some(
    (diagnostic) => diagnostic.code === "EFT5101" && diagnostic.provider === "effx-module-graph",
  ),
  `missing import-closure diagnostic: ${violationRun.stdout}`,
);

const missingProvider = writeProject("check-provider-failure", "export const value = 1\n", config);
const providerRun = run(missingProvider, ["--format", "json"], {
  ...process.env,
  EFFX_OXLINT_PATH: join(root, "does-not-exist"),
});
const providerJson = parse(providerRun);
assert(
  providerRun.status === 2 &&
    providerJson.status === 2 &&
    providerJson.diagnostics.length === 0 &&
    providerJson.failure?.code === "EFFX_PROVIDER_MISSING",
  `provider failure did not fail closed: ${providerRun.stdout}`,
);

const doctorProviderRun = runDoctor(missingProvider, ["--format", "json"], {
  ...process.env,
  EFFX_OXLINT_PATH: join(root, "does-not-exist"),
});
const doctorProviderJson = parse(doctorProviderRun);
assert(
  doctorProviderRun.status === 2 &&
    doctorProviderJson.status === 2 &&
    doctorProviderJson.failure?.code === "EFFX_PROVIDER_MISSING",
  `doctor provider failure did not fail closed: ${doctorProviderRun.stdout}`,
);

console.log(
  "CHECK JOURNEY OK: packed check clean=0 violation=1 config/provider=2; doctor health=0 provider=2",
);
