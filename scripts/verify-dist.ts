/**
 * Verify the ignored distribution tree before packaging it.
 *
 * `dist/` is intentionally not commit evidence. A package producer must first
 * rebuild it from the checked-out source, then prove the public identity and
 * compatibility boundary represented by the emitted JavaScript.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PACKAGE_NAME } from "./compatibility-policy.js";

const repoRoot = join(import.meta.dir, "..");
const distRoot = join(repoRoot, "dist");

function distributionFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...distributionFiles(path));
    else files.push(path);
  }
  return files;
}

export async function verifyDistribution(): Promise<void> {
  const entrypoint = join(distRoot, "index.js");
  if (!existsSync(entrypoint)) {
    throw new Error("distribution verification requires dist/index.js; run bun run build");
  }

  const api = (await import(`${entrypoint}?verify=distribution`)) as {
    readonly default: {
      readonly meta: { readonly name: string; readonly version: string };
    };
    readonly effect: (input: {
      readonly groups: readonly [
        {
          readonly files: readonly ["src/**"];
          readonly role: "application";
          readonly platform: "portable";
        },
      ];
    }) => {
      readonly jsPlugins: readonly { readonly name: string; readonly specifier: string }[];
      readonly overrides: readonly { readonly rules: Readonly<Record<string, unknown>> }[];
    };
    readonly importClosurePolicy: (input: {
      readonly groups: readonly [
        {
          readonly files: readonly ["src/**"];
          readonly role: "application";
          readonly platform: "portable";
        },
      ];
    }) => {
      readonly groups: readonly unknown[];
    };
  };

  const fragment = api.effect({
    groups: [{ files: ["src/**"], role: "application", platform: "portable" }],
  });
  const policy = api.importClosurePolicy({
    groups: [{ files: ["src/**"], role: "application", platform: "portable" }],
  });
  if (policy.groups.length !== 1) {
    throw new Error("dist import-closure policy projection drifted");
  }
  if (api.default.meta.name !== "effect") {
    throw new Error(`dist plugin namespace drifted: ${api.default.meta.name}`);
  }
  if (
    fragment.jsPlugins[0]?.name !== "effect" ||
    fragment.jsPlugins[0]?.specifier !== PACKAGE_NAME
  ) {
    throw new Error("dist configuration expansion carries stale plugin identity");
  }
  const ruleIds = Object.keys(fragment.overrides[0]?.rules ?? {});
  if (ruleIds.length === 0 || ruleIds.some((id) => !id.startsWith("effect/"))) {
    throw new Error(`dist rule namespace drifted: ${ruleIds.join(", ")}`);
  }

  const forbidden = ["@phibkro/oxlint-effect-v4", "oxlint-effect-v4 allow", "effect-v4/"] as const;
  let sawSuppressionProtocol = false;
  for (const path of distributionFiles(distRoot)) {
    const text = readFileSync(path, "utf8");
    for (const stale of forbidden) {
      if (text.includes(stale)) {
        throw new Error(`stale distribution identity ${JSON.stringify(stale)} in ${path}`);
      }
    }
    if (text.includes("oxlint-effect-plugin allow")) sawSuppressionProtocol = true;
  }
  if (!sawSuppressionProtocol) {
    throw new Error("dist does not carry the version-neutral suppression protocol");
  }
}

if (import.meta.main) {
  await verifyDistribution();
  console.log("distribution verification: current source identity and metadata");
}
