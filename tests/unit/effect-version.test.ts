import { describe, expect, test } from "bun:test";

import {
  REVIEWED_EFFECT_VERSION,
  classifyEffectRepository,
  planMechanicalEffectMigration,
  type PackageManifestObservation,
} from "../../src/effect-version.js";

const manifest = (
  dependencies: Record<string, string>,
  options: Partial<PackageManifestObservation> = {},
): PackageManifestObservation => ({
  name: options.name ?? "fixture",
  path: options.path ?? "package.json",
  ...options,
  dependencies,
});

const classify = (
  packageManifest: PackageManifestObservation,
  options: Parameters<typeof classifyEffectRepository>[0] = {},
) => classifyEffectRepository({ manifests: [packageManifest], ...options });

describe("Effect version classification", () => {
  test("accepts the exact reviewed Effect v4 release", () => {
    expect(classify(manifest({ effect: REVIEWED_EFFECT_VERSION })).classification).toBe(
      "supported-effect-v4",
    );
  });

  test("plans an exact Effect v3 mechanical migration", () => {
    const result = classify(manifest({ effect: "3.17.7" }));
    expect(result.classification).toBe("mechanically-migratable");
    expect(
      planMechanicalEffectMigration({ manifests: [manifest({ effect: "3.17.7" })] }),
    ).toMatchObject({
      available: true,
      edits: [{ packageName: "effect", from: "3.17.7", to: REVIEWED_EFFECT_VERSION }],
    });
  });

  test("plans an exact unsupported v4 migration", () => {
    expect(classify(manifest({ effect: "4.0.0-beta.106" })).classification).toBe(
      "mechanically-migratable",
    );
  });

  test("requires agent opt-in for ranges, workspace protocols, and conflicts", () => {
    expect(classify(manifest({ effect: "^3.17.0" })).classification).toBe(
      "agent-migration-opt-in-required",
    );
    expect(classify(manifest({ effect: "workspace:*" })).classification).toBe(
      "agent-migration-opt-in-required",
    );
    expect(
      classify(manifest({ effect: "3.17.7" }, { devDependencies: { effect: "4.0.0-beta.106" } }))
        .classification,
    ).toBe("agent-migration-opt-in-required");
  });

  test("returns not-applicable when no Effect dependency is declared", () => {
    expect(classify(manifest({ react: "18.3.1" })).classification).toBe("not-applicable");
  });

  test("aggregates workspace package manifests", () => {
    const result = classify({
      name: "workspace-root",
      path: "package.json",
      workspacePackages: [manifest({ effect: "3.17.7" }, { path: "packages/a/package.json" })],
    });
    expect(result.classification).toBe("mechanically-migratable");
    expect(result.manifests.map(({ path }) => path)).toEqual([
      "package.json",
      "packages/a/package.json",
    ]);
  });

  test("emits deterministic edits for explicit @effect targets", () => {
    const packageManifest = manifest(
      { "@effect/platform": "0.50.0", effect: "3.17.7" },
      { path: "package.json" },
    );
    const input = {
      manifests: [packageManifest],
      supportedPackageVersions: { "@effect/platform": "0.60.0" },
    };
    const first = planMechanicalEffectMigration(input);
    expect(first).toEqual(planMechanicalEffectMigration(input));
    expect(first.edits).toEqual([
      {
        manifestPath: "package.json",
        section: "dependencies",
        packageName: "@effect/platform",
        from: "0.50.0",
        to: "0.60.0",
      },
      {
        manifestPath: "package.json",
        section: "dependencies",
        packageName: "effect",
        from: "3.17.7",
        to: REVIEWED_EFFECT_VERSION,
      },
    ]);
  });

  test("does not guess an @effect package target", () => {
    const input = { manifests: [manifest({ effect: "3.17.7", "@effect/platform": "0.50.0" })] };
    expect(classifyEffectRepository(input).classification).toBe("agent-migration-opt-in-required");
    expect(planMechanicalEffectMigration(input)).toMatchObject({ available: false, edits: [] });
  });
});
