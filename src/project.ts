import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { effect, importClosurePolicy } from "./config/expand.js";
import type { EffxConfig, EffxProject, ProjectGroup, SourceSnapshot } from "./effx-types.js";
import { EffxFailure } from "./effx-types.js";

const CONFIG = "effx.config.json";
const SOURCE = /\.(?:ts|tsx|mts|cts)$/;
const EXCLUDED = new Set([".git", "node_modules", "dist"]);

const normalize = (path: string): string => path.split(sep).join("/");
const escapeRegex = (value: string): string => value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
const globRegex = (glob: string): RegExp => {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index] ?? "";
    if (char === "*" && glob[index + 1] === "*") {
      if (glob[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += escapeRegex(char);
  }
  return new RegExp(`^${source}$`);
};

const findRoot = (cwd: string): string => {
  let current = resolve(cwd);
  while (true) {
    if (existsSync(resolve(current, CONFIG))) return current;
    const parent = dirname(current);
    if (parent === current)
      throw new EffxFailure("EFFX_CONFIG_NOT_FOUND", `effx: ${CONFIG} was not found from ${cwd}`);
    current = parent;
  }
};

const listSources = (directory: string): string[] => {
  const output: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (EXCLUDED.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...listSources(path));
    else if (entry.isFile() && SOURCE.test(entry.name)) output.push(path);
  }
  return output;
};

const scopedSources = (root: string, paths: readonly string[] | undefined): string[] => {
  if (paths === undefined || paths.length === 0) return listSources(root);
  const output = new Set<string>();
  for (const input of paths) {
    const path = isAbsolute(input) ? resolve(input) : resolve(root, input);
    if (!existsSync(path))
      throw new EffxFailure("EFFX_PATH_NOT_FOUND", `effx: path does not exist: ${input}`);
    if (statSync(path).isDirectory()) for (const file of listSources(path)) output.add(file);
    else if (SOURCE.test(path)) output.add(path);
    else
      throw new EffxFailure(
        "EFFX_PATH_NOT_SOURCE",
        `effx: path is not a TypeScript source: ${input}`,
      );
  }
  return [...output].toSorted();
};

const projectGroups = (config: EffxConfig): readonly ProjectGroup[] =>
  config.effect.groups.map((group, index) => ({
    index,
    files: [...group.files],
    role: group.role,
    platform: group.platform,
    boundaries: [...(group.boundaries ?? [])],
    adapterDependencies: [...(group.adapterDependencies ?? [])],
  }));

export const groupsForPath = (
  project: Pick<EffxProject, "root" | "groups">,
  path: string,
): readonly ProjectGroup[] => {
  const name = normalize(relative(project.root, path));
  return project.groups.filter((group) =>
    group.files.some((pattern) => globRegex(pattern).test(name)),
  );
};

const sameContext = (left: ProjectGroup, right: ProjectGroup): boolean =>
  left.role === right.role &&
  left.platform === right.platform &&
  JSON.stringify(left.boundaries) === JSON.stringify(right.boundaries) &&
  JSON.stringify(left.adapterDependencies) === JSON.stringify(right.adapterDependencies);

export function loadEffxProject(cwd: string, paths?: readonly string[]): EffxProject {
  const root = findRoot(cwd);
  const configPath = resolve(root, CONFIG);
  let config: EffxConfig;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8")) as EffxConfig;
    if (typeof config !== "object" || config === null || !("effect" in config))
      throw new Error("missing effect declaration");
  } catch (error) {
    throw new EffxFailure(
      "EFFX_CONFIG_INVALID",
      `effx: invalid ${CONFIG}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let effectFragment;
  let importPolicy;
  try {
    effectFragment = effect(config.effect);
    importPolicy = importClosurePolicy(config.effect);
  } catch (error) {
    throw new EffxFailure(
      "EFFX_CONFIG_INVALID",
      error instanceof Error ? error.message : String(error),
    );
  }
  const groups = projectGroups(config);
  const candidates = scopedSources(root, paths);
  const snapshots: SourceSnapshot[] = [];
  for (const path of candidates) {
    const matching = groups.filter((group) =>
      group.files.some((pattern) => globRegex(pattern).test(normalize(relative(root, path)))),
    );
    if (matching.length === 0) continue;
    if (matching.slice(1).some((group) => !sameContext(matching[0]!, group))) {
      throw new EffxFailure(
        "EFFX_AMBIGUOUS_GROUP",
        `effx: conflicting groups govern ${normalize(relative(root, path))}`,
      );
    }
    const text = readFileSync(path, "utf8");
    snapshots.push({
      uri: pathToFileURL(path).toString(),
      path,
      text,
      sha256: createHash("sha256").update(text).digest("hex"),
      coordinatorVersion: 1,
    });
  }
  if (snapshots.length === 0)
    throw new EffxFailure(
      "EFFX_NO_GOVERNED_FILES",
      "effx: no governed TypeScript files matched the requested scope",
    );
  return {
    root,
    configPath,
    config,
    effectFragment,
    importPolicy,
    groups,
    snapshots: snapshots.toSorted((a, b) => a.uri.localeCompare(b.uri)),
    oxlintConfigPath: resolve(root, config.oxlintConfig ?? "oxlint.config.ts"),
    tsconfigPath: resolve(root, config.tsconfig ?? "tsconfig.json"),
  };
}
