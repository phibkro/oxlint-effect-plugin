import { readFileSync } from "node:fs";

interface PullFile {
  readonly filename: string;
  readonly patch?: string;
}
interface ReviewComment {
  readonly id: number;
  readonly body?: string;
}

const repository = process.env.GH_REPO;
const pullNumber = Number(process.env.PR_NUMBER);
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA;
const diagnosticsPath = process.argv[2];
if (
  repository === undefined ||
  expectedHeadSha === undefined ||
  !Number.isSafeInteger(pullNumber) ||
  diagnosticsPath === undefined
) {
  throw new Error(
    "GH_REPO, PR_NUMBER, EXPECTED_HEAD_SHA, and translated diagnostics path are required",
  );
}

const api = async <A>(path: string): Promise<A> => {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GH_TOKEN ?? ""}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${path} failed: ${response.status}`);
  return (await response.json()) as A;
};

const changedLines = (
  file: PullFile,
): readonly { path: string; startLine: number; endLine: number }[] => {
  if (file.patch === undefined) return [];
  const ranges: { path: string; startLine: number; endLine: number }[] = [];
  for (const line of file.patch.split("\n")) {
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (match === null) continue;
    const startLine = Number(match[1]);
    const length = Number(match[2] ?? "1");
    if (length > 0)
      ranges.push({ path: file.filename, startLine, endLine: startLine + length - 1 });
  }
  return ranges;
};

const pull = await api<{ head: { sha: string } }>(`/repos/${repository}/pulls/${pullNumber}`);
if (pull.head.sha !== expectedHeadSha)
  throw new Error("pull-request head changed before artifact creation");
const files = await api<readonly PullFile[]>(
  `/repos/${repository}/pulls/${pullNumber}/files?per_page=100`,
);
const comments = await api<readonly ReviewComment[]>(
  `/repos/${repository}/pulls/${pullNumber}/comments?per_page=100`,
);
const translated = JSON.parse(readFileSync(diagnosticsPath, "utf8")) as {
  readonly diagnostics?: readonly unknown[];
};
const existingComments = comments.flatMap((comment) => {
  const match = /<!-- effx:(effx-[0-9a-f]{8}) -->/.exec(comment.body ?? "");
  return match === null || match[1] === undefined
    ? []
    : [{ id: comment.id, fingerprint: match[1], body: comment.body ?? "" }];
});
console.log(
  JSON.stringify(
    {
      expectedHeadSha,
      observedHeadSha: pull.head.sha,
      diagnostics: translated.diagnostics ?? [],
      changedLines: files.flatMap(changedLines),
      existingComments,
      inlineLimit: 20,
    },
    null,
    2,
  ),
);
