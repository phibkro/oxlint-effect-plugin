/** Filesystem adapter for the portable native-disable audit. */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { auditNativeDisableDirectives } from "../src/suppression-audit.js";

const repoRoot = join(import.meta.dir, "..");
const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error("usage: audit-suppressions.ts <file-or-directory>...");
  process.exit(2);
}

const files: string[] = [];
const visit = (path: string): void => {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path).toSorted()) visit(join(path, entry));
  } else if (/\.[cm]?[jt]sx?$/.test(path)) {
    files.push(path);
  }
};
for (const root of roots) visit(join(repoRoot, root));

let failed = false;
for (const file of files) {
  for (const finding of auditNativeDisableDirectives(readFileSync(file, "utf8"))) {
    console.error(
      `${relative(repoRoot, file)}:${finding.line}: ${finding.reason}: ${finding.directive} ${finding.targets.join(", ")}`.trim(),
    );
    failed = true;
  }
}
if (failed) process.exit(1);
console.log(`suppression audit: ${files.length} files, no broad/plugin native disables`);
