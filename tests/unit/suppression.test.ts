import { describe, expect, test } from "bun:test";

import type { EffectTSDiagnostic } from "../../src/diagnostics.js";

import {
  auditEffectTSEscapes,
  INVALID_FILE_OPTOUT_CODE,
  INVALID_LOCAL_EXCEPTION_CODE,
  STALE_LOCAL_EXCEPTION_CODE,
  matchSuppressedDiagnostics,
  type ByteRange,
  type RuleDiagnostic,
} from "../../src/suppression.js";

const RULE = "no-ambient-console";
const OTHER_RULE = "no-untyped-throw";

function localSource(rule = RULE, body = "console.log(value); "): string {
  return [
    `// oxlint-effect-plugin allow(${rule}):`,
    "// reason: intentional developer-only escape",
    body,
  ].join("\n");
}

function targetFor(
  source: string,
  directiveIndex = 0,
): {
  readonly directiveIndex: number;
  readonly nodeRange: ByteRange;
  readonly blockRange: ByteRange;
} {
  const nodeStart = source.lastIndexOf("console");
  return {
    directiveIndex,
    nodeRange: { start: nodeStart, end: source.length },
    blockRange: { start: 0, end: source.length },
  };
}

function diagnostic(rule: string, start: number, end: number): RuleDiagnostic {
  return { rule, range: { start, end } };
}

