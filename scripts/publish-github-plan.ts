import { readFileSync } from "node:fs";

const planPath = process.argv[2];
if (planPath === undefined) throw new Error("usage: publish-github-plan.ts <effx-plan.json>");
const repository = process.env.GH_REPO;
const headSha = process.env.EXPECTED_HEAD_SHA;
const pullNumber = Number(process.env.PR_NUMBER);
if (repository === undefined || headSha === undefined || !Number.isSafeInteger(pullNumber))
  throw new Error("GH_REPO, EXPECTED_HEAD_SHA, and PR_NUMBER are required");
const plan = JSON.parse(readFileSync(planPath, "utf8")) as {
  readonly accepted?: boolean;
  readonly headSha?: string;
  readonly check?: {
    readonly name?: string;
    readonly annotations?: readonly Record<string, unknown>[];
  };
  readonly commentOperations?: readonly Record<string, unknown>[];
};
if (plan.accepted !== true || plan.headSha !== headSha)
  throw new Error("effx publication plan is rejected or stale");
const api = async (method: string, path: string, body?: unknown): Promise<unknown> => {
  const args = ["gh", "api", "--method", method, path, "--input", "-"];
  const proc = Bun.spawn(args, { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  proc.stdin.write(JSON.stringify(body ?? {}));
  proc.stdin.end();
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`GitHub API ${method} ${path} failed: ${stderr.trim()}`);
  return stdout.length === 0 ? null : JSON.parse(stdout);
};
const annotations = (plan.check?.annotations ?? []).slice(0, 50).map((finding) => ({
  path: finding.path,
  start_line: finding.line,
  end_line: finding.line,
  annotation_level: "failure",
  title: `${finding.code}: ${finding.rule}`,
  message: [finding.message, finding.explanation, finding.help].filter(Boolean).join("\n\n"),
}));
await api("POST", `/repos/${repository}/check-runs`, {
  name: plan.check?.name ?? "effx",
  head_sha: headSha,
  status: "completed",
  conclusion: annotations.length === 0 ? "success" : "failure",
  output: {
    title: "effx review",
    summary: `${plan.check?.annotations?.length ?? 0} finding(s)`,
    annotations,
  },
});
for (const operation of plan.commentOperations ?? []) {
  if (operation.kind === "create") {
    await api("POST", `/repos/${repository}/pulls/${pullNumber}/comments`, {
      body: operation.body,
      commit_id: headSha,
      path: operation.path,
      line: operation.line,
      side: "RIGHT",
    });
  } else if (operation.kind === "update") {
    await api("PATCH", `/repos/${repository}/pulls/comments/${operation.id}`, {
      body: operation.body,
    });
  } else if (operation.kind === "resolve") {
    await api("DELETE", `/repos/${repository}/pulls/comments/${operation.id}`);
  } else throw new Error(`unsupported effx comment operation ${String(operation.kind)}`);
}
