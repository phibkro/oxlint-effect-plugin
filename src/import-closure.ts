/**
 * Pure module-policy gate for the coordinator's resolved static import graph.
 *
 * This module deliberately does not resolve specifiers or inspect packages. The
 * coordinator supplies the target classification, importer domain, and import
 * kind; the gate only applies the configured EffectTS closure policy.
 */

import type { Platform, Role } from "./domains.js";
import type { TrustedDependency } from "./config/expand.js";
import { IMPORT_CLOSURE_DEFINITION } from "./registry.js";

export type ImportKind = "value" | "type" | "side-effect";

export interface ImporterContext {
  /** Resolved importer path used for diagnostic identity and ordering. */
  readonly file: string;
  readonly role: Role;
  /** Declared runtime platform, when the group has one. */
  readonly platform?: Platform;
  /** Raw package roots this group-level runtime adapter owns. */
  readonly adapterDependencies?: readonly string[];
}

export interface EffectImportTarget {
  readonly kind: "effect";
  /** Present for an official Effect platform package; absent for core Effect. */
  readonly platform?: Platform;
}

export interface GovernedProjectImportTarget {
  readonly kind: "project";
  readonly role: Role;
}

export interface PackageImportTarget {
  readonly kind: "package";
}

export interface UnknownImportTarget {
  readonly kind: "unknown";
}

/** Classification resolved by the coordinator, not guessed from a name. */
export type ImportTarget =
  | EffectImportTarget
  | GovernedProjectImportTarget
  | PackageImportTarget
  | UnknownImportTarget;

export interface ImportEdge {
  readonly importer: ImporterContext;
  readonly target: ImportTarget;
  /** The resolved static module specifier, retained as edge identity. */
  readonly specifier: string;
  readonly kind: ImportKind;
  /** Source location of the static import edge. */
  readonly span: {
    readonly offset: number;
    readonly length: number;
    readonly line: number;
    readonly column: number;
  };
}

export type TrustedPureDependency = TrustedDependency;
export interface ImportClosureInput {
  readonly edges: readonly ImportEdge[];
  readonly trustedPureDependencies?: readonly TrustedPureDependency[];
}

export interface ImportClosureViolation {
  readonly schemaVersion: 1;
  readonly code: "EFT5101";
  readonly subject: {
    readonly kind: "module-graph";
    readonly invariant: "import-closure";
  };
  readonly family: "architecture";
  readonly invariant: "effectts-import-closure";
  readonly severity: "error";
  readonly edge: ImportEdge;
  /** Stable human-readable identity; ordering does not depend on input order. */
  readonly edgeIdentity: string;
  readonly rationale: string;
  readonly message: string;
  readonly primarySpan: {
    readonly file: string;
    readonly offset: number;
    readonly length: number;
    readonly line: number;
    readonly column: number;
  };
  readonly explanation: string;
  readonly help: string;
  readonly docs: string;
  readonly proofSources: readonly ["module-graph"];
  readonly suggestions: readonly [];
  readonly origin: {
    readonly engine: "module-graph";
    readonly code: "EFT5101";
  };
}

const ROLE_GRAPH: Readonly<Record<Role, readonly Role[]>> = {
  "pure-library": ["pure-library"],
  "effect-library": ["pure-library", "effect-library"],
  service: ["pure-library", "effect-library", "service"],
  application: ["pure-library", "effect-library", "service", "application"],
  "composition-root": [
    "pure-library",
    "effect-library",
    "service",
    "application",
    "runtime-adapter",
  ],
  "runtime-adapter": ["pure-library", "effect-library", "service", "runtime-adapter"],
  test: [
    "pure-library",
    "effect-library",
    "service",
    "application",
    "composition-root",
    "runtime-adapter",
    "test",
  ],
};

const BASE_RATIONALE = IMPORT_CLOSURE_DEFINITION.rationale;
const BASE_MESSAGE = IMPORT_CLOSURE_DEFINITION.diagnostic.message;
const BASE_EXPLANATION = IMPORT_CLOSURE_DEFINITION.diagnostic.explanation;
const BASE_HELP = IMPORT_CLOSURE_DEFINITION.diagnostic.help;

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function targetIdentity(target: ImportTarget): string {
  switch (target.kind) {
    case "effect":
      return target.platform === undefined ? "effect" : `effect:${target.platform}`;
    case "project":
      return `project:${target.role}`;
    case "package":
      return "package";
    case "unknown":
      return "unknown";
  }
}

function edgeIdentity(edge: ImportEdge): string {
  return [
    edge.importer.file,
    edge.importer.role,
    edge.importer.platform ?? "",
    edge.specifier,
    edge.kind,
    targetIdentity(edge.target),
  ].join(" -> ");
}

function compareEdges(left: ImportEdge, right: ImportEdge): number {
  const leftIdentity = edgeIdentity(left);
  const rightIdentity = edgeIdentity(right);
  return compareStrings(leftIdentity, rightIdentity);
}

function packageRootMatches(root: string, specifier: string): boolean {
  return specifier === root || specifier.startsWith(`${root}/`);
}

