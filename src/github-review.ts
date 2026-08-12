import type { EffectTSDiagnostic } from "./diagnostics.js";
import type { EnforcementProofSource, SuggestionApplicability } from "./registry.js";

export interface ChangedLineRange {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface ExistingEffxComment {
  readonly id: number;
  readonly fingerprint: string;
  readonly body: string;
}

export interface GitHubFinding {
  readonly fingerprint: string;
  readonly code: string;
  readonly rule: string;
  readonly family: string;
  readonly invariant: string;
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly explanation?: string;
  readonly help?: string;
  readonly docs: string;
  readonly proofSources: readonly EnforcementProofSource[];
  readonly applicability: SuggestionApplicability | "no-fix";
  readonly origin: EffectTSDiagnostic["origin"];
}

export type GitHubCommentOperation =
  | {
      readonly kind: "create";
      readonly fingerprint: string;
      readonly path: string;
      readonly line: number;
      readonly body: string;
    }
  | {
      readonly kind: "update";
      readonly id: number;
      readonly fingerprint: string;
      readonly path: string;
      readonly line: number;
      readonly body: string;
    }
  | { readonly kind: "resolve"; readonly id: number; readonly fingerprint: string };

export interface PlanGitHubReviewInput {
  readonly expectedHeadSha: string;
  readonly observedHeadSha: string;
  readonly diagnostics: readonly EffectTSDiagnostic[];
  readonly changedLines: readonly ChangedLineRange[];
  readonly existingComments?: readonly ExistingEffxComment[];
  readonly inlineLimit?: number;
}

export type GitHubReviewPlan =
  | {
      readonly accepted: false;
      readonly status: "rejected";
      readonly reason: "missing-head-sha" | "head-sha-mismatch" | "invalid-inline-limit";
    }
  | {
      readonly accepted: true;
      readonly status: "accepted";
      readonly headSha: string;
      readonly findings: readonly GitHubFinding[];
      readonly check: {
        readonly name: "effx";
        readonly annotations: readonly GitHubFinding[];
        readonly summaryOnly: readonly string[];
      };
      readonly commentOperations: readonly GitHubCommentOperation[];
    };

const normalizePath = (path: string): string => path.replaceAll("\\", "/").replace(/^\.\//, "");

const stableHash = (value: string): string => {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

const subjectIdentity = (subject: EffectTSDiagnostic["subject"]): string => {
  if (subject.kind === "rule") return subject.rule;
  if (subject.kind === "companion") return `companion:${subject.name}`;
  if (subject.kind === "module-graph") return `module-graph:${subject.invariant}`;
  return `audit:${subject.invariant}`;
};

const applicabilityOf = (diagnostic: EffectTSDiagnostic): GitHubFinding["applicability"] =>
  diagnostic.suggestions[0]?.applicability ?? "no-fix";

export function projectGitHubFindings(
  diagnostics: readonly EffectTSDiagnostic[],
): readonly GitHubFinding[] {
  const findings = diagnostics.map((diagnostic): GitHubFinding => {
    const path = normalizePath(diagnostic.primarySpan.file);
    const rule = subjectIdentity(diagnostic.subject);
    const anchor = [diagnostic.code, rule, path, diagnostic.invariant, diagnostic.message].join(
      "\u0000",
    );
    return {
      fingerprint: `effx-${stableHash(anchor)}`,
      code: diagnostic.code,
      rule,
      family: diagnostic.family,
      invariant: diagnostic.invariant,
      path,
      line: diagnostic.primarySpan.line,
      column: diagnostic.primarySpan.column,
      message: diagnostic.message,
      ...(diagnostic.explanation === undefined ? {} : { explanation: diagnostic.explanation }),
      ...(diagnostic.help === undefined ? {} : { help: diagnostic.help }),
      docs: diagnostic.docs,
      proofSources: diagnostic.proofSources,
      applicability: applicabilityOf(diagnostic),
      origin: diagnostic.origin,
    };
  });
  return findings.toSorted(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.line - right.line ||
      left.code.localeCompare(right.code),
  );
}

const bodyOf = (finding: GitHubFinding): string =>
  [
    `**${finding.code} — ${finding.message}**`,
    finding.explanation,
    finding.help === undefined ? undefined : `Help: ${finding.help}`,
    `Proof: ${finding.proofSources.join(", ")}`,
    `Applicability: ${finding.applicability}`,
    `<!-- effx:${finding.fingerprint} -->`,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n\n");

export function planGitHubReview(input: PlanGitHubReviewInput): GitHubReviewPlan {
  if (input.expectedHeadSha.length === 0 || input.observedHeadSha.length === 0)
    return { accepted: false, status: "rejected", reason: "missing-head-sha" };
  if (input.expectedHeadSha !== input.observedHeadSha)
    return { accepted: false, status: "rejected", reason: "head-sha-mismatch" };
  const inlineLimit = input.inlineLimit ?? 20;
  if (!Number.isSafeInteger(inlineLimit) || inlineLimit < 0)
    return { accepted: false, status: "rejected", reason: "invalid-inline-limit" };

  const findings = projectGitHubFindings(input.diagnostics);
  const changed = findings.filter((finding) =>
    input.changedLines.some(
      (range) =>
        normalizePath(range.path) === finding.path &&
        finding.line >= range.startLine &&
        finding.line <= range.endLine,
    ),
  );
  const inline = changed.slice(0, inlineLimit);
  const active = new Set(inline.map(({ fingerprint }) => fingerprint));
  const existing = new Map<string, ExistingEffxComment>();
  for (const comment of input.existingComments ?? []) {
    if (existing.has(comment.fingerprint))
      throw new Error(`Duplicate effx comment fingerprint: ${comment.fingerprint}`);
    existing.set(comment.fingerprint, comment);
  }
  const commentOperations: GitHubCommentOperation[] = inline.map((finding) => {
    const prior = existing.get(finding.fingerprint);
    const body = bodyOf(finding);
    return prior === undefined
      ? {
          kind: "create",
          fingerprint: finding.fingerprint,
          path: finding.path,
          line: finding.line,
          body,
        }
      : {
          kind: "update",
          id: prior.id,
          fingerprint: finding.fingerprint,
          path: finding.path,
          line: finding.line,
          body,
        };
  });
  for (const prior of existing.values()) {
    if (!active.has(prior.fingerprint))
      commentOperations.push({ kind: "resolve", id: prior.id, fingerprint: prior.fingerprint });
  }
  const inlineFingerprints = new Set(inline.map(({ fingerprint }) => fingerprint));
  return {
    accepted: true,
    status: "accepted",
    headSha: input.observedHeadSha,
    findings,
    check: {
      name: "effx",
      annotations: findings,
      summaryOnly: findings
        .filter(({ fingerprint }) => !inlineFingerprints.has(fingerprint))
        .map(({ fingerprint }) => fingerprint),
    },
    commentOperations,
  };
}
