/**
 * The sole producer preparation path for `dist/`.
 *
 * Removing ignored output first prevents an old worktree build from being
 * mistaken for the current commit. Standard `bun pm pack` invokes this as its
 * `prepack` lifecycle; consumer installs still use `--ignore-scripts`.
 */

import { rmSync } from "node:fs";
import { join } from "node:path";

import { verifyDistribution } from "./verify-dist.js";

const repoRoot = join(import.meta.dir, "..");
const tsc = join(repoRoot, "node_modules", ".bin", "tsc");

rmSync(join(repoRoot, "dist"), { recursive: true, force: true });
const process = Bun.spawn(["bun", tsc, "-p", "tsconfig.build.json"], {
  cwd: repoRoot,
  stdout: "inherit",
  stderr: "inherit",
});
const exitCode = await process.exited;
if (exitCode !== 0) {
  throw new Error(`distribution build exited ${exitCode}`);
}
await verifyDistribution();
console.log("package preparation: rebuilt and verified dist/");
