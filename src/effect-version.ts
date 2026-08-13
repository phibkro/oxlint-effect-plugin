/**
 * Pure package-manifest classification for the reviewed Effect release.
 *
 * Runtime adapters decode package manifests and workspace observations before
 * calling this module. It performs no filesystem, process, package-manager, or
 * network work, and it never edits source files.
 */

export const REVIEWED_EFFECT_VERSION = "4.0.0-rc.108" as const;

export type EffectRepositoryClassification =
  | "supported-effect-v4"
  | "mechanically-migratable"
  | "agent-migration-opt-in-required"
  | "not-applicable";

export type DependencySection =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies"
  | "optionalDependencies";

export interface PackageManifestObservation {
  readonly name?: string;
  readonly path?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  /** Decoded package manifests belonging to this workspace root. */
  readonly workspacePackages?: readonly PackageManifestObservation[];
}

export interface EffectRepositoryObservation {
  readonly manifests?: readonly PackageManifestObservation[];
  readonly packageManifests?: readonly PackageManifestObservation[];
  readonly workspacePackages?: readonly PackageManifestObservation[];
}

export interface ClassifyEffectRepositoryInput {
  readonly repository?: EffectRepositoryObservation;
  readonly manifests?: readonly PackageManifestObservation[];
  readonly packageManifests?: readonly PackageManifestObservation[];
  readonly workspacePackages?: readonly PackageManifestObservation[];
  readonly reviewedEffectVersion?: string;
  /** Explicit targets for known @effect/* packages. Never inferred. */
  readonly supportedPackageVersions?: Readonly<Record<string, string>>;
}

export interface EffectMigrationReminder {
  readonly kind: "effect-migration-reminder";
  readonly classification: Exclude<
    EffectRepositoryClassification,
    "supported-effect-v4" | "not-applicable"
  >;
  readonly reviewedEffectVersion: string;
  readonly title: string;
  readonly message: string;
  readonly action: "review-and-opt-in" | "apply-mechanical-migration";
}

export interface EffectMigrationGuide {
  readonly kind: "supplementary-effect-migration-guide";
  readonly reviewedEffectVersion: string;
  readonly title: string;
  readonly steps: readonly string[];
  readonly limitations: readonly string[];
}

export interface ManifestEdit {
  readonly manifestPath: string;
  readonly section: DependencySection;
  readonly packageName: string;
  readonly from: string;
  readonly to: string;
}

export interface MechanicalEffectMigrationInput extends ClassifyEffectRepositoryInput {}

export interface MechanicalEffectMigrationPlan {
  readonly available: boolean;
  readonly reviewedEffectVersion: string;
  readonly edits: readonly ManifestEdit[];
  readonly reasons: readonly string[];
}

export interface EffectRepositoryClassificationResult {
  readonly classification: EffectRepositoryClassification;
  readonly reviewedEffectVersion: string;
  readonly manifests: readonly PackageManifestObservation[];
  readonly reasons: readonly string[];
  readonly mechanicalMigrationAvailable: boolean;
  readonly reminder?: EffectMigrationReminder;
  readonly supplementaryGuide?: EffectMigrationGuide;
}

const DEPENDENCY_SECTIONS: readonly DependencySection[] = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

const EFFECT_PACKAGE = "effect";
const isEffectFamilyPackage = (name: string): boolean =>
  name === EFFECT_PACKAGE || name.startsWith("@effect/");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Strictly recognizes one npm semver, not a range, protocol, or alias. */
const isExactSemver = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
    value,
  );

const manifestSortKey = (manifest: PackageManifestObservation): string =>
  `${manifest.path ?? ""}\u0000${manifest.name ?? ""}\u0000${stableManifestContent(manifest)}`;

const stableManifestContent = (manifest: PackageManifestObservation): string => {
  const sections = DEPENDENCY_SECTIONS.map((section) => {
    const value = manifest[section];
    if (!isRecord(value)) return `${section}:`;
    return `${section}:${Object.keys(value)
      .toSorted()
      .map((name) => `${name}=${String(value[name])}`)
      .join(",")}`;
  });
  return sections.join("|");
};

function flattenManifest(
  manifest: PackageManifestObservation,
  output: PackageManifestObservation[],
  seen: Set<string>,
): void {
  const key = manifestSortKey(manifest);
  if (!seen.has(key)) {
    seen.add(key);
    output.push(manifest);
  }
  for (const workspace of manifest.workspacePackages ?? []) {
    flattenManifest(workspace, output, seen);
  }
}

