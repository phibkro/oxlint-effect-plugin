import type {
  EffectTSCode,
  EnforcementProofSource,
  RuleFamily,
  RuleName,
  SuggestionApplicability,
} from "./registry.js";
import { RULE_INFO_BY_NAME } from "./registry.js";

export interface Span {
  readonly file: string;
  readonly offset: number;
  readonly length: number;
  readonly line: number;
  readonly column: number;
}

export interface TextEdit {
  readonly range: { readonly start: number; readonly end: number };
  readonly text: string;
}

export type EffectTSSuggestion =
  | {
      readonly message: string;
      readonly applicability: "machine-applicable";
      readonly edits: readonly TextEdit[];
    }
  | {
      readonly message: string;
      readonly applicability: Exclude<SuggestionApplicability, "machine-applicable">;
      readonly edits?: never;
    };

export type AuditInvariant =
  | "invalid-local-exception"
  | "stale-local-exception"
  | "invalid-file-opt-out"
  | "new-baseline-violation"
  | "stale-baseline-entry"
  | "broad-native-disable"
  | "plugin-native-disable";

export type DiagnosticSubject =
  | {
      readonly kind: "rule";
      readonly rule: `${string}/${RuleName}`;
      readonly ruleName: RuleName;
    }
  | { readonly kind: "companion"; readonly name: string }
  | { readonly kind: "module-graph"; readonly invariant: "import-closure" }
  | { readonly kind: "audit"; readonly invariant: AuditInvariant };

export interface EffectTSDiagnostic {
  readonly schemaVersion: 1;
  readonly code: EffectTSCode;
  readonly subject: DiagnosticSubject;
  readonly family: RuleFamily | "audit";
  readonly invariant: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly primarySpan: Span;
  readonly explanation?: string;
  readonly help?: string;
  readonly docs: string;
  readonly proofSources: readonly EnforcementProofSource[];
  readonly suggestions: readonly EffectTSSuggestion[];
  readonly origin: {
    readonly engine: "oxlint" | "typed-oxlint" | "tsgo" | "module-graph" | "audit";
    readonly code: string;
  };
}

export interface EffectTSJsonOutput {
  readonly schemaVersion: 1;
  readonly diagnostics: readonly EffectTSDiagnostic[];
}

export interface OxlintJsonSpan {
  readonly offset: number;
  readonly length: number;
  readonly line: number;
  readonly column: number;
}

export interface OxlintJsonDiagnostic {
  readonly message: string;
  readonly severity: "error" | "warning" | "warn" | 1 | 2;
  readonly code: string;
  readonly filename: string;
  readonly labels: readonly { readonly span: OxlintJsonSpan }[];
  /** Optional coordinator enrichment when the host exposes an atomic safe fix. */
  readonly fix?: readonly TextEdit[];
}

export interface OxlintJsonOutput {
  readonly diagnostics: readonly OxlintJsonDiagnostic[];
}

export interface TranslateOxlintOptions {
  readonly pluginName: string;
}

function ruleNameFromCode(code: string, pluginName: string): RuleName | null {
  const prefix = `${pluginName}(`;
  if (!code.startsWith(prefix) || !code.endsWith(")")) return null;
  const candidate = code.slice(prefix.length, -1) as RuleName;
  return RULE_INFO_BY_NAME[candidate] === undefined ? null : candidate;
}

function severityOf(severity: OxlintJsonDiagnostic["severity"]): "error" | "warning" {
  return severity === "error" || severity === 2 ? "error" : "warning";
}

function suggestionsOf(
  diagnostic: OxlintJsonDiagnostic,
  ruleName: RuleName,
): readonly EffectTSSuggestion[] {
  if (diagnostic.fix === undefined || diagnostic.fix.length === 0) return [];
  const replacement = RULE_INFO_BY_NAME[ruleName].replacements.find(
    ({ applicability }) => applicability === "machine-applicable",
  );
  if (replacement === undefined) return [];
  return [
    {
      message: `Replace ${replacement.from} with ${replacement.to}.`,
      applicability: "machine-applicable",
      edits: diagnostic.fix,
    },
  ];
}

/** Translate Oxlint JSON without importing Oxlint or a runtime-specific path API. */
export function translateOxlintJson(
  input: OxlintJsonOutput | string,
  options: TranslateOxlintOptions,
): EffectTSJsonOutput {
  const parsed = (typeof input === "string" ? JSON.parse(input) : input) as OxlintJsonOutput;
  const diagnostics: EffectTSDiagnostic[] = [];

  for (const native of parsed.diagnostics) {
    const ruleName = ruleNameFromCode(native.code, options.pluginName);
    const primary = native.labels[0]?.span;
    if (ruleName === null || primary === undefined) continue;
    const definition = RULE_INFO_BY_NAME[ruleName];
    diagnostics.push({
      schemaVersion: 1,
      code: definition.code,
      subject: {
        kind: "rule",
        rule: `${options.pluginName}/${ruleName}`,
        ruleName,
      },
      family: definition.family,
      invariant: definition.invariant,
      severity: severityOf(native.severity),
      message: definition.diagnostic.message,
      primarySpan: {
        file: native.filename,
        offset: primary.offset,
        length: primary.length,
        line: primary.line,
        column: primary.column,
      },
      explanation: definition.diagnostic.explanation,
      help: definition.diagnostic.help,
      docs: definition.diagnostic.docs,
      proofSources: definition.proofSources,
      suggestions: suggestionsOf(native, ruleName),
      origin: { engine: "oxlint", code: native.code },
    });
  }

  return { schemaVersion: 1, diagnostics };
}
