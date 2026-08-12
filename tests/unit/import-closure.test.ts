import { describe, expect, test } from "bun:test";

import { evaluateImportClosure, type ImportEdge } from "../../src/import-closure.js";

function edge(overrides: Partial<ImportEdge>): ImportEdge {
  return {
    importer: {
      file: "src/app.ts",
      role: "application",
      platform: "portable",
      adapterDependencies: [],
    },
    target: { kind: "package" },
    specifier: "stripe",
    kind: "value",
    span: { offset: 0, length: 6, line: 1, column: 1 },
    ...overrides,
  };
}

describe("evaluateImportClosure", () => {
  test("rejects a raw SDK imported by an application", () => {
    const importEdge = edge({});

    expect(evaluateImportClosure({ edges: [importEdge] })).toMatchObject([
      {
        code: "EFT5101",
        invariant: "effectts-import-closure",
        edge: importEdge,
        proofSources: ["module-graph"],
      },
    ]);
  });

  test("accepts a declared SDK import from its runtime adapter", () => {
    const importEdge = edge({
      importer: {
        file: "src/adapters/payments.ts",
        role: "runtime-adapter",
        platform: "node",
        adapterDependencies: ["stripe"],
      },
    });

    expect(evaluateImportClosure({ edges: [importEdge] })).toEqual([]);
  });

  test("accepts an exact trusted-pure package with a reason", () => {
    const importEdge = edge({
      specifier: "date-fns/format",
      target: { kind: "package" },
    });

    expect(
      evaluateImportClosure({
        edges: [importEdge],
        trustedPureDependencies: [
          {
            specifier: "date-fns/format",
            reason: "Formats caller-provided dates without ambient authority",
          },
        ],
      }),
    ).toEqual([]);
  });

  test("rejects a trusted-pure dependency with a missing reason", () => {
    expect(() =>
      evaluateImportClosure({
        edges: [],
        trustedPureDependencies: [{ specifier: "date-fns", reason: "  " }],
      }),
    ).toThrow(/nonempty reason/);
  });

  test("accepts type-only imports regardless of target classification", () => {
    const importEdge = edge({
      target: { kind: "unknown" },
      specifier: "vendor/types",
      kind: "type",
    });

    expect(evaluateImportClosure({ edges: [importEdge] })).toEqual([]);
  });

  test("rejects side-effect-only raw package imports", () => {
    const importEdge = edge({ kind: "side-effect" });

    expect(evaluateImportClosure({ edges: [importEdge] })).toMatchObject([
      {
        code: "EFT5101",
        edge: importEdge,
        help: expect.any(String),
      },
    ]);
  });

  test("rejects a governed project edge outside the role graph", () => {
    const importEdge = edge({
      target: { kind: "project", role: "runtime-adapter" },
      specifier: "../adapters/payments.js",
    });

    expect(evaluateImportClosure({ edges: [importEdge] })).toMatchObject([
      {
        code: "EFT5101",
        edge: importEdge,
        rationale: expect.stringContaining("cannot import"),
      },
    ]);
  });

  test("orders violations by stable edge identity", () => {
    const later = edge({
      importer: { file: "src/z.ts", role: "application", platform: "portable" },
      specifier: "vendor/z",
    });
    const earlier = edge({
      importer: { file: "src/a.ts", role: "application", platform: "portable" },
      specifier: "vendor/a",
    });

    const violations = evaluateImportClosure({ edges: [later, earlier] });

    expect(violations.map(({ edge: importEdge }) => importEdge.importer.file)).toEqual([
      "src/a.ts",
      "src/z.ts",
    ]);
  });

  test("matches trusted package subpaths exactly", () => {
    const allowed = edge({ specifier: "date-fns/format" });
    const prefixCollision = edge({ specifier: "date-fns/formatDistance" });

    expect(
      evaluateImportClosure({
        edges: [allowed, prefixCollision],
        trustedPureDependencies: [
          {
            specifier: "date-fns/format",
            reason: "Formats caller-provided dates without ambient authority",
          },
        ],
      }).map(({ edge: importEdge }) => importEdge.specifier),
    ).toEqual(["date-fns/formatDistance"]);
  });
});
