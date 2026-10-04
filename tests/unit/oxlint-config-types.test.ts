import { expect, test } from "bun:test";
import type { OxlintConfig } from "oxlint";

import { effect, type OxlintConfigFragment } from "../../src/config/expand.js";

// The contract is compile-time: `tsc` rejects this module when the expansion
// stops being assignable to Oxlint's own configuration type, which is what a
// consumer's `defineConfig({ ...effect(input) })` requires.
test("effect() output is assignable to Oxlint's configuration type", () => {
  const fragment = effect({
    groups: [{ files: ["src/**/*.ts"], role: "service", platform: "portable" }],
  });
  const config: OxlintConfig = { ...fragment };

  expect(config.jsPlugins).toEqual(fragment.jsPlugins);
  expect(config.overrides?.[0]?.files).toEqual(["src/**/*.ts"]);
  expect(Object.keys(config.overrides?.[0]?.rules ?? {})).not.toHaveLength(0);
});

// A consumer makes the last matching group own every plugin rule by setting
// each rule it does not enable to "off". Oxlint validates the options of an off
// plugin rule, so the entry must be the bare "off", and the fragment type has to
// admit it for the completed fragment to keep its annotation.
const completeWithOff = (fragment: OxlintConfigFragment): OxlintConfigFragment => ({
  ...fragment,
  overrides: fragment.overrides.map((override) => ({
    ...override,
    rules: { "effect/no-ambient-console": "off", ...override.rules },
  })),
});

test("a fragment completed with bare off settings keeps the fragment type", () => {
  const completed = completeWithOff(
    effect({
      strictness: "recommended",
      groups: [{ files: ["tests/**"], role: "test", platform: "portable" }],
    }),
  );
  const config: OxlintConfig = { ...completed };

  expect(completed.overrides[0]?.rules["effect/no-ambient-console"]).toBe("off");
  expect(config.overrides?.[0]?.rules?.["effect/no-ambient-console"]).toBe("off");
});
