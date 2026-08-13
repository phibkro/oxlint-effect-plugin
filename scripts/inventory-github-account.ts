import { buildAccountInventory, type RepositoryObservation } from "../src/account-inventory.js";
import type { PackageManifestObservation } from "../src/effect-version.js";

const owner = process.argv[2];
if (owner === undefined) throw new Error("usage: inventory-github-account.ts <owner>");

const ghJson = async <A>(args: readonly string[]): Promise<A> => {
  const proc = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`gh ${args.join(" ")} failed: ${stderr.trim()}`);
  return JSON.parse(stdout) as A;
};

interface GhRepository {
  readonly nameWithOwner: string;
  readonly isArchived: boolean;
  readonly isFork: boolean;
  readonly defaultBranchRef: { readonly name: string } | null;
}
interface TreeResponse {
  readonly truncated?: boolean;
  readonly tree?: readonly { readonly path?: string; readonly type?: string }[];
}
interface ContentResponse {
  readonly content?: string;
  readonly encoding?: string;
}

const repositories = await ghJson<readonly GhRepository[]>([
  "repo",
  "list",
  owner,
  "--limit",
  "1000",
  "--json",
  "nameWithOwner,isArchived,isFork,defaultBranchRef",
]);
const observations: RepositoryObservation[] = [];
for (const repository of repositories) {
  const [repoOwner, name] = repository.nameWithOwner.split("/");
  if (repoOwner === undefined || name === undefined)
    throw new Error(`invalid repository identity ${repository.nameWithOwner}`);
  if (repository.isArchived || repository.isFork) {
    observations.push({
      owner: repoOwner,
      name,
      archived: repository.isArchived,
      fork: repository.isFork,
    });
    continue;
  }
  const branch = repository.defaultBranchRef?.name;
  if (branch === undefined) throw new Error(`${repository.nameWithOwner} has no default branch`);
  const metadata = await ghJson<{ readonly object?: { readonly sha?: string } }>([
    "api",
    `repos/${repository.nameWithOwner}/git/ref/heads/${branch}`,
  ]);
  const sha = metadata.object?.sha;
  if (sha === undefined)
    throw new Error(`${repository.nameWithOwner} has no observed default-branch SHA`);
  const tree = await ghJson<TreeResponse>([
    "api",
    `repos/${repository.nameWithOwner}/git/trees/${sha}?recursive=1`,
  ]);
  if (tree.truncated === true)
    throw new Error(`${repository.nameWithOwner} recursive tree was truncated`);
  const packagePaths = (tree.tree ?? [])
    .filter(
      ({ path, type }) =>
        type === "blob" && (path === "package.json" || path?.endsWith("/package.json")),
    )
    .map(({ path }) => path!)
    .filter((path) => !path.split("/").includes("node_modules"))
    .toSorted();
  const manifests: PackageManifestObservation[] = [];
  for (const path of packagePaths) {
    const content = await ghJson<ContentResponse>([
      "api",
      `repos/${repository.nameWithOwner}/contents/${path}?ref=${sha}`,
    ]);
    if (content.encoding !== "base64" || content.content === undefined)
      throw new Error(`${repository.nameWithOwner}:${path} did not return base64 content`);
    const decoded = JSON.parse(
      Buffer.from(content.content.replaceAll("\n", ""), "base64").toString("utf8"),
    ) as Record<string, unknown>;
    manifests.push({ ...decoded, path } as PackageManifestObservation);
  }
  observations.push({
    owner: repoOwner,
    name,
    archived: false,
    fork: false,
    defaultBranch: branch,
    defaultBranchSha: sha,
    manifests,
  });
}

const inventory = buildAccountInventory({ repositories: observations });
console.log(JSON.stringify({ schemaVersion: 1, owner, ...inventory }, null, 2));
