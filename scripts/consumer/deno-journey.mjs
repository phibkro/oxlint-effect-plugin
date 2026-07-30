/**
 * Deno-oriented declared compatibility journey.
 *
 * Declared surface (see compatibility.json): load the compiled ESM artifact
 * from node_modules (BYONM), read plugin/rule/domain metadata, and expand
 * typed configuration. Running the oxlint CLI under Deno is NOT part of the
 * declared surface and is not attempted here — this journey does not pretend
 * unsupported parity with the Bun and Node consumers.
 */

const PKG = "@phibkro/oxlint-effect-v4";

const fail = (message) => {
  console.error(`DENO JOURNEY FAIL: ${message}`);
  Deno.exit(1);
};

if (typeof Deno === "undefined") fail("this journey must run under Deno");

const resolved = import.meta.resolve(PKG);
if (!resolved.includes("node_modules/@phibkro/oxlint-effect-v4/dist/index.js")) {
  fail(`package did not resolve to compiled dist/index.js: ${resolved}`);
}

const api = await import(PKG);
const plugin = api.default;

if (plugin.meta.name !== "effect-v4") fail(`unexpected plugin name: ${plugin.meta.name}`);
if (typeof plugin.meta.version !== "string") fail("plugin version missing");
if (Object.keys(plugin.rules).length !== api.RULE_REGISTRY.length) {
  fail("plugin rules and registry disagree");
}
for (const rule of Object.values(plugin.rules)) {
  if (typeof rule.create !== "function") fail("rule without create function");
}
if (api.ROLES.length !== 7 || api.PLATFORMS.length !== 6 || api.BOUNDARIES.length !== 4) {
  fail("domain vocabulary drifted");
}

const fragment = api.expandDomains({
  technology: "effect-v4",
  groups: [
    { files: ["src/**"], role: "effect-library", platform: "portable", strictness: "strict" },
    { files: ["main.ts"], role: "composition-root", platform: "deno" },
  ],
});
if (fragment.jsPlugins[0]?.specifier !== PKG) fail("expansion lost plugin specifier");
if (fragment.overrides.length !== 2) fail("expansion lost overrides");
const libraryRules = fragment.overrides[0]?.rules ?? {};
if (libraryRules["effect-v4/no-native-promise-control-flow"] === undefined) {
  fail("strict expansion missing promise rule");
}

console.log(
  `DENO JOURNEY OK: loaded ${PKG}@${plugin.meta.version} compiled artifact under ${Deno.version.deno}; metadata and typed expansion verified (oxlint CLI execution intentionally out of declared surface)`,
);
