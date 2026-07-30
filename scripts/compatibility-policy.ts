/**
 * Frozen, machine-checked compatibility policy for tracer 0001.
 *
 * The generator, repository gate, packed-artifact acceptance, and mutation
 * tests share this table. "Reviewed" means exact for this frozen tracer, not
 * a semver range or an inference from whatever happens to be installed.
 */

export const REVIEWED_DEPENDENCIES = {
  oxlint: "1.76.0",
  oxfmt: "0.61.0",
  typescript: "7.0.2",
  effect: "4.0.0-beta.102",
  "@effect/platform-node": "4.0.0-beta.102",
  "@effect/platform-bun": "4.0.0-beta.102",
  "@effect/tsgo": "0.24.3",
  "oxlint-tsgolint": "7.0.2001",
} as const;

export const REVIEWED_RUNTIMES = {
  bun: "1.3.13",
  node: "24.18.0",
  deno: "2.9.2",
} as const;

export const REVIEWED_NODE_ENGINE = "^20.19.0 || >=22.12.0";
export const PACKAGE_NAME = "@phibkro/oxlint-effect-plugin";
export const EFFECT_COMPATIBILITY = {
  name: "effect",
  domain: "effect-v4",
  major: 4,
  reviewed: REVIEWED_DEPENDENCIES.effect,
  reviewPolicy: "exact",
} as const;

type JsonRecord = Readonly<Record<string, unknown>>;

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function assertExactRecord(
  actual: JsonRecord,
  expected: Readonly<Record<string, unknown>>,
  label: string,
): void {
  const actualKeys = Object.keys(actual).toSorted();
  const expectedKeys = Object.keys(expected).toSorted();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(
      `${label} keys drifted: expected ${expectedKeys.join(", ")}, received ${actualKeys.join(", ")}`,
    );
  }
  for (const [name, value] of Object.entries(expected)) {
    if (actual[name] !== value) {
      throw new Error(`${label}.${name} must equal ${value}; received ${String(actual[name])}`);
    }
  }
}

export function assertCompatibilityDocument(compatibility: unknown): void {
  const document = record(compatibility, "compatibility");
  const packageMetadata = record(document["package"], "compatibility.package");
  if (packageMetadata["name"] !== PACKAGE_NAME) {
    throw new Error(`compatibility.package.name must equal ${PACKAGE_NAME}`);
  }
  assertExactRecord(
    record(document["technology"], "compatibility.technology"),
    EFFECT_COMPATIBILITY,
    "compatibility.technology",
  );
  assertExactRecord(
    record(document["reviewed"], "compatibility.reviewed"),
    REVIEWED_DEPENDENCIES,
    "compatibility.reviewed",
  );

  const runtimes = record(document["runtimes"], "compatibility.runtimes");
  const expectedRuntimeKeys = Object.keys(REVIEWED_RUNTIMES).toSorted();
  if (JSON.stringify(Object.keys(runtimes).toSorted()) !== JSON.stringify(expectedRuntimeKeys)) {
    throw new Error("compatibility.runtimes keys drifted");
  }
  for (const [name, version] of Object.entries(REVIEWED_RUNTIMES)) {
    const runtime = record(runtimes[name], `compatibility.runtimes.${name}`);
    if (runtime["reviewed"] !== version || runtime["reviewPolicy"] !== "exact") {
      throw new Error(
        `compatibility.runtimes.${name} must declare exact reviewed version ${version}`,
      );
    }
  }
  const node = record(runtimes["node"], "compatibility.runtimes.node");
  if (node["engines"] !== REVIEWED_NODE_ENGINE) {
    throw new Error(`compatibility Node engines must equal ${REVIEWED_NODE_ENGINE}`);
  }
}

