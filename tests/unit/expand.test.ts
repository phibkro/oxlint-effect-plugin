import { describe, expect, test } from "bun:test";

import { expandDomains, expandGroupRules } from "../../src/config/expand.js";
import { recommended, strict } from "../../src/config/presets.js";
import { RULE_REGISTRY } from "../../src/registry.js";

describe("expandGroupRules", () => {
  test("effect-library portable recommended enables the recommended families only", () => {
    const rules = expandGroupRules(
      {
        files: ["src/**"],
        role: "effect-library",
        platform: "portable",
      },
      "effect-v4",
    );
    expect(Object.keys(rules).toSorted()).toEqual([
      "effect/no-ambient-authority",
      "effect/no-ambient-console",
      "effect/no-cross-runtime",
      "effect/no-premature-execution",
    ]);
  });

  test("strictness enables strict-only rules and marks runPromise ownership", () => {
    const rules = expandGroupRules(
      {
        files: ["src/**"],
        role: "effect-library",
        platform: "portable",
        strictness: "strict",
      },
      "effect-v4",
    );
    expect(rules["effect/no-native-promise-control-flow"]).toEqual([
      "error",
      { technology: "effect-v4", role: "effect-library", platform: "portable" },
    ]);
    expect(rules["effect/no-untyped-throw"]).toBeDefined();
    expect(rules["effect/no-premature-execution"]).toEqual([
      "error",
      {
        technology: "effect-v4",
        role: "effect-library",
        platform: "portable",
        promiseRuleActive: true,
      },
    ]);
  });

  test("boundary gating: no-raw-json-parse requires external-data", () => {
    const without = expandGroupRules(
      { files: ["a"], role: "service", platform: "portable" },
      "effect-v4",
    );
    expect(without["effect/no-raw-json-parse"]).toBeUndefined();
    const withBoundary = expandGroupRules(
      {
        files: ["a"],
        role: "service",
        platform: "portable",
        boundaries: ["external-data"],
      },
      "effect-v4",
    );
    expect(withBoundary["effect/no-raw-json-parse"]).toEqual([
      "error",
      {
        technology: "effect-v4",
        role: "service",
        platform: "portable",
        boundaries: ["external-data"],
      },
    ]);
  });

  test("test role gets only the portability rule", () => {
    const rules = expandGroupRules(
      {
        files: ["**/*.test.ts"],
        role: "test",
        platform: "portable",
        strictness: "strict",
      },
      "effect-v4",
    );
    expect(Object.keys(rules)).toEqual(["effect/no-cross-runtime"]);
  });

  test("severity override off disables a rule and releases runPromise ownership", () => {
    const rules = expandGroupRules(
      {
        files: ["a"],
        role: "application",
        platform: "portable",
        strictness: "strict",
        severityOverrides: { "no-native-promise-control-flow": "off" },
      },
      "effect-v4",
    );
    expect(rules["effect/no-native-promise-control-flow"]).toBeUndefined();
    expect(rules["effect/no-premature-execution"]).toEqual([
      "error",
      { technology: "effect-v4", role: "application", platform: "portable" },
    ]);
  });

  test("composition-root keeps execution rules off", () => {
    const rules = expandGroupRules(
      {
        files: ["main.ts"],
        role: "composition-root",
        platform: "node",
        strictness: "strict",
      },
      "effect-v4",
    );
    expect(rules["effect/no-premature-execution"]).toBeUndefined();
    expect(rules["effect/no-native-promise-control-flow"]).toBeUndefined();
    expect(rules["effect/no-ambient-console"]).toBeDefined();
  });
});

describe("expandDomains", () => {
  test("emits explicit plugin alias and per-group overrides", () => {
    const fragment = expandDomains({
      technology: "effect-v4",
      groups: [{ files: ["src/**"], role: "application", platform: "portable" }],
    });
    expect(fragment.jsPlugins).toEqual([
      { name: "effect", specifier: "@phibkro/oxlint-effect-plugin" },
    ]);
    expect(fragment.overrides).toHaveLength(1);
    expect(fragment.overrides[0]?.files).toEqual(["src/**"]);
  });

  test("rejects empty groups and unknown domains", () => {
    expect(() => expandDomains({ technology: "effect-v4", groups: [] })).toThrow();
    expect(() =>
      expandDomains({
        technology: "effect-v4",
        groups: [{ files: [], role: "application", platform: "portable" }],
      }),
    ).toThrow();
    expect(() =>
      expandDomains({
        technology: "effect-v4",
        // Runtime validation for untyped (JavaScript) callers.
        groups: [{ files: ["a"], role: "warehouse" as never, platform: "portable" }],
      }),
    ).toThrow('unknown role "warehouse"');
  });

  test("technology is required and runtime-authoritative for untyped callers", () => {
    const groups = [{ files: ["src/**"], role: "application", platform: "portable" }] as const;
    expect(() => expandDomains({ groups } as never)).toThrow('requires "effect-v4"');
    expect(() => expandDomains({ technology: "effect-v3" as never, groups })).toThrow(
      'requires "effect-v4"',
    );
    expect(() => expandGroupRules(groups[0], "effect-v3" as never)).toThrow('requires "effect-v4"');
  });
});

describe("presets", () => {
  test("recommended excludes strict-only rules; strict includes them", () => {
    const recommendedRules = Object.keys(recommended.overrides[0]?.rules ?? {});
    const strictRules = Object.keys(strict.overrides[0]?.rules ?? {});
    for (const info of RULE_REGISTRY) {
      const id = `effect/${info.name}`;
      if (info.strictOnly) {
        expect(recommendedRules).not.toContain(id);
      }
    }
    expect(strictRules).toContain("effect/no-native-promise-control-flow");
    expect(strictRules).toContain("effect/no-untyped-throw");
    expect(strictRules).toContain("effect/no-raw-json-parse");
  });
});