function collectManifests(
  input: ClassifyEffectRepositoryInput,
): readonly PackageManifestObservation[] {
  const output: PackageManifestObservation[] = [];
  const seen = new Set<string>();
  const repository = input.repository;
  const roots = [
    ...(repository?.manifests ?? []),
    ...(repository?.packageManifests ?? []),
    ...(repository?.workspacePackages ?? []),
    ...(input.manifests ?? []),
    ...(input.packageManifests ?? []),
    ...(input.workspacePackages ?? []),
  ];
  for (const manifest of roots) flattenManifest(manifest, output, seen);
  return output.toSorted((left, right) =>
    manifestSortKey(left).localeCompare(manifestSortKey(right)),
  );
}

interface Declaration {
  readonly packageName: string;
  readonly section: DependencySection;
  readonly value: unknown;
  readonly manifest: PackageManifestObservation;
}

function declarationsOf(manifests: readonly PackageManifestObservation[]): readonly Declaration[] {
  const declarations: Declaration[] = [];
  for (const manifest of manifests) {
    for (const section of DEPENDENCY_SECTIONS) {
      const values = manifest[section];
      if (!isRecord(values)) continue;
      for (const packageName of Object.keys(values).filter(isEffectFamilyPackage).toSorted()) {
        declarations.push({
          packageName,
          section,
          value: values[packageName],
          manifest,
        });
      }
    }
  }
  return declarations.toSorted((left, right) => {
    const leftKey = `${left.packageName}\u0000${left.manifest.path ?? left.manifest.name ?? ""}\u0000${left.section}`;
    const rightKey = `${right.packageName}\u0000${right.manifest.path ?? right.manifest.name ?? ""}\u0000${right.section}`;
    return leftKey.localeCompare(rightKey);
  });
}

interface Analysis {
  readonly reviewedEffectVersion: string;
  readonly manifests: readonly PackageManifestObservation[];
  readonly declarations: readonly Declaration[];
  readonly versions: ReadonlyMap<string, readonly string[]>;
  readonly reasons: readonly string[];
  readonly hasDeclarations: boolean;
  readonly allExactAndUnconflicted: boolean;
  readonly targetsAvailable: boolean;
  readonly unsupported: boolean;
}

function analyze(input: ClassifyEffectRepositoryInput): Analysis {
  const reviewedEffectVersion = input.reviewedEffectVersion ?? REVIEWED_EFFECT_VERSION;
  const manifests = collectManifests(input);
  const declarations = declarationsOf(manifests);
  const grouped = new Map<string, Declaration[]>();
  for (const declaration of declarations) {
    const existing = grouped.get(declaration.packageName);
    if (existing === undefined) grouped.set(declaration.packageName, [declaration]);
    else existing.push(declaration);
  }

  const versions = new Map<string, readonly string[]>();
  const reasons: string[] = [];
  let allExactAndUnconflicted = true;
  for (const [packageName, packageDeclarations] of grouped) {
    const uniqueValues = packageDeclarations
      .map(({ value }) => value)
      .filter((value): value is string => typeof value === "string")
      .toSorted()
      .filter((value, index, values) => index === 0 || value !== values[index - 1]);
    versions.set(packageName, uniqueValues);
    if (packageDeclarations.some(({ value }) => !isExactSemver(value))) {
      allExactAndUnconflicted = false;
      reasons.push(
        `${packageName} has a range, workspace protocol, alias, or invalid version declaration.`,
      );
    }
    if (uniqueValues.length > 1 || uniqueValues.length === 0) {
      allExactAndUnconflicted = false;
      reasons.push(`${packageName} has conflicting dependency declarations.`);
    }
  }

  const unsupported = declarations.some(({ value }) => value !== reviewedEffectVersion);
  let targetsAvailable = true;
  const supportedPackageVersions = input.supportedPackageVersions ?? {};
  for (const packageName of grouped.keys()) {
    if (packageName === EFFECT_PACKAGE) continue;
    const target = supportedPackageVersions[packageName];
    if (target === undefined) {
      targetsAvailable = false;
      reasons.push(
        `${packageName} has no explicitly supplied supported target; no version is guessed.`,
      );
    } else if (!isExactSemver(target)) {
      targetsAvailable = false;
      reasons.push(`${packageName} has an invalid supported target; no version is guessed.`);
    }
  }

  return {
    reviewedEffectVersion,
    manifests,
    declarations,
    versions,
    reasons: reasons
      .toSorted()
      .filter((reason, index, values) => index === 0 || reason !== values[index - 1]),
    hasDeclarations: declarations.length > 0,
    allExactAndUnconflicted,
    targetsAvailable,
    unsupported,
  };
}

