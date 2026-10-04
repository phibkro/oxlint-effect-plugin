import { expect, test } from "bun:test";
import type { OxlintConfig } from "oxlint";

import { effect } from "../../src/config/expand.js";

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
