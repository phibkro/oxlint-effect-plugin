import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertCompatibilityState,
  assertReviewedRuntimeVersions,
  REVIEWED_DEPENDENCIES,
  REVIEWED_RUNTIMES,
} from "../../scripts/compatibility-policy.js";

const root = join(import.meta.dir, "../..");
const source = {
  packageJson: JSON.parse(readFileSync(join(root, "package.json"), "utf8")),
  compatibility: JSON.parse(readFileSync(join(root, "compatibility.json"), "utf8")),
  lock: Bun.JSONC.parse(readFileSync(join(root, "bun.lock"), "utf8")),
};
const clone = <A>(value: A): A => structuredClone(value);
const asRecord = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

describe("compatibility policy mutation resistance", () => {
  test("accepts the exact checked-in package, compatibility, and lock state", () => {
    expect(() => assertCompatibilityState(source)).not.toThrow();
  });

  test("rejects every reviewed compatibility-entry mutation", () => {
    for (const name of Object.keys(REVIEWED_DEPENDENCIES)) {
      const mutated = clone(source);
      mutated.compatibility.reviewed[name] = "0.0.0-mutated";
      expect(() => assertCompatibilityState(mutated)).toThrow(name);
    }
  });

  test("rejects every package and resolved-lock mutation", () => {
    for (const name of Object.keys(REVIEWED_DEPENDENCIES)) {
      const packageMutation = clone(source);
      packageMutation.packageJson.devDependencies[name] = "0.0.0-mutated";
      expect(() => assertCompatibilityState(packageMutation)).toThrow(name);

      const lockMutation = clone(source);
      const packages = asRecord(asRecord(lockMutation.lock)["packages"]);
      const resolution = packages[name];
      if (!Array.isArray(resolution)) throw new Error(`test fixture lacks lock resolution ${name}`);
      resolution[0] = `${name}@0.0.0-mutated`;
      expect(() => assertCompatibilityState(lockMutation)).toThrow(name);
    }
  });

  test("runtime review semantics are exact, not prefix or range guesses", () => {
    expect(() =>
      assertReviewedRuntimeVersions(source.compatibility, REVIEWED_RUNTIMES),
    ).not.toThrow();
    for (const name of Object.keys(REVIEWED_RUNTIMES) as Array<keyof typeof REVIEWED_RUNTIMES>) {
      const actual = { ...REVIEWED_RUNTIMES, [name]: `${REVIEWED_RUNTIMES[name]}-mutated` };
      expect(() => assertReviewedRuntimeVersions(source.compatibility, actual)).toThrow(name);
    }
  });
});
