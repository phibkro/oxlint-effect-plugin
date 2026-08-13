import { existsSync, statSync } from "node:fs";
import type { EffxProject } from "./effx-types.js";
import { EffxFailure } from "./effx-types.js";
import { loadEffxProject } from "./project.js";
import { inspectCheckProviders, type ProviderInspection } from "./providers.js";

export type DoctorCheckStatus = "pass" | "fail" | "unverified";

export interface DoctorCheck {
  readonly id: string;
  readonly status: DoctorCheckStatus;
  readonly message?: string;
  readonly path?: string;
  readonly package?: string;
  readonly reviewedVersion?: string;
  readonly installedVersion?: string;
  readonly executable?: string;
  readonly executableOverride?: boolean;
}

export interface DoctorFailure {
  readonly code: string;
  readonly message: string;
}

export interface DoctorOutput {
  readonly schemaVersion: 1;
  readonly status: 0 | 2;
  readonly checks: readonly DoctorCheck[];
  readonly failure?: DoctorFailure;
}

export interface DoctorOptions {
  readonly cwd: string;
}

const futureChecks: readonly DoctorCheck[] = [
  {
    id: "binary-hash",
    status: "unverified",
    message: "Binary hash verification is not implemented.",
  },
  {
    id: "registry-integrity",
    status: "unverified",
    message: "Registry integrity verification is not implemented.",
  },
  {
    id: "patch-detection",
    status: "unverified",
    message: "Provider patch detection is not implemented.",
  },
  {
    id: "editor-ownership",
    status: "unverified",
    message: "Editor ownership verification is not implemented.",
  },
  {
    id: "daemon-custody",
    status: "unverified",
    message: "Daemon custody verification is not implemented.",
  },
  {
    id: "platform-artifact-provenance",
    status: "unverified",
    message: "Platform artifact provenance verification is not implemented.",
  },
];

const failureCheck = (failure: DoctorFailure): DoctorCheck => ({
  id: "project",
  status: "fail",
  message: `${failure.code}: ${failure.message}`,
});

const configCheck = (id: string, path: string): DoctorCheck => {
  if (!existsSync(path) || !statSync(path).isFile())
    throw new EffxFailure(
      "EFFX_CONFIG_INVALID",
      `effx: required config file is unavailable: ${path}`,
    );
  return { id, status: "pass", path };
};

const providerCheck = (provider: ProviderInspection): DoctorCheck => ({
  id: `provider:${provider.id}`,
  status: "pass",
  package: provider.id,
  reviewedVersion: provider.reviewedVersion,
  installedVersion: provider.version,
  path: provider.manifestPath,
  executable: provider.executablePath,
  executableOverride: provider.executableOverride,
});

const checksForProject = (project: EffxProject): readonly DoctorCheck[] => [
  { id: "project", status: "pass", path: project.root },
  configCheck("config:effx", project.configPath),
  configCheck("config:oxlint", project.oxlintConfigPath),
  configCheck("config:typescript", project.tsconfigPath),
  ...inspectCheckProviders(project).map(providerCheck),
];

export function doctor(options: DoctorOptions): DoctorOutput {
  try {
    const project = loadEffxProject(options.cwd);
    return {
      schemaVersion: 1,
      status: 0,
      checks: [...checksForProject(project), ...futureChecks],
    };
  } catch (error) {
    const failure =
      error instanceof EffxFailure
        ? error
        : new EffxFailure("EFFX_INTERNAL", error instanceof Error ? error.message : String(error));
    return {
      schemaVersion: 1,
      status: 2,
      checks: [failureCheck({ code: failure.code, message: failure.message }), ...futureChecks],
      failure: { code: failure.code, message: failure.message },
    };
  }
}

export function renderDoctorHuman(output: DoctorOutput): string {
  const lines = output.checks.map((check) => {
    const detail = check.message ?? check.path ?? check.executable ?? "";
    return `${check.status.toUpperCase()} ${check.id}${detail === "" ? "" : `: ${detail}`}`;
  });
  if (output.status === 0) lines.unshift("effx doctor: healthy");
  else
    lines.unshift(
      `effx doctor failed [${output.failure?.code ?? "EFFX_INTERNAL"}]: ${output.failure?.message ?? "unknown failure"}`,
    );
  return lines.join("\n");
}
