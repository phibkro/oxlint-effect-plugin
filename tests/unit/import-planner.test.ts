import { describe, expect, test } from "bun:test";

import type { ImportDeclaration, Literal } from "../../src/ast.js";
import { planImport } from "../../src/import-planner.js";

const request = { module: "effect", symbol: "Console", preferredLocal: "Console" } as const;

const sourceLiteral = (value: string): Literal => ({
  type: "Literal",
  value,
  loc: { start: { line: 1, column: 0 }, end: { line: 1, column: value.length } },
});

const declaration = (source: string, range: readonly [number, number]): ImportDeclaration => ({
  type: "ImportDeclaration",
  source: sourceLiteral(source),
  specifiers: [],
  range,
  loc: { start: { line: 1, column: range[0] }, end: { line: 1, column: range[1] } },
});

const importsFor = (source: string): readonly ImportDeclaration[] => {
  const imports: ImportDeclaration[] = [];
  const expression =
    /\bimport\b[\s\S]*?\bfrom\s*["'][^"']+["']\s*;?|\bimport\s*["'][^"']+["']\s*;?/gu;
  for (const match of source.matchAll(expression)) {
    const text = match[0];
    const module = /(?:from\s*)?["']([^"']+)["']/u.exec(text)?.[1];
    if (module !== undefined) {
      const start = match.index ?? 0;
      imports.push(declaration(module, [start, start + text.length]));
    }
  }
  return imports;
};

const apply = (
  source: string,
  edits: readonly { range: readonly [number, number]; text: string }[],
) => {
  let result = source;
  for (const edit of edits.toSorted((left, right) => right.range[0] - left.range[0])) {
    result = result.slice(0, edit.range[0]) + edit.text + result.slice(edit.range[1]);
  }
  return result;
};

const plan = (source: string, topLevelBindings: readonly string[] = []) =>
  planImport({
    sourceText: source,
    importDeclarations: importsFor(source),
    topLevelBindings,
    request,
  });

describe("planImport", () => {
  test("reuses an existing compatible named value import", () => {
    const source = 'import { Console } from "effect";\nconsole.log(1);\n';
    expect(plan(source)).toEqual({ local: "Console", edits: [] });
  });

  test("reuses an existing alias", () => {
    const source = 'import { Console as LogConsole } from "effect";\n';
    expect(plan(source)).toEqual({ local: "LogConsole", edits: [] });
  });

  test("merges a missing named value import", () => {
    const source = 'import { Effect } from "effect";\nEffect.gen(() => {});\n';
    const result = plan(source);
    expect(result?.local).toBe("Console");
    expect(apply(source, result?.edits ?? [])).toBe(
      'import { Effect, Console } from "effect";\nEffect.gen(() => {});\n',
    );
  });

  test("adds a missing value import at the import seam", () => {
    const source = 'import { Effect } from "effect/Effect";\n\nexport const run = 1;\n';
    const result = plan(source);
    expect(result?.local).toBe("Console");
    expect(apply(source, result?.edits ?? [])).toBe(
      'import { Effect } from "effect/Effect";\nimport { Console } from "effect";\n\nexport const run = 1;\n',
    );
  });
  test("chooses EffectConsole and numbered fallbacks for collisions", () => {
    const source = "const Console = 1;\nconst EffectConsole = 2;\n";
    expect(plan(source, ["Console"])?.local).toBe("EffectConsole");
    expect(plan(source, ["Console", "EffectConsole"])?.local).toBe("EffectConsole2");
  });

  test("preserves a type-only import and adds a value import", () => {
    const source = 'import type { Console } from "effect";\nexport type X = Console;\n';
    const result = plan(source);
    expect(result?.local).toBe("EffectConsole");
    expect(apply(source, result?.edits ?? [])).toBe(
      'import type { Console } from "effect";\nimport { Console as EffectConsole } from "effect";\nexport type X = Console;\n',
    );
  });

  test("does not duplicate a value import", () => {
    const source = 'import { Effect, Console } from "effect";\n';
    const result = plan(source);
    expect(result).toEqual({ local: "Console", edits: [] });
  });

  test("keeps shebang, directives, and leading comments before a new import", () => {
    const source = '#!/usr/bin/env bun\n"use strict";\n// header\nexport const x = 1;\n';
    const result = plan(source);
    expect(apply(source, result?.edits ?? [])).toBe(
      '#!/usr/bin/env bun\n"use strict";\n// header\nimport { Console } from "effect";\nexport const x = 1;\n',
    );
  });

  test("refuses namespace imports", () => {
    const source = 'import * as Effect from "effect";\n';
    expect(plan(source)).toBeNull();
  });

  test("refuses side-effect-only imports", () => {
    const source = 'import "effect";\n';
    expect(plan(source)).toBeNull();
  });

  test("refuses import attributes", () => {
    const source = 'import { Effect } from "effect" with { type: "json" };\n';
    expect(plan(source)).toBeNull();
  });

  test("refuses an unsafe declaration without a range", () => {
    const source = 'import { Effect } from "effect";\n';
    const invalid = declaration("effect", [0, source.length + 10]);
    expect(
      planImport({
        sourceText: source,
        importDeclarations: [invalid],
        topLevelBindings: [],
        request,
      }),
    ).toBeNull();
  });
});
