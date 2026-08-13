/**
 * Deno-oriented declared compatibility journey.
 *
 * Declared surface (see compatibility.json): load the compiled ESM artifact
 * from node_modules (BYONM), read plugin/rule/domain metadata, and expand
 * typed configuration. Running the oxlint CLI under Deno is NOT part of the
 * declared surface and is not attempted here — this journey does not pretend
 * unsupported parity with the Bun and Node consumers.
 */

const PKG = "@phibkro/oxlint-effect-plugin";

const fail = (message) => {
  console.error(`DENO JOURNEY FAIL: ${message}`);
  Deno.exit(1);
};

if (typeof Deno === "undefined") fail("this journey must run under Deno");

const resolved = import.meta.resolve(PKG);
if (!resolved.includes("node_modules/@phibkro/oxlint-effect-plugin/dist/index.js")) {
  fail(`package did not resolve to compiled dist/index.js: ${resolved}`);
}
const packageMetadata = JSON.parse(await Deno.readTextFile(new URL("../package.json", resolved)));
const compatibilityMetadata = JSON.parse(
  await Deno.readTextFile(new URL("../compatibility.json", resolved)),
);
const expectedTechnology = {
  name: "effect",
  domain: "effect-v4",
  major: 4,
  reviewed: "4.0.0-beta.107",
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

if (plugin.meta.name !== "effect") fail(`unexpected plugin name: ${plugin.meta.name}`);
if (typeof plugin.meta.version !== "string") fail("plugin version missing");
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
  groups: [
    { files: ["src/**"], role: "application", platform: "portable" },
    {
      files: ["adapters/**"],
      role: "runtime-adapter",
      platform: "deno",
      adapterDependencies: ["stripe"],
    },
  ],
});
if (
  projectedPolicy.groups[0]?.adapterDependencies.length !== 0 ||
  projectedPolicy.groups[1]?.adapterDependencies[0] !== "stripe"
) {
  fail("packed import closure policy projection drifted");
}
if (api.explainEffectTS("EFT5101")?.invariant !== "effectts-import-closure") {
  fail("explain API did not resolve EFT5101");
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
for (const rule of Object.values(plugin.rules)) {
  if (typeof rule.create !== "function") fail("rule without create function");
}
if (api.ROLES.length !== 7 || api.PLATFORMS.length !== 6 || api.BOUNDARIES.length !== 4) {
  fail("domain vocabulary drifted");
}

const fragment = api.effect({
  groups: [
    { files: ["src/**"], role: "effect-library", platform: "portable" },
    { files: ["main.ts"], role: "composition-root", platform: "deno" },
  ],
});
if (fragment.jsPlugins[0]?.specifier !== PKG) fail("expansion lost plugin specifier");
if (fragment.overrides.length !== 2) fail("expansion lost overrides");
const libraryRules = fragment.overrides[0]?.rules ?? {};
if (libraryRules["effect/no-native-promise-control-flow"] === undefined) {
  fail("strict expansion missing promise rule");
}

console.log(
  `DENO JOURNEY OK: loaded ${PKG}@${plugin.meta.version} compiled artifact under ${Deno.version.deno}; metadata and typed expansion verified (oxlint CLI execution intentionally out of declared surface)`,
);