function guideFor(reviewedEffectVersion: string): EffectMigrationGuide {
  return {
    kind: "supplementary-effect-migration-guide",
    reviewedEffectVersion,
    title: `Supplementary guide for migrating to Effect ${reviewedEffectVersion}`,
    steps: [
      `Review every declared Effect-family dependency against ${reviewedEffectVersion}.`,
      "Update dependency declarations only with explicit reviewed targets.",
      "Run the target repository's package-manager, type, lint, and test verification.",
      "Review source-level API changes with an authorized migration agent when verification reports them.",
    ],
    limitations: [
      "This planner never guesses an @effect/* version.",
      "This planner never edits application source.",
      "Agent-authored source migration requires explicit repository opt-in.",
    ],
  };
}

function reminderFor(
  classification: Exclude<EffectRepositoryClassification, "supported-effect-v4" | "not-applicable">,
  reviewedEffectVersion: string,
  mechanicalMigrationAvailable: boolean,
): EffectMigrationReminder {
  return {
    kind: "effect-migration-reminder",
    classification,
    reviewedEffectVersion,
    title: `Effect migration review: ${classification}`,
    message: mechanicalMigrationAvailable
      ? `This repository declares an unsupported Effect version. A dependency-only migration to ${reviewedEffectVersion} is available; apply it only after repository verification.`
      : `This repository declares an unsupported Effect version. Review the supplementary guide and explicitly opt in to any agent-authored migration.`,
    action: mechanicalMigrationAvailable ? "apply-mechanical-migration" : "review-and-opt-in",
  };
}

export function classifyEffectRepository(
  input: ClassifyEffectRepositoryInput,
): EffectRepositoryClassificationResult {
  const analysis = analyze(input);
  if (!analysis.hasDeclarations) {
    return {
      classification: "not-applicable",
      reviewedEffectVersion: analysis.reviewedEffectVersion,
      manifests: analysis.manifests,
      reasons: [],
      mechanicalMigrationAvailable: false,
    };
  }

  if (!analysis.unsupported && analysis.allExactAndUnconflicted) {
    return {
      classification: "supported-effect-v4",
      reviewedEffectVersion: analysis.reviewedEffectVersion,
      manifests: analysis.manifests,
      reasons: [],
      mechanicalMigrationAvailable: false,
    };
  }

  const mechanicalMigrationAvailable =
    analysis.unsupported && analysis.allExactAndUnconflicted && analysis.targetsAvailable;
  const classification: Exclude<
    EffectRepositoryClassification,
    "supported-effect-v4" | "not-applicable"
  > = mechanicalMigrationAvailable ? "mechanically-migratable" : "agent-migration-opt-in-required";
  const reasons =
    analysis.reasons.length > 0
      ? analysis.reasons
      : [
          `Effect declarations do not match the exact reviewed release ${analysis.reviewedEffectVersion}.`,
        ];
  return {
    classification,
    reviewedEffectVersion: analysis.reviewedEffectVersion,
    manifests: analysis.manifests,
    reasons,
    mechanicalMigrationAvailable,
    reminder: reminderFor(
      classification,
      analysis.reviewedEffectVersion,
      mechanicalMigrationAvailable,
    ),
    supplementaryGuide: guideFor(analysis.reviewedEffectVersion),
  };
}

export function planMechanicalEffectMigration(
  input: MechanicalEffectMigrationInput,
): MechanicalEffectMigrationPlan {
  const analysis = analyze(input);
  const classification = classifyEffectRepository(input);
  if (classification.classification !== "mechanically-migratable") {
    return {
      available: false,
      reviewedEffectVersion: analysis.reviewedEffectVersion,
      edits: [],
      reasons:
        classification.reasons.length > 0
          ? classification.reasons
          : [`Mechanical migration is unavailable for ${classification.classification}.`],
    };
  }

  const supportedPackageVersions = input.supportedPackageVersions ?? {};
  const edits: ManifestEdit[] = [];
  for (const declaration of analysis.declarations) {
    const target =
      declaration.packageName === EFFECT_PACKAGE
        ? analysis.reviewedEffectVersion
        : supportedPackageVersions[declaration.packageName];
    if (target === undefined || target === declaration.value) continue;
    if (typeof declaration.value !== "string") continue;
    edits.push({
      manifestPath: declaration.manifest.path ?? declaration.manifest.name ?? "package.json",
      section: declaration.section,
      packageName: declaration.packageName,
      from: declaration.value,
      to: target,
    });
  }
  edits.sort((left, right) => {
    const leftKey = `${left.manifestPath}\u0000${left.section}\u0000${left.packageName}`;
    const rightKey = `${right.manifestPath}\u0000${right.section}\u0000${right.packageName}`;
    return leftKey.localeCompare(rightKey);
  });
  return {
    available: true,
    reviewedEffectVersion: analysis.reviewedEffectVersion,
    edits,
    reasons: [],
  };
}
