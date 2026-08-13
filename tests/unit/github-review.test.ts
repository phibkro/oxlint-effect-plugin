import { describe, expect, test } from "bun:test";

import type { EffectTSDiagnostic } from "../../src/diagnostics.js";
import { planGitHubReview, projectGitHubFindings } from "../../src/github-review.js";

const diagnostic = (line = 18): EffectTSDiagnostic => ({
  schemaVersion: 1,
  code: "EFT2101",
  subject: { kind: "rule", rule: "effect/no-ambient-console", ruleName: "no-ambient-console" },
  family: "observability",
  invariant: "effect-owned-observability",
  severity: "error",
  message: "Ambient console access is outside EffectTS.",
  primarySpan: { file: "src/load.ts", offset: 120, length: 18, line, column: 3 },
  explanation: "Observability belongs to Effect capabilities.",
  help: "Use Effect.log.",
  docs: "docs/rules/no-ambient-console.md",
  proofSources: ["syntax", "scope"],
  suggestions: [],
  origin: { engine: "oxlint", code: "effect(no-ambient-console)" },
});

const base = {
  expectedHeadSha: "abc123",
  observedHeadSha: "abc123",
  diagnostics: [diagnostic()],
  changedLines: [{ path: "src/load.ts", startLine: 18, endLine: 18 }],
} as const;

describe("effx GitHub review planning", () => {
  test("projects a changed-line finding into a Check and inline create", () => {
    const plan = planGitHubReview(base);
    expect(plan.accepted).toBe(true);
    if (!plan.accepted) return;
    expect(plan.findings[0]).toMatchObject({
      code: "EFT2101",
      rule: "effect/no-ambient-console",
      family: "observability",
      path: "src/load.ts",
      proofSources: ["syntax", "scope"],
      applicability: "no-fix",
    });
    expect(plan.check.annotations).toHaveLength(1);
    expect(plan.commentOperations).toEqual([
      expect.objectContaining({ kind: "create", fingerprint: plan.findings[0]?.fingerprint }),
    ]);
  });

  test("keeps outside-diff and overflow findings in the Check summary", () => {
    const outside = planGitHubReview({ ...base, changedLines: [] });
    expect(outside.accepted && outside.commentOperations).toEqual([]);
    expect(outside.accepted && outside.check.summaryOnly).toHaveLength(1);
    const overflow = planGitHubReview({ ...base, inlineLimit: 0 });
    expect(overflow.accepted && overflow.commentOperations).toEqual([]);
    expect(overflow.accepted && overflow.check.summaryOnly).toHaveLength(1);
  });

  test("fails closed before publication for stale or missing heads", () => {
    expect(planGitHubReview({ ...base, observedHeadSha: "stale" })).toEqual({
      accepted: false,
      status: "rejected",
      reason: "head-sha-mismatch",
    });
    expect(planGitHubReview({ ...base, expectedHeadSha: "" })).toEqual({
      accepted: false,
      status: "rejected",
      reason: "missing-head-sha",
    });
  });

  test("updates one matching comment and resolves it after the finding is fixed", () => {
    const first = planGitHubReview(base);
    if (!first.accepted) throw new Error("expected accepted plan");
    const fingerprint = first.findings[0]!.fingerprint;
    const existingComments = [{ id: 7, fingerprint, body: "old" }];
    const update = planGitHubReview({ ...base, existingComments });
    expect(update.accepted && update.commentOperations).toEqual([
      expect.objectContaining({ kind: "update", id: 7, fingerprint }),
    ]);
    const fixed = planGitHubReview({ ...base, diagnostics: [], existingComments });
    expect(fixed.accepted && fixed.commentOperations).toEqual([
      { kind: "resolve", id: 7, fingerprint },
    ]);
  });

  test("fingerprints and ordering are deterministic and line-move tolerant", () => {
    const moved = projectGitHubFindings([diagnostic(99)])[0];
    const original = projectGitHubFindings([diagnostic(18)])[0];
    expect(moved?.fingerprint).toBe(original?.fingerprint);
    expect(projectGitHubFindings([diagnostic(19), diagnostic(18)]).map(({ line }) => line)).toEqual(
      [18, 19],
    );
  });
});