describe("auditEffectTSEscapes", () => {
  test("suppresses exact matching diagnostics, including multiple diagnostics in one node", () => {
    const source = localSource();
    const nodeStart = source.lastIndexOf("console");
    const nodeEnd = source.length;
    const result = auditEffectTSEscapes({
      sourceText: source,
      shippedRules: [RULE, OTHER_RULE],
      syntaxTargets: [targetFor(source)],
      diagnostics: [
        diagnostic(RULE, nodeStart, nodeStart + 7),
        diagnostic(RULE, nodeStart + 1, nodeStart + 13),
        diagnostic(OTHER_RULE, nodeStart, nodeStart + 7),
      ],
    });

    expect(result.findings).toEqual([]);
    expect(result.suppressedDiagnostics).toHaveLength(2);
    expect(result.remainingDiagnostics).toEqual([diagnostic(OTHER_RULE, nodeStart, nodeStart + 7)]);
    expect(result.localExceptions[0]?.targetRange).toEqual({ start: nodeStart, end: nodeEnd });
    expect(result.localExceptions[0]?.suppressedDiagnosticCount).toBe(2);
  });

  test("keeps a diagnostic outside the targeted node", () => {
    const source = localSource();
    const nodeStart = source.lastIndexOf("console");
    const targetEnd = nodeStart + "console.log(value)".length;
    const result = auditEffectTSEscapes({
      sourceText: source,
      syntaxTargets: [
        {
          ...targetFor(source),
          nodeRange: { start: nodeStart, end: targetEnd },
        },
      ],
      diagnostics: [
        diagnostic(RULE, nodeStart, nodeStart + 7),
        diagnostic(RULE, targetEnd + 1, targetEnd + 2),
      ],
    });

    expect(result.suppressedDiagnostics).toHaveLength(1);
    expect(result.remainingDiagnostics).toHaveLength(1);
    expect(result.findings).toEqual([]);
  });

  test("rejects broad, multi-rule, duplicate, missing-reason, misplaced, and lexical-block directives", () => {
    const duplicateBody = "console.log(value);";
    const source = [
      "// oxlint-effect-plugin allow(*):",
      "// reason: broad",
      "// oxlint-effect-plugin allow(no-ambient-console, no-untyped-throw):",
      "// reason: multi",
      "// oxlint-effect-plugin allow(no-ambient-console):",
      "// reason: duplicate one",
      "// oxlint-effect-plugin allow(no-ambient-console):",
      "// reason: duplicate two",
      duplicateBody,
      "// oxlint-effect-plugin allow(no-ambient-console):",
      duplicateBody,
      "// oxlint-effect-plugin allow(no-ambient-console): trailing",
      "// reason: misplaced",
    ].join("\n");
    const bodyRanges = [...source.matchAll(/console\.log\(value\);/g)].map((match) => {
      const start = match.index ?? 0;
      return { start, end: start + duplicateBody.length };
    });
    const result = auditEffectTSEscapes({
      sourceText: source,
      shippedRules: [RULE, OTHER_RULE],
      syntaxTargets: [
        {
          directiveIndex: 0,
          nodeRange: bodyRanges[0]!,
          blockRange: { start: 0, end: source.length },
        },
        {
          directiveIndex: 1,
          nodeRange: bodyRanges[0]!,
          blockRange: { start: 0, end: source.length },
        },
        {
          directiveIndex: 2,
          nodeRange: bodyRanges[0]!,
          blockRange: { start: 0, end: source.length },
        },
        {
          directiveIndex: 3,
          nodeRange: bodyRanges[0]!,
          blockRange: { start: 0, end: source.length },
        },
        {
          directiveIndex: 4,
          nodeRange: bodyRanges[1]!,
          blockRange: { start: 0, end: source.length },
          directiveBlockRange: { start: 0, end: 1 },
        },
        {
          directiveIndex: 5,
          nodeRange: bodyRanges[1]!,
          blockRange: { start: 0, end: source.length },
        },
      ],
      diagnostics: [diagnostic(RULE, bodyRanges[0]!.start, bodyRanges[0]!.end)],
    });

    expect(
      result.findings.filter((finding) => finding.code === INVALID_LOCAL_EXCEPTION_CODE),
    ).toHaveLength(5);
  });

  test("reports an exact directive with no matching diagnostic as unused/stale", () => {
    const source = localSource();
    const result = auditEffectTSEscapes({
      sourceText: source,
      file: "src/stale.ts",
      syntaxTargets: [targetFor(source)],
      diagnostics: [],
    });

    expect(result.findings.map((finding) => finding.code)).toEqual([STALE_LOCAL_EXCEPTION_CODE]);
    const remainingDiagnostic: EffectTSDiagnostic = result.findings[0]!;
    expect(remainingDiagnostic).toMatchObject({
      schemaVersion: 1,
      family: "audit",
      primarySpan: { file: "src/stale.ts" },
      origin: { engine: "audit", code: STALE_LOCAL_EXCEPTION_CODE },
    });
  });

  test("keeps lexical scope caller-owned and rejects a block mismatch", () => {
    const source = localSource();
    const nodeStart = source.lastIndexOf("console");
    const result = auditEffectTSEscapes({
      sourceText: source,
      syntaxTargets: [
        {
          directiveIndex: 0,
          nodeRange: { start: nodeStart, end: source.length },
          blockRange: { start: 10, end: source.length },
          directiveBlockRange: { start: 0, end: 9 },
        },
      ],
      diagnostics: [diagnostic(RULE, nodeStart, nodeStart + 7)],
    });

    expect(result.findings[0]?.code).toBe(INVALID_LOCAL_EXCEPTION_CODE);
    expect(result.localExceptions).toEqual([]);
  });

  test("inventories a valid file opt-out after a shebang", () => {
    const source = [
      "#!/usr/bin/env node",
      "// oxlint-effect-plugin ignore-file:",
      "// reason: generated vendor binding",
      'import generated from "vendor";',
    ].join("\n");
    const result = auditEffectTSEscapes({ sourceText: source });

    expect(result.findings).toEqual([]);
    expect(result.fileOptOuts).toHaveLength(1);
    expect(result.validFileOptOut?.reason).toBe("generated vendor binding");
  });

  test("removes all rule diagnostics for a valid file opt-out without stale local findings", () => {
    const source = [
      "// oxlint-effect-plugin ignore-file:",
      "// reason: generated vendor binding",
      `// oxlint-effect-plugin allow(${RULE}):`,
      "// reason: irrelevant inside an opted-out file",
      "console.log(value);",
    ].join("\n");
    const nodeStart = source.lastIndexOf("console");
    const escaped = diagnostic(OTHER_RULE, nodeStart, nodeStart + 7);
    const result = auditEffectTSEscapes({
      sourceText: source,
      file: "src/generated.ts",
      syntaxTargets: [targetFor(source)],
      diagnostics: [escaped],
    });

    expect(result.validFileOptOut?.reason).toBe("generated vendor binding");
    expect(result.findings).toEqual([]);
    expect(result.suppressedDiagnostics).toEqual([escaped]);
    expect(result.remainingDiagnostics).toEqual([]);
  });

  test("rejects late and missing-reason file opt-outs", () => {
    const lateSource = [
      'import generated from "vendor";',
      "// oxlint-effect-plugin ignore-file:",
      "// reason: too late",
    ].join("\n");
    const missingReasonSource = [
      "// oxlint-effect-plugin ignore-file:",
      "// reason:",
      'import generated from "vendor";',
    ].join("\n");

    expect(
      auditEffectTSEscapes({ sourceText: lateSource }).findings.map((finding) => finding.code),
    ).toEqual([INVALID_FILE_OPTOUT_CODE]);
    expect(
      auditEffectTSEscapes({ sourceText: missingReasonSource }).findings.map(
        (finding) => finding.code,
      ),
    ).toEqual([INVALID_FILE_OPTOUT_CODE]);
    expect(auditEffectTSEscapes({ sourceText: lateSource }).validFileOptOut).toBeNull();
  });

  test("uses the fixed package marker instead of a configured plugin alias", () => {
    const source = [
      "// architecture allow(no-ambient-console):",
      "// reason: not the fixed marker",
      "console.log(value);",
    ].join("\n");
    const result = auditEffectTSEscapes({
      sourceText: source,
      syntaxTargets: [targetFor(source)],
      diagnostics: [
        diagnostic(RULE, source.lastIndexOf("console"), source.lastIndexOf("console") + 7),
      ],
    });

    expect(result.localExceptions).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  test("matches diagnostics directly through the helper", () => {
    const source = localSource();
    const audited = auditEffectTSEscapes({
      sourceText: source,
      syntaxTargets: [targetFor(source)],
      diagnostics: [
        diagnostic(RULE, source.lastIndexOf("console"), source.lastIndexOf("console") + 7),
      ],
    });
    const match = matchSuppressedDiagnostics(
      [diagnostic(RULE, source.lastIndexOf("console"), source.lastIndexOf("console") + 7)],
      audited.localExceptions,
    );

    expect(match.suppressed).toHaveLength(1);
    expect(match.remaining).toEqual([]);
  });

  test("orders findings by source range, then stable code and reason", () => {
    const source = [
      "// oxlint-effect-plugin allow(*):",
      "// reason: broad",
      "// oxlint-effect-plugin ignore-file:",
      "// reason:",
    ].join("\n");
    const result = auditEffectTSEscapes({ sourceText: source });

    expect(result.findings.map((finding) => finding.code)).toEqual([
      INVALID_LOCAL_EXCEPTION_CODE,
      INVALID_FILE_OPTOUT_CODE,
    ]);
  });
});
