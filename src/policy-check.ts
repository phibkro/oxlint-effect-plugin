import type { DiagnosticSubject } from "./diagnostics.js";
import type {
  EffxDiagnostic,
  EffxProject,
  GovernedEffxDiagnostic,
  SourceSnapshot,
} from "./effx-types.js";
import { snapshotSource } from "./effx-types.js";
import { evaluateImportClosure, type ImportClosureViolation } from "./import-closure.js";
import { analyzeSource } from "./source-analysis.js";
import { auditEffectTSEscapes, type EscapeFinding } from "./suppression.js";
import { auditNativeDisableDirectives } from "./suppression-audit.js";

const lineRange = (snapshot: SourceSnapshot, line: number): { start: number; end: number } => {
  let start = 0;
  for (let current = 1; current < line; current += 1) {
    const next = snapshot.text.indexOf("\n", start);
    if (next < 0) return { start: snapshot.text.length, end: snapshot.text.length };
    start = next + 1;
  }
  const end = snapshot.text.indexOf("\n", start);
  return { start, end: end < 0 ? snapshot.text.length : end };
};

const nativeFindings = (
  project: EffxProject,
  snapshot: SourceSnapshot,
): readonly GovernedEffxDiagnostic[] => {
  const pluginName = project.config.effect.pluginName ?? "effect";
  return auditNativeDisableDirectives(snapshot.text, { pluginNames: [pluginName] }).map(
    (finding) => ({
      schemaVersion: 2,
      provider: "effx-audit",
      source: snapshotSource(snapshot),
      range: lineRange(snapshot, finding.line),
      severity: "error",
      message:
        finding.reason === "broad-native-disable"
          ? "Broad native linter disable bypasses EffectTS escape auditing."
          : `Native disable for ${finding.targets.join(", ")} bypasses EffectTS escape auditing.`,
      explanation:
        "EffectTS accepts only its reasoned two-line escape protocol; native linter disables bypass stale and unused escape checks.",
      help: "Replace this directive with an exact `effect allow(rule)` directive and a nonempty reason.",
      docs: "docs/suppression-audit.md",
      proofKinds: ["syntax"],
      suggestions: [],
      origin: { engine: "audit", code: finding.code },
      governed: true,
      code: finding.code,
      subject: { kind: "audit", invariant: finding.reason },
      family: "audit",
      invariant: finding.reason,
    }),
  );
};

const escapeFinding = (
  snapshot: SourceSnapshot,
  finding: EscapeFinding,
): GovernedEffxDiagnostic => ({
  schemaVersion: 2,
  provider: "effx-audit",
  source: snapshotSource(snapshot),
  range: finding.range,
  severity: finding.severity,
  message: finding.message,
  explanation: finding.explanation,
  help: finding.help,
  docs: finding.docs,
  proofKinds: finding.proofSources,
  suggestions: [],
  origin: finding.origin,
  governed: true,
  code: finding.code,
  subject: finding.subject,
  family: finding.family,
  invariant: finding.invariant,
});

const moduleFinding = (
  project: EffxProject,
  violation: ImportClosureViolation,
): GovernedEffxDiagnostic => {
  const snapshot = project.snapshots.find(({ path }) =>
    path.endsWith(violation.edge.importer.file),
  );
  if (snapshot === undefined)
    throw new Error(
      `effx: import violation has no source snapshot: ${violation.edge.importer.file}`,
    );
  return {
    schemaVersion: 2,
    provider: "effx-module-graph",
    source: snapshotSource(snapshot),
    range: {
      start: violation.edge.span.offset,
      end: violation.edge.span.offset + violation.edge.span.length,
    },
    severity: violation.severity,
    message: violation.message,
    explanation: violation.explanation,
    help: violation.help,
    docs: violation.docs,
    proofKinds: violation.proofSources,
    suggestions: [],
    origin: violation.origin,
    governed: true,
    code: violation.code,
    subject: violation.subject as DiagnosticSubject,
    family: violation.family,
    invariant: violation.invariant,
  };
};

const compare = (left: EffxDiagnostic, right: EffxDiagnostic): number =>
  left.source.uri.localeCompare(right.source.uri) ||
  left.range.start - right.range.start ||
  left.range.end - right.range.end ||
  left.severity.localeCompare(right.severity) ||
  left.code.localeCompare(right.code) ||
  left.provider.localeCompare(right.provider);

export function applyCheckPolicy(
  project: EffxProject,
  providerDiagnostics: readonly EffxDiagnostic[],
): readonly EffxDiagnostic[] {
  const analyses = project.snapshots.map((snapshot) => ({
    snapshot,
    analysis: analyzeSource(project, snapshot, providerDiagnostics),
  }));
  const suppressed = new Set<EffxDiagnostic>();
  const policyDiagnostics: EffxDiagnostic[] = [];
  const optedOut = new Set<string>();
  for (const { snapshot, analysis } of analyses) {
    policyDiagnostics.push(...nativeFindings(project, snapshot));
    const audited = auditEffectTSEscapes({
      sourceText: snapshot.text,
      file: snapshot.path,
      syntaxTargets: analysis.syntaxTargets,
      diagnostics: analysis.ruleDiagnostics,
    });
    policyDiagnostics.push(...audited.findings.map((finding) => escapeFinding(snapshot, finding)));
    for (const suppressedDiagnostic of audited.suppressedDiagnostics) {
      if (
        "diagnostic" in suppressedDiagnostic &&
        typeof suppressedDiagnostic.diagnostic === "object" &&
        suppressedDiagnostic.diagnostic !== null
      )
        suppressed.add(suppressedDiagnostic.diagnostic as EffxDiagnostic);
    }
    if (audited.validFileOptOut !== null) optedOut.add(snapshot.uri);
  }
  const activeEdges = analyses
    .filter(({ snapshot }) => !optedOut.has(snapshot.uri))
    .flatMap(({ analysis }) => analysis.importEdges);
  policyDiagnostics.push(
    ...evaluateImportClosure({
      edges: activeEdges,
      trustedPureDependencies: project.importPolicy.trustedPureDependencies,
    }).map((violation) => moduleFinding(project, violation)),
  );
  const diagnostics = [
    ...providerDiagnostics.filter(
      (diagnostic) =>
        !suppressed.has(diagnostic) &&
        (!diagnostic.governed || !optedOut.has(diagnostic.source.uri)),
    ),
    ...policyDiagnostics,
  ];
  const seen = new Set<string>();
  return diagnostics.toSorted(compare).filter((diagnostic) => {
    const key = `${diagnostic.source.uri}:${diagnostic.range.start}:${diagnostic.range.end}:${diagnostic.code}:${diagnostic.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
