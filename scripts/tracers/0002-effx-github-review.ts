import type { EffectTSDiagnostic } from "../../src/diagnostics.js";
import { planGitHubReview } from "../../src/github-review.js";

const finding: EffectTSDiagnostic = {
  schemaVersion: 1,
  code: "EFT2101",
  subject: { kind: "rule", rule: "effect/no-ambient-console", ruleName: "no-ambient-console" },
  family: "observability",
  invariant: "effect-owned-observability",
  severity: "error",
  message: "Ambient console access is outside EffectTS.",
  primarySpan: { file: "src/load.ts", offset: 120, length: 18, line: 18, column: 3 },
  explanation: "Observability must remain inside Effect capabilities.",
  help: "Use Effect.log or effect/Console.",
  docs: "docs/rules/no-ambient-console.md",
  proofSources: ["syntax", "scope"],
  suggestions: [],
  origin: { engine: "oxlint", code: "effect(no-ambient-console)" },
};

const outside: EffectTSDiagnostic = {
  ...finding,
  code: "EFT3101",
  subject: {
    kind: "rule",
    rule: "effect/no-native-promise-control-flow",
    ruleName: "no-native-promise-control-flow",
  },
  family: "computation",
  invariant: "effect-owned-asynchronous-computation",
  message: "Native async control flow is outside EffectTS.",
  primarySpan: { ...finding.primarySpan, line: 40 },
};
const base = {
  expectedHeadSha: "1111111111111111111111111111111111111111",
  observedHeadSha: "1111111111111111111111111111111111111111",
  changedLines: [{ path: "src/load.ts", startLine: 18, endLine: 20 }],
} as const;
const first = planGitHubReview({ ...base, diagnostics: [finding, outside], inlineLimit: 1 });
if (!first.accepted) throw new Error("first GitHub plan was rejected");
const fingerprint = first.findings.find(({ line }) => line === 18)?.fingerprint;
if (fingerprint === undefined) throw new Error("changed-line finding has no fingerprint");
const existingComments = [{ id: 42, fingerprint, body: "prior body" }];
const second = planGitHubReview({ ...base, diagnostics: [finding], existingComments });
const fixed = planGitHubReview({ ...base, diagnostics: [], existingComments });
const stale = planGitHubReview({
  ...base,
  observedHeadSha: "2222222222222222222222222222222222222222",
  diagnostics: [finding],
});

const output = {
  schemaVersion: 1,
  status: "tracked",
  outcome: "worked",
  exactHead: first.headSha,
  finding: first.findings[0],
  first: {
    annotations: first.check.annotations.length,
    summaryOnly: first.check.summaryOnly.length,
    operations: first.commentOperations.map(({ kind }) => kind),
  },
  second: second.accepted ? second.commentOperations.map(({ kind }) => kind) : ["rejected"],
  fixed: fixed.accepted ? fixed.commentOperations.map(({ kind }) => kind) : ["rejected"],
  stale,
  evidence: [
    "changed-line finding produced one inline create",
    "outside-diff finding remained in the canonical Check summary",
    "second revision updated the existing fingerprint without duplication",
    "fixed revision resolved the existing comment",
    "mismatched immutable head was rejected before publication",
  ],
};

console.log(JSON.stringify(output, null, process.argv.includes("--compact") ? 0 : 2));
