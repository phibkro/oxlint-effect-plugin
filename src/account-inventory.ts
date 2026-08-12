import {
  classifyEffectRepository,
  type EffectRepositoryClassification,
  type EffectRepositoryClassificationResult,
  type PackageManifestObservation,
} from "./effect-version.js";

/** A decoded repository observation supplied by a runtime GitHub adapter. */
export interface RepositoryObservation {
  readonly owner: string;
  readonly name: string;
  readonly archived: boolean;
  readonly fork: boolean;
  readonly defaultBranch?: string;
  readonly defaultBranchSha?: string;
  /** An explicit empty list is a complete observation of zero source manifests. */
  readonly manifests?: readonly PackageManifestObservation[];
  readonly accessError?: string | null;
}

/** Input to the pure account inventory projection. */
export interface AccountInventoryInput {
  readonly repositories: readonly RepositoryObservation[];
  readonly reviewedEffectVersion?: string;
  readonly supportedPackageVersions?: Readonly<Record<string, string>>;
}

export interface AccountInventoryEntry {
  readonly identity: string;
  readonly defaultBranch: string;
  readonly defaultBranchSha: string;
  readonly classification: EffectRepositoryClassification;
}

export type AccountInventoryCounts = Readonly<Record<EffectRepositoryClassification, number>>;

export interface AccountInventoryCompleteness {
  /** Number of non-archived, non-fork source repositories observed. */
  readonly observedSourceRepositories: number;
  readonly classifiedRepositories: number;
  readonly classifiedExactlyOnce: true;
  readonly excludedArchived: number;
  readonly excludedForks: number;
}

export interface AccountInventoryExcludedIdentities {
  readonly archived: readonly string[];
  readonly forks: readonly string[];
}

export interface AccountInventory {
  readonly entries: readonly AccountInventoryEntry[];
  readonly counts: AccountInventoryCounts;
  readonly excludedIdentities: AccountInventoryExcludedIdentities;
  readonly completeness: AccountInventoryCompleteness;
}

const CLASSIFICATIONS: readonly EffectRepositoryClassification[] = [
  "supported-effect-v4",
  "mechanically-migratable",
  "agent-migration-opt-in-required",
  "not-applicable",
];

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const identityKey = (identity: string): string => identity.toLocaleLowerCase("en-US");

const compareStrings = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

const isEffectRepositoryClassification = (
  value: unknown,
): value is EffectRepositoryClassification =>
  typeof value === "string" && (CLASSIFICATIONS as readonly string[]).includes(value);

const fail = (message: string): never => {
  throw new Error(`Account inventory rejected: ${message}`);
};

/**
 * Build a deterministic account inventory without reading repositories or
 * performing network, filesystem, or package-manager effects.
 */
export function buildAccountInventory(input: AccountInventoryInput): AccountInventory {
  if (input === null || typeof input !== "object") {
    return fail("input is not an object");
  }
  if (!Array.isArray(input.repositories)) {
    return fail("repositories must be an array");
  }

  const seen = new Set<string>();
  const observations = input.repositories.map((repository, index) => {
    if (repository === null || typeof repository !== "object") {
      return fail(`repository ${index} is not an object`);
    }
    if (!isNonEmptyString(repository.owner) || !isNonEmptyString(repository.name)) {
      return fail(`repository ${index} has incomplete identity`);
    }
    if (typeof repository.archived !== "boolean" || typeof repository.fork !== "boolean") {
      return fail(
        `repository ${repository.owner}/${repository.name} has invalid archive/fork state`,
      );
    }
    if (repository.accessError !== undefined && repository.accessError !== null) {
      return fail(`repository ${repository.owner}/${repository.name} has an access error`);
    }

    const identity = `${repository.owner}/${repository.name}`;
    const key = identityKey(identity);
    if (seen.has(key)) {
      return fail(`duplicate repository identity ${identity}`);
    }
    seen.add(key);

    return { repository, identity };
  });

  const entries: AccountInventoryEntry[] = [];
  const archived: string[] = [];
  const forks: string[] = [];
  const counts = Object.fromEntries(
    CLASSIFICATIONS.map((classification) => [classification, 0]),
  ) as Record<EffectRepositoryClassification, number>;

  for (const { repository, identity } of observations) {
    if (repository.archived) archived.push(identity);
    if (repository.fork) forks.push(identity);
    if (repository.archived || repository.fork) continue;

    if (!isNonEmptyString(repository.defaultBranch)) {
      return fail(`repository ${identity} has no default branch observation`);
    }
    if (!isNonEmptyString(repository.defaultBranchSha)) {
      return fail(`repository ${identity} has no default branch SHA observation`);
    }
    if (repository.manifests === undefined || !Array.isArray(repository.manifests)) {
      return fail(`repository ${identity} has no source manifest observation`);
    }
    let classified: EffectRepositoryClassificationResult;
    try {
      classified = classifyEffectRepository({
        manifests: repository.manifests,
        ...(input.reviewedEffectVersion === undefined
          ? {}
          : { reviewedEffectVersion: input.reviewedEffectVersion }),
        ...(input.supportedPackageVersions === undefined
          ? {}
          : { supportedPackageVersions: input.supportedPackageVersions }),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return fail(`repository ${identity} has ambiguous classifier input (${reason})`);
    }
    if (
      classified === null ||
      typeof classified !== "object" ||
      !isEffectRepositoryClassification(classified.classification)
    ) {
      return fail(`repository ${identity} has ambiguous classifier input`);
    }

    const classification = classified.classification;
    counts[classification] += 1;
    entries.push({
      identity,
      defaultBranch: repository.defaultBranch,
      defaultBranchSha: repository.defaultBranchSha,
      classification,
    });
  }

  entries.sort((left, right) => compareStrings(left.identity, right.identity));
  archived.sort(compareStrings);
  forks.sort(compareStrings);

  const observedSourceRepositories = entries.length;
  return {
    entries,
    counts,
    excludedIdentities: { archived, forks },
    completeness: {
      observedSourceRepositories,
      classifiedRepositories: entries.length,
      classifiedExactlyOnce: true,
      excludedArchived: archived.length,
      excludedForks: forks.length,
    },
  };
}

export type AccountRepositoryObservation = RepositoryObservation;
export type AccountInventoryResult = AccountInventory;
