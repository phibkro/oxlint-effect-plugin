import { describe, expect, test } from "bun:test";

import { expandDomains, expandGroupRules } from "../../src/config/expand.js";
import { recommended, strict } from "../../src/config/presets.js";
import { RULE_REGISTRY } from "../../src/registry.js";

describe("expandGroupRules", () => {
  test("effect-library portable recommended enables the recommended families only", () => {
    const rules = expandGroupRules({
      files: ["src/**"],
      role: "effect-library",
      platform: "portable",
    });
    expect(Object.keys(rules).toSorted()).toEqual([
      "effect-v4/no-ambient-authority",
      "effect-v4/no-ambient-console",
      "effect-v4/no-cross-runtime",
      "effect-v4/no-premature-execution",
    ]);
  });

  test("strictness enables strict-only rules and marks runPromise ownership", () => {
    const rules = expandGroupRules({
      files: ["src/**"],
      role: "effect-library",
      platform: "portable",
      strictness: "strict",
    });
    expect(rules["effect-v4/no-native-promise-control-flow"]).toEqual([
      "error",
      { role: "effect-library", platform: "portable" },
    ]);
    expect(rules["effect-v4/no-untyped-throw"]).toBeDefined();
    expect(rules["effect-v4/no-premature-execution"]).toEqual([
      "error",
      { role: "effect-library", platform: "portable", promiseRuleActive: true },
    ]);
  });

  test("boundary gating: no-raw-json-parse requires external-data", () => {
    const without = expandGroupRules({ files: ["a"], role: "service", platform: "portable" });
    expect(without["effect-v4/no-raw-json-parse"]).toBeUndefined();
    const withBoundary = expandGroupRules({
      files: ["a"],
      role: "service",
      platform: "portable",
      boundaries: ["external-data"],
    });
    expect(withBoundary["effect-v4/no-raw-json-parse"]).toEqual([
      "error",
      { role: "service", platform: "portable", boundaries: ["external-data"] },
    ]);
  });

  test("test role gets only the portability rule", () => {
    const rules = expandGroupRules({
      files: ["**/*.test.ts"],
      role: "test",
      platform: "portable",
      strictness: "strict",
    });
    expect(Object.keys(rules)).toEqual(["effect-v4/no-cross-runtime"]);
  });

  test("severity override off disables a rule and releases runPromise ownership", () => {
    const rules = expandGroupRules({
      files: ["a"],
      role: "application",
      platform: "portable",
      strictness: "strict",
      severityOverrides: { "no-native-promise-control-flow": "off" },
    });
    expect(rules["effect-v4/no-native-promise-control-flow"]).toBeUndefined();
    expect(rules["effect-v4/no-premature-execution"]).toEqual([
      "error",
      { role: "application", platform: "portable" },
    ]);
  });

  test("composition-root keeps execution rules off", () => {
    const rules = expandGroupRules({
      files: ["main.ts"],
      role: "composition-root",
      platform: "node",
      strictness: "strict",
    });
    expect(rules["effect-v4/no-premature-execution"]).toBeUndefined();
    expect(rules["effect-v4/no-native-promise-control-flow"]).toBeUndefined();
    expect(rules["effect-v4/no-ambient-console"]).toBeDefined();
  });
});

describe("expandDomains", () => {
  test("emits explicit plugin alias and per-group overrides", () => {
    const fragment = expandDomains({
      groups: [{ files: ["src/**"], role: "application", platform: "portable" }],
    });
    expect(fragment.jsPlugins).toEqual([
      { name: "effect-v4", specifier: "@phibkro/oxlint-effect-v4" },
    ]);
    expect(fragment.overrides).toHaveLength(1);
    expect(fragment.overrides[0]?.files).toEqual(["src/**"]);
  });

  test("rejects empty groups and unknown domains", () => {
    expect(() => expandDomains({ groups: [] })).toThrow();
    expect(() =>
      expandDomains({
        groups: [{ files: [], role: "application", platform: "portable" }],
      }),
    ).toThrow();
    expect(() =>
      expandDomains({
        // Runtime validation for untyped (JavaScript) callers.
        groups: [{ files: ["a"], role: "warehouse" as never, platform: "portable" }],
      }),
    ).toThrow('unknown role "warehouse"');
  });
});

describe("presets", () => {
  test("recommended excludes strict-only rules; strict includes them", () => {
    const recommendedRules = Object.keys(recommended.overrides[0]?.rules ?? {});
    const strictRules = Object.keys(strict.overrides[0]?.rules ?? {});
    for (const info of RULE_REGISTRY) {
      const id = `effect-v4/${info.name}`;
      if (info.strictOnly) {
        expect(recommendedRules).not.toContain(id);
      }
    }
    expect(strictRules).toContain("effect-v4/no-native-promise-control-flow");
    expect(strictRules).toContain("effect-v4/no-untyped-throw");
    expect(strictRules).toContain("effect-v4/no-raw-json-parse");
  });
});