function hasDeclaredAdapterDependency(edge: ImportEdge): boolean {
  if (edge.importer.role !== "runtime-adapter") return false;
  return (edge.importer.adapterDependencies ?? []).some((dependency) =>
    packageRootMatches(dependency, edge.specifier),
  );
}

function hasTrustedPureDependency(
  specifier: string,
  dependencies: readonly TrustedPureDependency[],
): boolean {
  return dependencies.some((dependency) => dependency.specifier === specifier);
}

function projectRoleAllowed(importerRole: Role, targetRole: Role): boolean {
  return ROLE_GRAPH[importerRole].includes(targetRole);
}

function platformTargetAllowed(edge: ImportEdge, target: EffectImportTarget): boolean {
  if (target.platform === undefined) return true;
  return (
    (edge.importer.role === "composition-root" || edge.importer.role === "runtime-adapter") &&
    edge.importer.platform === target.platform
  );
}

function rejectReason(
  edge: ImportEdge,
  trustedPureDependencies: readonly TrustedPureDependency[],
): string {
  switch (edge.target.kind) {
    case "effect":
      if (edge.target.platform !== undefined) {
        return `The Effect platform target requires a composition-root or runtime-adapter importer on the matching ${edge.target.platform} platform.`;
      }
      return "The Effect target is outside the importer's admitted platform or role policy.";
    case "project":
      return `The ${edge.importer.role} role cannot import a governed ${edge.target.role} module.`;
    case "package":
      if (edge.kind === "side-effect") {
        return "Side-effect-only package imports require a declared runtime-adapter dependency.";
      }
      if (hasTrustedPureDependency(edge.specifier, trustedPureDependencies)) {
        return "The trusted-pure dependency is only valid for value imports; side-effect imports need an adapter allowance.";
      }
      if (edge.importer.role === "runtime-adapter") {
        return `The runtime adapter does not declare package ${JSON.stringify(edge.specifier)} in adapterDependencies.`;
      }
      return `Raw package ${JSON.stringify(edge.specifier)} is not admitted for the ${edge.importer.role} role.`;
    case "unknown":
      return `The coordinator classified ${JSON.stringify(edge.specifier)} as an unknown target; value and side-effect edges must be governed explicitly.`;
  }
}

function makeViolation(
  edge: ImportEdge,
  trustedPureDependencies: readonly TrustedPureDependency[],
): ImportClosureViolation {
  const identity = edgeIdentity(edge);
  return {
    schemaVersion: 1,
    code: "EFT5101",
    subject: { kind: "module-graph", invariant: "import-closure" },
    family: "architecture",
    invariant: IMPORT_CLOSURE_DEFINITION.invariant,
    severity: "error",
    edge,
    edgeIdentity: identity,
    rationale: `${BASE_RATIONALE} ${rejectReason(edge, trustedPureDependencies)}`,
    message: BASE_MESSAGE,
    primarySpan: { file: edge.importer.file, ...edge.span },
    explanation: BASE_EXPLANATION,
    help: BASE_HELP,
    docs: IMPORT_CLOSURE_DEFINITION.diagnostic.docs,
    proofSources: ["module-graph"],
    suggestions: [],
    origin: { engine: "module-graph", code: "EFT5101" },
  };
}

function assertTrustedPureDependencies(dependencies: readonly TrustedPureDependency[]): void {
  for (const dependency of dependencies) {
    if (dependency.specifier.trim().length === 0) {
      throw new Error("oxlint-effect-plugin: trusted-pure dependency specifier must be nonempty");
    }
    if (dependency.reason.trim().length === 0) {
      throw new Error(
        `oxlint-effect-plugin: trusted-pure dependency ${JSON.stringify(dependency.specifier)} requires a nonempty reason`,
      );
    }
  }
}

function edgeAdmitted(
  edge: ImportEdge,
  trustedPureDependencies: readonly TrustedPureDependency[],
): boolean {
  // Type-only imports do not create runtime module dependencies.
  if (edge.kind === "type") return true;

  switch (edge.target.kind) {
    case "effect":
      return platformTargetAllowed(edge, edge.target);
    case "project":
      return projectRoleAllowed(edge.importer.role, edge.target.role);
    case "package":
      if (hasDeclaredAdapterDependency(edge)) return true;
      if (edge.kind === "side-effect") return false;
      return hasTrustedPureDependency(edge.specifier, trustedPureDependencies);
    case "unknown":
      return false;
  }
}

/**
 * Evaluate resolved static import edges against the configured EffectTS module
 * closure. The returned diagnostics are sorted by stable edge identity.
 */
export function evaluateImportClosure(
  input: ImportClosureInput,
): readonly ImportClosureViolation[] {
  const trustedPureDependencies = input.trustedPureDependencies ?? [];
  assertTrustedPureDependencies(trustedPureDependencies);

  return input.edges
    .filter((edge) => !edgeAdmitted(edge, trustedPureDependencies))
    .toSorted(compareEdges)
    .map((edge) => makeViolation(edge, trustedPureDependencies));
}
