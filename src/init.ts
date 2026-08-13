import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type AdoptionState = "missing" | "present" | "conflict" | "created" | "unchanged";

export interface InitAction {
  readonly kind: "config" | "guidance";
  readonly path: string;
  readonly state: AdoptionState;
  readonly message: string;
}

export interface InitOutput {
  readonly schemaVersion: 1;
  readonly status: 0 | 2;
  readonly applied: boolean;
  readonly actions: readonly InitAction[];
  readonly failure?: { readonly code: string; readonly message: string };
}

export interface InitOptions {
  readonly cwd: string;
  readonly apply?: boolean;
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const guidanceSource = join(packageRoot, "guidance", "AGENTS.fragment.md");
const configName = "effx.config.json";
const guidanceName = "AGENTS.fragment.md";

const starterConfig = {
  effect: {
    strictness: "recommended",
    groups: [{ files: ["src/**/*.ts", "src/**/*.tsx"], role: "application", platform: "portable" }],
  },
  oxlintConfig: ".oxlintrc.json",
  tsconfig: "tsconfig.json",
} as const;

const stableJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const readText = (path: string): string | undefined => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
};

const writeAtomic = (path: string, content: string): void => {
  const temporary = `${path}.effx-tmp-${process.pid}`;
  try {
    writeFileSync(temporary, content, { encoding: "utf8", flag: "wx" });
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // The original error is more useful to callers.
    }
    throw error;
  }
};

const action = (
  kind: InitAction["kind"],
  path: string,
  state: AdoptionState,
  message: string,
): InitAction => ({ kind, path, state, message });

const failureOutput = (
  applied: boolean,
  actions: readonly InitAction[],
  error: unknown,
): InitOutput => ({
  schemaVersion: 1,
  status: 2,
  applied,
  actions,
  failure: {
    code: "EFFX_INIT_CONFLICT",
    message: error instanceof Error ? error.message : String(error),
  },
});

/** Plan or apply the reviewed starter project artifacts without overwriting files. */
export function initProject(options: InitOptions): InitOutput {
  const root = resolve(options.cwd);
  const configPath = join(root, configName);
  const guidancePath = join(root, guidanceName);
  const configContent = stableJson(starterConfig);
  const guidanceContent = readText(guidanceSource);
  const initialActions: InitAction[] = [];

  if (guidanceContent === undefined) {
    initialActions.push(
      action(
        "guidance",
        guidancePath,
        "conflict",
        `guidance asset is unavailable: ${guidanceSource}`,
      ),
    );
  }

  const configExisting = readText(configPath);
  if (configExisting === undefined && !existsSync(configPath)) {
    initialActions.push(
      action("config", configPath, "missing", "create reviewed starter effx.config.json"),
    );
  } else if (configExisting === configContent) {
    initialActions.push(
      action("config", configPath, "present", "starter configuration already matches"),
    );
  } else {
    initialActions.push(
      action("config", configPath, "conflict", "refusing to overwrite existing effx.config.json"),
    );
  }

  const guidanceExisting = readText(guidancePath);
  if (guidanceExisting === undefined && !existsSync(guidancePath)) {
    initialActions.push(
      action(
        "guidance",
        guidancePath,
        guidanceContent === undefined ? "conflict" : "missing",
        "install reviewed agent guidance fragment",
      ),
    );
  } else if (guidanceExisting === guidanceContent) {
    initialActions.push(
      action("guidance", guidancePath, "present", "agent guidance fragment already matches"),
    );
  } else {
    initialActions.push(
      action("guidance", guidancePath, "conflict", "refusing to overwrite existing agent guidance"),
    );
  }

  if (!options.apply) {
    const hasConflict = initialActions.some((candidate) => candidate.state === "conflict");
    return {
      schemaVersion: 1,
      status: hasConflict ? 2 : 0,
      applied: false,
      actions: initialActions,
      ...(hasConflict
        ? {
            failure: {
              code: "EFFX_INIT_CONFLICT",
              message: "init found an existing or unavailable artifact",
            },
          }
        : {}),
    };
  }

  const conflict = initialActions.find((candidate) => candidate.state === "conflict");
  if (conflict !== undefined) return failureOutput(true, initialActions, conflict.message);

  const appliedActions: InitAction[] = [];
  try {
    for (const candidate of initialActions) {
      if (candidate.state === "present") {
        appliedActions.push({ ...candidate, state: "unchanged" });
        continue;
      }
      if (candidate.kind === "config") {
        writeAtomic(candidate.path, configContent);
      } else {
        writeAtomic(candidate.path, guidanceContent!);
      }
      appliedActions.push({ ...candidate, state: "created" });
    }
  } catch (error) {
    return failureOutput(true, appliedActions, error);
  }
  return { schemaVersion: 1, status: 0, applied: true, actions: appliedActions };
}

export function renderInitHuman(output: InitOutput): string {
  const lines = [
    `effx init: ${output.status === 0 ? "ready" : "conflict"}${output.applied ? " (applied)" : " (plan)"}`,
  ];
  for (const candidate of output.actions)
    lines.push(`${candidate.state}\t${candidate.kind}\t${candidate.path}\t${candidate.message}`);
  if (output.failure !== undefined)
    lines.push(`failed [${output.failure.code}]: ${output.failure.message}`);
  return lines.join("\n");
}
