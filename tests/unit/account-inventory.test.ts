import { describe, expect, test } from "bun:test";

import { buildAccountInventory, type RepositoryObservation } from "../../src/account-inventory.js";

const manifest = (name: string, version: string, dependencies: Record<string, string> = {}) => ({
  name,
  version,
  dependencies: { effect: version, ...dependencies },
});

const repository = (
  name: string,
  manifests: readonly ReturnType<typeof manifest>[],
  extra: Partial<RepositoryObservation> = {},
): RepositoryObservation => ({
  owner: "acme",
  name,
  archived: false,
  fork: false,
  defaultBranch: "main",
  defaultBranchSha: `sha-${name}`,
  manifests,
  ...extra,
});

describe("buildAccountInventory", () => {
  test("classifies each source repository once and returns stable ordering", () => {
    const input = {
      repositories: [
        repository("zeta", [manifest("zeta", "0.0.1", { "@effect/platform": "4.0.0-beta.107" })]),
        repository("alpha", [manifest("alpha", "4.0.0-beta.107")]),
        repository("delta", [manifest("delta", "3.0.0")]),
        repository("beta", [manifest("beta", "4.0.0-beta.107", { "@effect/platform": "^4.0.0" })]),
      ],
      reviewedEffectVersion: "4.0.0-beta.107",
      supportedPackageVersions: { effect: "4.0.0-beta.107" },
    };
    const first = buildAccountInventory(input);
    const second = buildAccountInventory({
      ...input,
      repositories: input.repositories.toReversed(),
    });

    expect(first).toEqual(second);
    expect(first.entries.map(({ identity }) => identity)).toEqual([
      "acme/alpha",
      "acme/beta",
      "acme/delta",
      "acme/zeta",
    ]);
    expect(first.completeness).toEqual({
      observedSourceRepositories: 4,
      classifiedRepositories: 4,
      classifiedExactlyOnce: true,
      excludedArchived: 0,
      excludedForks: 0,
    });
    expect(Object.values(first.counts).reduce((sum, count) => sum + count, 0)).toBe(4);
  });

  test("excludes archived and fork repositories while recording identities and counts", () => {
    const result = buildAccountInventory({
      repositories: [
        repository("forked", [], { fork: true }),
        repository("archived", [], { archived: true }),
        repository("source", [manifest("source", "4.0.0-beta.107")]),
      ],
    });

    expect(result.entries.map(({ identity }) => identity)).toEqual(["acme/source"]);
    expect(result.excludedIdentities).toEqual({
      archived: ["acme/archived"],
      forks: ["acme/forked"],
    });
    expect(result.completeness.excludedArchived).toBe(1);
    expect(result.completeness.excludedForks).toBe(1);
  });

  test("fails closed for duplicate identity, access errors, and incomplete observations", () => {
    const source = repository("source", [manifest("source", "4.0.0-beta.107")]);
    expect(() => buildAccountInventory({ repositories: [source, { ...source }] })).toThrow(
      "duplicate repository identity",
    );
    expect(() =>
      buildAccountInventory({ repositories: [{ ...source, accessError: "forbidden" }] }),
    ).toThrow("access error");
    expect(() =>
      buildAccountInventory({
        repositories: [{ ...source, defaultBranch: "" }],
      }),
    ).toThrow("default branch observation");
    const { manifests: _manifests, ...missingManifests } = source;
    expect(() => buildAccountInventory({ repositories: [missingManifests] })).toThrow(
      "source manifest observation",
    );
  });
});
