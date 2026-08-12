import { describe, expect, test } from "bun:test";

import {
  EFFECTTS_KNOWLEDGE,
  IMPORT_CLOSURE_DEFINITION,
  KNOWLEDGE_INFO_BY_CODE,
  RULE_INFO_BY_CODE,
  RULE_INFO_BY_NAME,
  RULE_NAMES,
  RULE_REGISTRY,
  type Strictness,
} from "../../src/registry.js";

const STRICTNESS_LEVELS: readonly Strictness[] = ["recommended", "strict"];

describe("EffectTS rule knowledge", () => {
  test("publishes one stable semantic definition for every shipped rule", () => {
    expect(RULE_REGISTRY.map(({ rule }) => rule)).toEqual([...RULE_NAMES]);
    expect(new Set(RULE_REGISTRY.map(({ code }) => code)).size).toBe(RULE_REGISTRY.length);

    for (const definition of RULE_REGISTRY) {
      expect(definition.code).toMatch(/^EFT[1-59][0-9]{3}$/);
      expect(definition.strictness.every((level) => STRICTNESS_LEVELS.includes(level))).toBe(true);
      expect(new Set(definition.strictness).size).toBe(definition.strictness.length);
      expect(Object.keys(definition.applicability)).toEqual(["roles", "boundaries"]);
      expect(definition.applicability.roles.length).toBeGreaterThan(0);
      expect(Array.isArray(definition.applicability.boundaries)).toBe(true);
      expect(definition).not.toHaveProperty("presets");
      expect(definition).not.toHaveProperty("profile");
      expect(definition).not.toHaveProperty("required");
      expect(definition.invariant.length).toBeGreaterThan(0);
      expect(definition.diagnostic.explanation.length).toBeGreaterThan(0);
      expect(definition.diagnostic.help.length).toBeGreaterThan(0);
      expect(definition.proofSources).not.toContain("convention");
      expect(definition.proofSources).not.toContain("unenforceable");
      expect(RULE_INFO_BY_NAME[definition.rule]).toBe(definition);
      expect(RULE_INFO_BY_CODE[definition.code]).toBe(definition);
    }

    expect(EFFECTTS_KNOWLEDGE).toHaveLength(RULE_REGISTRY.length + 1);
    expect(IMPORT_CLOSURE_DEFINITION).toMatchObject({
      code: "EFT5101",
      invariant: "effectts-import-closure",
      proofSources: ["module-graph"],
    });
    expect(KNOWLEDGE_INFO_BY_CODE["EFT5101"]).toBe(IMPORT_CLOSURE_DEFINITION);
  });

  test("keeps strictness monotonic", () => {
    const recommendedRules = RULE_REGISTRY.filter(
      ({ strictness, defaultSeverity }) =>
        defaultSeverity !== "off" && strictness.includes("recommended"),
    ).map(({ rule }) => rule);
    const strictRules = RULE_REGISTRY.filter(
      ({ strictness, defaultSeverity }) =>
        defaultSeverity !== "off" && strictness.includes("strict"),
    ).map(({ rule }) => rule);

    expect(recommendedRules).toEqual([
      "no-ambient-console",
      "no-ambient-authority",
      "no-cross-runtime",
      "no-premature-execution",
      "no-raw-json-parse",
      "no-opaque-instance-fields",
    ]);
    expect(strictRules).toEqual(
      RULE_NAMES.filter((rule) => rule !== "no-import-from-barrel-package"),
    );
    expect(recommendedRules.every((rule) => strictRules.includes(rule))).toBe(true);
    expect(RULE_INFO_BY_NAME["no-import-from-barrel-package"].defaultSeverity).toBe("off");
  });

  test("publishes the executable generator console repair", () => {
    expect(RULE_INFO_BY_NAME["no-ambient-console"].replacements).toEqual([
      {
        from: "console.log",
        to: "yield* Console.log",
        import: { module: "effect", symbol: "Console" },
        applicability: "machine-applicable",
      },
    ]);
  });

  test("treats inherited object keys as unknown registry entries", () => {
    for (const key of ["constructor", "toString", "valueOf", "__proto__"]) {
      expect(RULE_INFO_BY_NAME[key as keyof typeof RULE_INFO_BY_NAME]).toBeUndefined();
      expect(RULE_INFO_BY_CODE[key as keyof typeof RULE_INFO_BY_CODE]).toBeUndefined();
      expect(KNOWLEDGE_INFO_BY_CODE[key as keyof typeof KNOWLEDGE_INFO_BY_CODE]).toBeUndefined();
    }
  });
});
