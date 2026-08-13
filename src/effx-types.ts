import type {
  EffectConfigInput,
  ImportClosurePolicy,
  OxlintConfigFragment,
} from "./config/expand.js";
import type { Boundary, Platform, Role } from "./domains.js";
import type { DiagnosticSubject } from "./diagnostics.js";
import type { EffectTSCode, RuleFamily, SuggestionApplicability } from "./registry.js";

export type ProofKind =
  | "syntax"
  | "scope"
  | "module-graph"
  | "generic-ts-types"
  | "effect-types"
  | "convention"
  | "unenforceable";

export interface SourceSnapshot {
  readonly uri: string;
  readonly path: string;
  readonly text: string;
  readonly sha256: string;
  readonly coordinatorVersion: 1;
}

export interface Utf16Range {
  readonly start: number;
  readonly end: number;
}

export interface EffxSuggestion {
  readonly applicability: SuggestionApplicability;
  readonly message: string;
  readonly edits?: readonly {
    readonly uri: string;
    readonly range: Utf16Range;
    readonly replacement: string;
  }[];
}

interface EffxDiagnosticBase {
  readonly schemaVersion: 2;
  readonly provider: string;
  readonly source: {
    readonly uri: string;
    readonly version: number;
    readonly versionAuthority: "coordinator" | "client";
    readonly sha256: string;
  };
  readonly range: Utf16Range;
  readonly severity: "error" | "warning" | "message" | "suggestion";
  readonly message: string;
  readonly explanation?: string;
  readonly help?: string;
  readonly docs?: string;
  readonly proofKinds: readonly ProofKind[];
  readonly suggestions: readonly EffxSuggestion[];
  readonly origin: { readonly engine: string; readonly code: string };
}

export interface GovernedEffxDiagnostic extends EffxDiagnosticBase {
  readonly governed: true;
  readonly code: EffectTSCode;
  readonly subject: DiagnosticSubject;
  readonly family: RuleFamily | "audit";
  readonly invariant: string;
}

export interface ExternalEffxDiagnostic extends EffxDiagnosticBase {
  readonly governed: false;
  readonly code: string;
  readonly subject: { readonly kind: "external"; readonly system: "typescript" | "provider" };
  readonly family: "external";
}

export type EffxDiagnostic = GovernedEffxDiagnostic | ExternalEffxDiagnostic;

export interface EffxJsonOutput {
  readonly schemaVersion: 2;
  readonly status: 0 | 1 | 2;
  readonly diagnostics: readonly EffxDiagnostic[];
  readonly failure?: { readonly code: string; readonly message: string };
}

export interface EffxConfig {
  readonly effect: EffectConfigInput;
  readonly oxlintConfig?: string;
  readonly tsconfig?: string;
}

export interface ProjectGroup {
  readonly index: number;
  readonly files: readonly string[];
  readonly role: Role;
  readonly platform: Platform;
  readonly boundaries: readonly Boundary[];
  readonly adapterDependencies: readonly string[];
}

export interface EffxProject {
  readonly root: string;
  readonly configPath: string;
  readonly config: EffxConfig;
  readonly effectFragment: OxlintConfigFragment;
  readonly importPolicy: ImportClosurePolicy;
  readonly groups: readonly ProjectGroup[];
  readonly snapshots: readonly SourceSnapshot[];
  readonly oxlintConfigPath: string;
  readonly tsconfigPath: string;
}

export class EffxFailure extends Error {
  readonly tag = "EffxFailure";
  readonly status = 2 as const;
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "EffxFailure";
  }
}

export const snapshotSource = (snapshot: SourceSnapshot) => ({
  uri: snapshot.uri,
  version: snapshot.coordinatorVersion,
  versionAuthority: "coordinator" as const,
  sha256: snapshot.sha256,
});
