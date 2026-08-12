import { describe, expect, test } from "bun:test";

import { translateOxlintJson } from "../../src/diagnostics.js";
import { explainEffectTS } from "../../src/explain.js";

describe("EffectTS structured diagnostics", () => {
  test("joins native Oxlint JSON to semantic rule knowledge", () => {
    const output = translateOxlintJson(
      {
        diagnostics: [
          {
            message: "native plugin message",
            severity: "error",
            code: "effect(no-ambient-console)",
            filename: "src/users/load.ts",
            labels: [{ span: { offset: 120, length: 18, line: 18, column: 3 } }],
          },
          {
            message: "unrelated",
            severity: "warning",
            code: "eslint(no-console)",
            filename: "src/users/load.ts",
            labels: [{ span: { offset: 120, length: 18, line: 18, column: 3 } }],
          },
        ],
      },
      { pluginName: "effect" },
    );

    expect(output.schemaVersion).toBe(1);
    expect(output.diagnostics).toEqual([
      {
        schemaVersion: 1,
        code: "EFT2101",
        subject: {
          kind: "rule",
          rule: "effect/no-ambient-console",
          ruleName: "no-ambient-console",
        },
        family: "observability",
        invariant: "effect-owned-observability",
        severity: "error",
        message: "Ambient console access is outside EffectTS.",
        primarySpan: {
          file: "src/users/load.ts",
          offset: 120,
          length: 18,
          line: 18,
          column: 3,
        },
        explanation:
          "Observability must remain inside Effect capabilities and configured Logger layers.",
        help: "Use Effect.log*, effect/Console, or an injected logging service.",
        docs: "docs/rules/no-ambient-console.md",
        proofSources: ["syntax", "scope"],
        suggestions: [],
        origin: { engine: "oxlint", code: "effect(no-ambient-console)" },
      },
    ]);
  });

  test("normalizes a configured plugin alias without accepting similarly named engines", () => {
    const output = translateOxlintJson(
      {
        diagnostics: [
          {
            message: "x",
            severity: "warning",
            code: "eft(no-untyped-throw)",
            filename: "src/a.ts",
            labels: [{ span: { offset: 4, length: 5, line: 1, column: 5 } }],
          },
          {
            message: "x",
            severity: "warning",
            code: "eft-extra(no-untyped-throw)",
            filename: "src/b.ts",
            labels: [{ span: { offset: 0, length: 1, line: 1, column: 1 } }],
          },
        ],
      },
      { pluginName: "eft" },
    );

    expect(output.diagnostics).toHaveLength(1);
    expect(output.diagnostics[0]).toMatchObject({
      code: "EFT3201",
      severity: "warning",
      subject: { rule: "eft/no-untyped-throw" },
    });
  });

  test("ignores native plugin diagnostics whose names are inherited object keys", () => {
    expect(() =>
      translateOxlintJson(
        {
          diagnostics: ["constructor", "toString", "valueOf", "__proto__"].map((name) => ({
            message: "x",
            severity: "error" as const,
            code: `effect(${name})`,
            filename: "src/a.ts",
            labels: [{ span: { offset: 0, length: 1, line: 1, column: 1 } }],
          })),
        },
        { pluginName: "effect" },
      ),
    ).not.toThrow();
    expect(
      translateOxlintJson(
        {
          diagnostics: ["constructor", "toString", "valueOf", "__proto__"].map((name) => ({
            message: "x",
            severity: "error" as const,
            code: `effect(${name})`,
            filename: "src/a.ts",
            labels: [{ span: { offset: 0, length: 1, line: 1, column: 1 } }],
          })),
        },
        { pluginName: "effect" },
      ).diagnostics,
    ).toEqual([]);
  });
});

describe("EffectTS explain", () => {
  test("resolves rules by bare name, configured name, or semantic code", () => {
    const byName = explainEffectTS("no-native-promise-control-flow");
    expect(explainEffectTS("effect/no-native-promise-control-flow")).toEqual(byName);
    expect(explainEffectTS("EFT3101")).toEqual(byName);
    expect(byName).toMatchObject({
      code: "EFT3101",
      invariant: "effect-owned-asynchronous-computation",
      proofSources: ["syntax", "scope"],
    });
  });

  test("explains coordinator invariants and rejects unknown identifiers", () => {
    expect(explainEffectTS("EFT5101")).toMatchObject({
      code: "EFT5101",
      invariant: "effectts-import-closure",
      proofSources: ["module-graph"],
    });
    expect(explainEffectTS("EFT9999")).toBeNull();
  });

  test("rejects inherited object keys as unknown rule identifiers", () => {
    for (const name of ["constructor", "toString", "valueOf", "__proto__"]) {
      expect(explainEffectTS(name)).toBeNull();
    }
  });
});
