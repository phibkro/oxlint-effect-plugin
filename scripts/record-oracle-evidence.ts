/**
 * Reproduce and materialize the observed-red non-reporting oracle plus the
 * observed-green exact plugin matrix. Output is sanitized and byte-stable.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const mode = process.argv[2];
if (mode !== "write" && mode !== "check") {
  console.error("usage: record-oracle-evidence.ts write|check");
  process.exit(2);
}

const run = async (
  args: readonly string[],
): Promise<{ readonly output: string; readonly exitCode: number }> => {
  const proc = Bun.spawn(["bun", ...args], { cwd: repoRoot, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { output: `${stdout}${stderr}`, exitCode };
};

{
  const stub = "./scripts/non-reporting-stub.mjs";
  const red = await run(["scripts/run-matrix.ts", "--plugin", stub, "--config-form", "json"]);
  if (red.exitCode !== 1 || !red.output.includes("actual-plugin-diagnostics=0")) {
    throw new Error(`non-reporting oracle did not fail as expected\n${red.output}`);
  }
  const green = await run(["scripts/run-matrix.ts"]);
  if (green.exitCode !== 0 || !green.output.includes("missing=0 unexpected=0")) {
    throw new Error(`implemented oracle did not pass\n${green.output}`);
  }

  const artifacts = [
    {
      path: "docs/acceptance/0001-observed-red.txt",
      content: `${red.output.trim()}\nrunner exit: 1\n`,
    },
    {
      path: "docs/acceptance/0001-observed-green.txt",
      content: `${green.output.trim()}\nrunner exit: 0\n`,
    },
  ] as const;

  let drift = false;
  for (const artifact of artifacts) {
    const path = join(repoRoot, artifact.path);
    const current = readFileSync(path, "utf8");
    if (current === artifact.content) continue;
    if (mode === "write") writeFileSync(path, artifact.content);
    else {
      console.error(`DRIFT: ${artifact.path} is not current oracle evidence`);
      drift = true;
    }
  }
  if (drift) process.exit(1);
  console.log(
    mode === "write" ? "oracle evidence recorded" : "oracle evidence check: byte-identical",
  );
}