export function assertCompatibilityState(args: {
  readonly packageJson: unknown;
  readonly compatibility: unknown;
  readonly lock: unknown;
}): void {
  assertCompatibilityDocument(args.compatibility);
  const pkg = record(args.packageJson, "package.json");
  if (pkg["name"] !== PACKAGE_NAME) {
    throw new Error(`package.json name must equal ${PACKAGE_NAME}`);
  }
  assertExactRecord(
    record(pkg["effectCompatibility"], "package.json.effectCompatibility"),
    EFFECT_COMPATIBILITY,
    "package.json.effectCompatibility",
  );
  const devDependencies = record(pkg["devDependencies"], "package.json.devDependencies");
  const peerDependencies = record(pkg["peerDependencies"], "package.json.peerDependencies");
  assertExactRecord(
    Object.fromEntries(
      Object.keys(REVIEWED_DEPENDENCIES).map((name) => [name, devDependencies[name]]),
    ),
    REVIEWED_DEPENDENCIES,
    "package.json reviewed devDependencies",
  );
  if (peerDependencies["oxlint"] !== REVIEWED_DEPENDENCIES.oxlint) {
    throw new Error(`package.json peer oxlint must equal ${REVIEWED_DEPENDENCIES.oxlint}`);
  }
  if (pkg["engines"] === undefined) throw new Error("package.json engines missing");
  if (record(pkg["engines"], "package.json.engines")["node"] !== REVIEWED_NODE_ENGINE) {
    throw new Error(`package.json Node engines must equal ${REVIEWED_NODE_ENGINE}`);
  }

  const lock = record(args.lock, "bun.lock");
  const workspaces = record(lock["workspaces"], "bun.lock.workspaces");
  const root = record(workspaces[""], 'bun.lock.workspaces[""]');
  if (root["name"] !== PACKAGE_NAME) {
    throw new Error(`bun.lock root name must equal ${PACKAGE_NAME}`);
  }
  const lockedDev = record(root["devDependencies"], "bun.lock root devDependencies");
  const lockedPeer = record(root["peerDependencies"], "bun.lock root peerDependencies");
  assertExactRecord(
    Object.fromEntries(Object.keys(REVIEWED_DEPENDENCIES).map((name) => [name, lockedDev[name]])),
    REVIEWED_DEPENDENCIES,
    "bun.lock reviewed root devDependencies",
  );
  if (lockedPeer["oxlint"] !== REVIEWED_DEPENDENCIES.oxlint) {
    throw new Error(`bun.lock root peer oxlint must equal ${REVIEWED_DEPENDENCIES.oxlint}`);
  }

  const packages = record(lock["packages"], "bun.lock.packages");
  for (const [name, version] of Object.entries(REVIEWED_DEPENDENCIES)) {
    const resolution = packages[name];
    if (!Array.isArray(resolution) || resolution[0] !== `${name}@${version}`) {
      throw new Error(`bun.lock package ${name} must resolve exactly to ${name}@${version}`);
    }
  }
}

export function assertReviewedRuntimeVersions(
  compatibility: unknown,
  actual: Readonly<Record<keyof typeof REVIEWED_RUNTIMES, string>>,
): void {
  assertCompatibilityDocument(compatibility);
  for (const [name, expected] of Object.entries(REVIEWED_RUNTIMES)) {
    if (actual[name as keyof typeof REVIEWED_RUNTIMES] !== expected) {
      throw new Error(
        `${name} runtime must equal reviewed ${expected}; received ${actual[name as keyof typeof REVIEWED_RUNTIMES]}`,
      );
    }
  }
}

export function parseRuntimeVersion(
  runtime: keyof typeof REVIEWED_RUNTIMES,
  output: string,
): string {
  const firstLine = output.trim().split(/\r?\n/, 1)[0] ?? "";
  const pattern = runtime === "deno" ? /^deno\s+(\d+\.\d+\.\d+)\b/ : /^v?(\d+\.\d+\.\d+)\b/;
  const match = pattern.exec(firstLine);
  if (match?.[1] === undefined) {
    throw new Error(`cannot parse ${runtime} version from ${JSON.stringify(firstLine)}`);
  }
  return match[1];
}
