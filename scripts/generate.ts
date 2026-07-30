/**
 * Generation gate: every derived artifact is a pure function of its root.
 *
 *   root: package.json          → src/version.ts, compatibility.json
 *   root: src/registry.ts       → docs/rules/*.md, docs/tsgo-boundary.md,
 *                                 README.md rules section (marker-delimited)
 *   root: fixtures/matrix.ts    → generated/matrix.json (consumer runners)
 *
 * Usage: bun run scripts/generate.ts write   — materialize derivations
 *        bun run scripts/generate.ts check   — fail on any drift
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { MATRIX } from "../fixtures/matrix.js";
import { BOUNDARIES, PLATFORMS, ROLES } from "../src/domains.js";
import { RULE_REGISTRY } from "../src/registry.js";

const repoRoot = join(import.meta.dir, "..");
const mode = process.argv[2];
if (mode !== "write" && mode !== "check") {
  console.error("usage: generate.ts write|check");
  process.exit(2);
}

const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
  name: string;
  version: string;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
};

interface Derivation {
  readonly path: string;
  readonly content: string;
}

const derivations: Derivation[] = [];

// --- src/version.ts ---------------------------------------------------------
derivations.push({
  path: "src/version.ts",
  content: `// Generated from package.json by \`bun run gen\`. Do not edit by hand.\nexport const PLUGIN_VERSION = ${JSON.stringify(pkg.version)};\n`,
});

// --- compatibility.json -----------------------------------------------------
// The reviewed compatibility matrix, pinned exactly during the 0.x line.
// Versions are asserted against package.json so the two never drift.
const devPin = (name: string): string => {
  const version = pkg.devDependencies[name];
  if (version === undefined) throw new Error(`package.json devDependencies missing ${name}`);
  return version;
};

const compatibility = {
  package: { name: pkg.name, version: pkg.version },
  reviewed: {
    oxlint: pkg.peerDependencies["oxlint"],
    oxfmt: devPin("oxfmt"),
    typescript: devPin("typescript"),
    effect: devPin("effect"),
    "@effect/platform-node": "4.0.0-beta.102",
    "@effect/platform-bun": "4.0.0-beta.102",
    "@effect/tsgo": "0.24.3",
  },
  runtimes: {
    bun: { role: "default development runtime and packed consumer", reviewed: "1.3.13" },
    node: {
      role: "packed consumer",
      reviewed: "24.x",
      engines: "^20.19.0 || >=22.12.0 (inherited from oxlint)",
    },
    deno: {
      role: "declared compatibility journey only",
      reviewed: "2.9.2",
      declaredSurface:
        "Load the compiled ESM artifact from node_modules (BYONM), read plugin/rule/domain metadata, and expand typed configuration. Running the oxlint CLI under Deno is not part of the declared surface.",
    },
  },
  distribution: {
    module: "ESM",
    typescriptRuntimeLoaderRequired: false,
    analysisClaim:
      "Syntax and scope diagnostics only; type-aware Effect diagnostics are delegated to @effect/tsgo.",
  },
} as const;

derivations.push({
  path: "compatibility.json",
  content: `${JSON.stringify(compatibility, null, 2)}\n`,
});

// --- docs/rules/*.md --------------------------------------------------------
for (const info of RULE_REGISTRY) {
  const lines: string[] = [];
  lines.push(`# effect-v4/${info.name}`);
  lines.push("");
  lines.push(
    `Family: ${info.family} · Default severity: ${info.defaultSeverity}${info.strictOnly ? " · strict preset only" : ""}`,
  );
  lines.push("");
  lines.push("## Rationale");
  lines.push("");
  lines.push(info.rationale);
  lines.push("");
  lines.push("## Applicability (domains select rules, never severity)");
  lines.push("");
  lines.push(`- Roles: ${info.appliesToRoles.join(", ")}`);
  lines.push(`- Required boundary: ${info.requiresBoundary ?? "none"}`);
  lines.push("");
  lines.push("## Limitation");
  lines.push("");
  lines.push(info.limitation);
  lines.push("");
  if (info.tsgoOverlap !== null) {
    lines.push("## Type-aware companion (@effect/tsgo)");
    lines.push("");
    lines.push(info.tsgoOverlap);
    lines.push("");
  }
  if (info.name === "no-ambient-console") {
    lines.push("## Suppression contract");
    lines.push("");
    lines.push("```ts");
    lines.push("// oxlint-effect-v4 allow(no-ambient-console): dev only: <nonempty reason>");
    lines.push("console.dir(payload);");
    lines.push("```");
    lines.push("");
    lines.push(
      "The directive must target exactly this rule and carry a nonempty `dev only:` reason; it applies to the next line (or its own line when trailing). Broad, missing-reason, and unused directives are themselves reported.",
    );
    lines.push("");
  }
  derivations.push({
    path: `docs/rules/${info.name}.md`,
    content: `${lines.join("\n").trimEnd()}\n`,
  });
}

// --- docs/tsgo-boundary.md --------------------------------------------------
{
  const lines: string[] = [];
  lines.push("# Type-aware companion boundary (@effect/tsgo)");
  lines.push("");
  lines.push(
    "Oxlint JavaScript plugins receive syntax, scope, code-path, and project APIs — not TypeScript type information. This package therefore never claims type-aware analysis and delegates the following Effect diagnostics to `@effect/tsgo`: floating Effects, leaking requirements, strict provision, unsafe Effect assertions, unknown error values, outdated Effect APIs, promise-returning expressions, and typed `.then`/`.catch`/`.finally` misuse.",
  );
  lines.push("");
  lines.push("Installing or patching TSGO is outside this plugin's runtime.");
  lines.push("");
  lines.push("## Overlaps and authority");
  lines.push("");
  lines.push("| rule | overlap | authority |");
  lines.push("| --- | --- | --- |");
  for (const info of RULE_REGISTRY) {
    if (info.tsgoOverlap === null) continue;
    lines.push(`| \`effect-v4/${info.name}\` | ${info.tsgoOverlap} | split as described |`);
  }
  lines.push("");
  lines.push(
    "Presets keep one authoritative diagnostic per concern: this plugin owns syntactic execution sites, promise syntax, and ambient globals; TSGO owns everything requiring types. Running both produces complementary, not duplicate, diagnostics.",
  );
  derivations.push({ path: "docs/tsgo-boundary.md", content: `${lines.join("\n")}\n` });
}

// --- generated/matrix.json --------------------------------------------------
derivations.push({
  path: "generated/matrix.json",
  content: `${JSON.stringify({ groups: MATRIX }, null, 2)}\n`,
});

// --- README rules section ---------------------------------------------------
{
  const begin = "<!-- BEGIN GENERATED RULES (bun run gen) -->";
  const end = "<!-- END GENERATED RULES -->";
  const table: string[] = [];
  table.push(begin);
  table.push("");
  table.push("| rule | family | roles | boundary | preset |");
  table.push("| --- | --- | --- | --- | --- |");
  for (const info of RULE_REGISTRY) {
    table.push(
      `| [\`effect-v4/${info.name}\`](./docs/rules/${info.name}.md) | ${info.family} | ${info.appliesToRoles.join(", ")} | ${info.requiresBoundary ?? "—"} | ${info.strictOnly ? "strict" : "recommended"} |`,
    );
  }
  table.push("");
  table.push(
    `Domains — roles: ${ROLES.join(", ")}; platforms: ${PLATFORMS.join(", ")}; boundaries: ${BOUNDARIES.join(", ")}.`,
  );
  table.push(end);

  const readmePath = join(repoRoot, "README.md");
  const readme = readFileSync(readmePath, "utf8");
  const beginIndex = readme.indexOf(begin);
  const endIndex = readme.indexOf(end);
  if (beginIndex < 0 || endIndex < 0) {
    throw new Error("README.md is missing the generated-rules markers");
  }
  const updated =
    readme.slice(0, beginIndex) + table.join("\n") + readme.slice(endIndex + end.length);
  derivations.push({ path: "README.md", content: updated });
}

// --- apply or check ---------------------------------------------------------
let drift = false;
for (const { path, content } of derivations) {
  const absolute = join(repoRoot, path);
  let current: string | null = null;
  try {
    current = readFileSync(absolute, "utf8");
  } catch {
    current = null;
  }
  if (current === content) continue;
  if (mode === "write") {
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, content);
    console.log(`generated ${path}`);
  } else {
    console.error(`DRIFT: ${path} is out of date (run: bun run gen)`);
    drift = true;
  }
}

if (mode === "check" && drift) process.exit(1);
console.log(mode === "check" ? "generation check: no drift" : "generation complete");
