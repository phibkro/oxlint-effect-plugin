import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = join(root, "docs/acceptance/effx-github-0001-observed-green.json");
const mode = process.argv[2] ?? "check";
if (mode !== "check" && mode !== "write")
  throw new Error("usage: accept-effx-github-0001.ts [check|write]");
const proc = Bun.spawn(["bun", "run", "scripts/tracers/0002-effx-github-review.ts"], {
  cwd: root,
  stdout: "pipe",
  stderr: "pipe",
});
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
  proc.exited,
]);
if (exitCode !== 0) throw new Error(`GitHub tracer exited ${exitCode}: ${stderr}`);
const observed = JSON.parse(stdout) as {
  readonly outcome?: unknown;
  readonly first?: {
    readonly annotations?: unknown;
    readonly summaryOnly?: unknown;
    readonly operations?: unknown;
  };
  readonly second?: unknown;
  readonly fixed?: unknown;
  readonly stale?: { readonly accepted?: unknown; readonly reason?: unknown };
  readonly finding?: Record<string, unknown>;
};
if (
  observed.outcome !== "worked" ||
  observed.first?.annotations !== 2 ||
  observed.first.summaryOnly !== 1 ||
  JSON.stringify(observed.first.operations) !== JSON.stringify(["create"]) ||
  JSON.stringify(observed.second) !== JSON.stringify(["update"]) ||
  JSON.stringify(observed.fixed) !== JSON.stringify(["resolve"]) ||
  observed.stale?.accepted !== false ||
  observed.stale.reason !== "head-sha-mismatch"
)
  throw new Error(`GitHub tracer contract drifted: ${stdout}`);
for (const field of [
  "fingerprint",
  "code",
  "rule",
  "family",
  "invariant",
  "path",
  "line",
  "message",
  "explanation",
  "help",
  "docs",
  "proofSources",
  "applicability",
  "origin",
]) {
  if (!(field in (observed.finding ?? {}))) throw new Error(`GitHub finding lost ${field}`);
}
if (mode === "write") writeFileSync(evidencePath, stdout);
else if (!existsSync(evidencePath) || readFileSync(evidencePath, "utf8") !== stdout)
  throw new Error(
    "GitHub tracer evidence is not byte-identical; run accept:effx:github:0001:write",
  );
console.log(`effx GitHub tracer acceptance: ${mode === "write" ? "recorded" : "byte-identical"}`);
