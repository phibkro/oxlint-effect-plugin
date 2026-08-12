/**
 * Generation gate: every derived artifact is a pure function of its root.
 *
 *   root: package.json          → src/version.ts, compatibility.json
 *   root: src/registry.ts       → docs/rules/*.md, docs/tsgo-boundary.md,
 *                                 guidance/**, README.md rules section
 *   root: fixtures/matrix.ts    → generated/matrix.json (consumer runners)
 *
 * Usage: bun run scripts/generate.ts write   — materialize derivations
 *        bun run scripts/generate.ts check   — fail on any drift
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { MATRIX } from "../fixtures/matrix.js";
import { BOUNDARIES, PLATFORMS, ROLES } from "../src/domains.js";
import { EFFECTTS_KNOWLEDGE, IMPORT_CLOSURE_DEFINITION, RULE_REGISTRY } from "../src/registry.js";
import {
  EFFECT_COMPATIBILITY,
  PACKAGE_NAME,
  REVIEWED_DEPENDENCIES,
  REVIEWED_NODE_ENGINE,
  REVIEWED_RUNTIMES,
} from "./compatibility-policy.js";

const repoRoot = join(import.meta.dir, "..");
const mode = process.argv[2];
if (mode !== "write" && mode !== "check") {
  console.error("usage: generate.ts write|check");
  process.exit(2);
}

const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
  name: string;
  version: string;
  effectCompatibility: typeof EFFECT_COMPATIBILITY;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  engines: { node: string };
};

interface Derivation {
  readonly path: string;
  readonly content: string;
}

const derivations: Derivation[] = [];

if (pkg.name !== PACKAGE_NAME) {
  throw new Error(`package.json name must equal ${PACKAGE_NAME}; received ${pkg.name}`);
}
if (JSON.stringify(pkg.effectCompatibility) !== JSON.stringify(EFFECT_COMPATIBILITY)) {
  throw new Error("package.json effectCompatibility metadata drifted");
}

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
  const reviewed = REVIEWED_DEPENDENCIES[name as keyof typeof REVIEWED_DEPENDENCIES];
  if (reviewed !== undefined && version !== reviewed) {
    throw new Error(`package.json ${name} must equal reviewed ${reviewed}; received ${version}`);
  }
  return version;
};
if (pkg.peerDependencies["oxlint"] !== REVIEWED_DEPENDENCIES.oxlint) {
  throw new Error(`package.json peer oxlint must equal ${REVIEWED_DEPENDENCIES.oxlint}`);
}
if (pkg.engines.node !== REVIEWED_NODE_ENGINE) {
  throw new Error(`package.json Node engines must equal ${REVIEWED_NODE_ENGINE}`);
}

const compatibility = {
  package: { name: pkg.name, version: pkg.version },
  technology: EFFECT_COMPATIBILITY,
  reviewed: {
    oxlint: devPin("oxlint"),
    oxfmt: devPin("oxfmt"),
    typescript: devPin("typescript"),
    effect: devPin("effect"),
    "@effect/platform-node": devPin("@effect/platform-node"),
    "@effect/platform-bun": devPin("@effect/platform-bun"),
    "@effect/tsgo": devPin("@effect/tsgo"),
    "oxlint-tsgolint": devPin("oxlint-tsgolint"),
  },
  runtimes: {
    bun: {
      role: "default development runtime and packed consumer",
      reviewed: REVIEWED_RUNTIMES.bun,
      reviewPolicy: "exact",
    },
    node: {
      role: "packed consumer",
      reviewed: REVIEWED_RUNTIMES.node,
      reviewPolicy: "exact",
      engines: pkg.engines.node,
    },
    deno: {
      role: "declared compatibility journey only",
      reviewed: REVIEWED_RUNTIMES.deno,
      reviewPolicy: "exact",
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
  typedCompanions: {
    oxlint: {
      package: "oxlint-tsgolint",
      reviewed: devPin("oxlint-tsgolint"),
      scope:
        "Generic built-in typed Oxlint rules via options.typeAware; custom JavaScript plugin rules do not receive type information.",
    },
    effect: {
      package: "@effect/tsgo",
      reviewed: devPin("@effect/tsgo"),
      scope:
        "Effect-specific typed diagnostics, language-service features, and upstream Oxlint presets. This package owns project-context policy and keeps overlapping syntax diagnostics disabled when its profile rules own them.",
    },
    residual:
      "The pinned companions expose no domain-aware general rule for arbitrary typed .then/.catch/.finally chains; that policy remains an explicit typed-analysis gap.",
  },
} as const;

derivations.push({
  path: "compatibility.json",
  content: `${JSON.stringify(compatibility, null, 2)}\n`,
});

// --- docs/rules/*.md --------------------------------------------------------
for (const info of RULE_REGISTRY) {
  const lines: string[] = [];
  lines.push(`# effect/${info.rule}`);
  lines.push("");
  lines.push(
    `Code: ${info.code} · Family: ${info.family} · Default severity: ${info.defaultSeverity}`,
  );
  lines.push("");
  lines.push("## Invariant");
  lines.push("");
  lines.push(`${info.invariant}: ${info.summary}`);
  lines.push("");
  lines.push(
    info.defaultSeverity === "off" ? "## Why this policy rejects it" : "## Why EffectTS rejects it",
  );
  lines.push("");
  lines.push(info.rationale);
  lines.push("");
  lines.push("## Help");
  lines.push("");
  lines.push(info.diagnostic.help);
  lines.push("");
  lines.push(`Proof: ${info.proofSources.join(", ")}.`);
  lines.push("");
  lines.push("## Applicability");
  lines.push("");
  lines.push(`- Strictness: ${info.strictness.join(", ")}`);
  lines.push(`- Roles: ${info.applicability.roles.join(", ")}`);
  lines.push(`- Boundaries: ${info.applicability.boundaries.join(", ") || "none"}`);
  lines.push("");
  if (info.defaultSeverity === "off") {
    lines.push(
      "This opt-in rule is omitted until `rules` or `severityOverrides` selects a non-`off` severity.",
    );
    lines.push("");
  }
  if (Object.keys(info.defaultOptions).length > 0) {
    lines.push("## Default options");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(info.defaultOptions, null, 2));
    lines.push("```");
    lines.push("");
    lines.push(`Override these values through \`groups[].ruleOptions["${info.rule}"]\`.`);
    lines.push("");
  }
  lines.push("## Limitations");
  lines.push("");
  for (const limitation of info.limitations) lines.push(`- ${limitation}`);
  lines.push("");
  if (info.tsgo.overlap.length > 0) {
    lines.push("## Type-aware companion (@effect/tsgo)");
    lines.push("");
    lines.push(`Overlaps: ${info.tsgo.overlap.join(", ")}.`);
    lines.push("");
    lines.push(info.tsgo.authority);
    lines.push("");
  }
  if (info.replacements.length > 0) {
    lines.push("## Replacements");
    lines.push("");
    for (const replacement of info.replacements) {
      lines.push(
        `- \`${replacement.from}\` → \`${replacement.to}\` (${replacement.applicability})`,
      );
    }
    lines.push("");
  }
  if (info.suppression === "local-reasoned") {
    lines.push("## Local exception");
    lines.push("");
    lines.push("```ts");
    lines.push(`// oxlint-effect-plugin allow(${info.rule}):`);
    lines.push("// reason: <nonempty reason>");
    lines.push("<next syntax node>");
    lines.push("```");
    lines.push("");
    lines.push(
      "The directive targets exactly one rule and the next syntax node in the same lexical block. Broad, duplicate, missing-reason, misplaced, unused, and stale directives fail the escape audit.",
    );
    lines.push("");
  }
  derivations.push({
    path: `docs/rules/${info.rule}.md`,
    content: `${lines.join("\n").trimEnd()}\n`,
  });
}

{
  const info = IMPORT_CLOSURE_DEFINITION;
  derivations.push({
    path: "docs/import-closure.md",
    content: [
      "# EffectTS import closure",
      "",
      `Code: ${info.code} · Family: ${info.family}`,
      "",
      "## Invariant",
      "",
      `${info.invariant}: ${info.summary}`,
      "",
      "## Why EffectTS rejects it",
      "",
      info.rationale,
      "",
      "## Help",
      "",
      info.diagnostic.help,
      "",
      `Proof: ${info.proofSources.join(", ")}.`,
      "",
      "Type-only edges are admitted. Core Effect imports are admitted. Governed project edges follow the role graph. Trusted-pure packages require an exact specifier and nonempty reason. Raw package imports belong only to a runtime adapter that declares the package root.",
      "",
      "Trust is a reviewed project assertion, not static proof of package purity.",
      "",
    ].join("\n"),
  });
}

// --- docs/tsgo-boundary.md --------------------------------------------------
{
  const lines: string[] = [];
  lines.push("# Type-aware companion boundary (@effect/tsgo)");
  lines.push("");
  lines.push(
    "Oxlint JavaScript plugins receive syntax, lexical scope, code-path, and project APIs — not TypeScript type information. This package's custom rules therefore remain AST/scope rules even when Oxlint runs with `options.typeAware: true`.",
  );
  lines.push("");
  lines.push("## Three coordinated analysis layers");
  lines.push("");
  lines.push(
    "1. **This package:** domain-aware custom policy over Oxc AST and resolved lexical bindings.",
  );
  lines.push(
    `2. **Oxlint typed engine:** generic built-in typed rules via \`options.typeAware: true\`, backed by exactly pinned \`oxlint-tsgolint@${devPin("oxlint-tsgolint")}\`. This does not inject types into JavaScript plugin rules.`,
  );
  lines.push(
    `3. **Effect language service:** Effect-specific typed diagnostics via exactly pinned \`@effect/tsgo@${devPin("@effect/tsgo")}\`, including floating Effects, requirements/error-channel diagnostics, strict provision, unsafe assertions, and outdated APIs.`,
  );
  lines.push("");
  lines.push(
    "The repository gate observes one real generic Oxlint typed diagnostic and one real `floatingEffect` diagnostic from @effect/tsgo. Both companions are development-only and absent from this package's runtime graph. The reviewed TSGO release also exports `@effect/tsgo/oxlint-presets`; this package does not import those presets into its runtime or enable overlapping rules twice.",
  );
  lines.push("");
  lines.push("```jsonc");
  lines.push("// .oxlintrc.json — generic built-in typed Oxlint rules");
  lines.push('{ "options": { "typeAware": true } }');
  lines.push("```");
  lines.push("");
  lines.push("```jsonc");
  lines.push("// tsconfig.json — Effect-specific typed diagnostics");
  lines.push(
    '{ "compilerOptions": { "plugins": [{ "name": "@effect/language-service", "diagnosticSeverity": { "floatingEffect": "error", "missingEffectContext": "error", "missingEffectError": "error", "missingLayerContext": "error", "strictEffectProvide": "error", "unsafeEffectTypeAssertion": "error", "lazyPromiseInEffectSync": "error", "asyncFunction": "off", "newPromise": "off", "globalConsole": "off", "globalConsoleInEffect": "off" } }] } }',
  );
  lines.push("```");
  lines.push("");
  lines.push("## Non-duplicating Effect TSGO configuration");
  lines.push("");
  lines.push(
    "EffectTS requires these typed diagnostics at `error`: `floatingEffect`, `missingEffectContext`, `missingEffectError`, `missingLayerContext`, `strictEffectProvide`, `unsafeEffectTypeAssertion`, and `lazyPromiseInEffectSync`. When this package owns the corresponding project-context syntax policy, keep these @effect/tsgo diagnostics off to avoid duplicate reports: `asyncFunction`, `cryptoRandomUUID`, `cryptoRandomUUIDInEffect`, `globalConsole`, `globalConsoleInEffect`, `globalDate`, `globalDateInEffect`, `globalFetch`, `globalFetchInEffect`, `globalRandom`, `globalRandomInEffect`, `globalTimers`, `globalTimersInEffect`, `newPromise`, `nodeBuiltinImport`, `preferSchemaOverJson`, `processEnv`, and `processEnvInEffect`. The reviewed TSGO release remains authoritative for typed Effect facts.",
  );
  lines.push("");
  lines.push(
    "The pinned companions expose no domain-aware general diagnostic for arbitrary typed `.then`/`.catch`/`.finally` chains. This package deliberately does not guess from member spelling; that requested policy remains an explicit typed-analysis gap until a companion exposes the required type-and-domain hook.",
  );
  lines.push("");
  lines.push("## Overlaps and authority");
  lines.push("");
  lines.push("| rule | overlap | authority |");
  lines.push("| --- | --- | --- |");
  for (const info of RULE_REGISTRY) {
    if (info.tsgo.overlap.length === 0) continue;
    lines.push(
      `| \`effect/${info.rule}\` | ${info.tsgo.overlap.join(", ")} | ${info.tsgo.authority} |`,
    );
  }
  lines.push("");
  lines.push(
    "The rule registry records every known overlap. The documented configuration keeps duplicate syntax diagnostics off while retaining @effect/tsgo diagnostics that require types. Project-context policy remains here; typed Effect facts and editor semantics remain upstream-owned.",
  );
  derivations.push({ path: "docs/tsgo-boundary.md", content: `${lines.join("\n")}\n` });
}

// --- guidance/** ------------------------------------------------------------
{
  const ruleLines = RULE_REGISTRY.map(
    (info) =>
      `- ${info.code} \`effect/${info.rule}\`: ${info.invariant}. ${info.diagnostic.help} Default severity: ${info.defaultSeverity}. Proof: ${info.proofSources.join(", ")}.`,
  );
  const workflow = [
    "1. Read the project role, platform, boundary, and trusted-dependency configuration.",
    "2. Keep pure local computation as plain TypeScript.",
    "3. Use Effect for effectful computation, Schema for domain and representation boundaries, services for capabilities, Layers for implementations, and Scope for lifetimes.",
    "4. Run EffectTS enforcement and @effect/tsgo.",
    "5. Apply only machine-applicable fixes; treat other suggestions as semantic refactors.",
    "6. Use a narrow two-line reasoned exception only for genuine interop.",
  ];
  const escape = [
    "```ts",
    "// oxlint-effect-plugin allow(<exact-rule>):",
    "// reason: <why this boundary cannot yet be Effect-native>",
    "<next syntax node>",
    "```",
  ];
  derivations.push({
    path: "guidance/effectts-knowledge.json",
    content: `${JSON.stringify(
      {
        schemaVersion: 2,
        technology: "effect-v4",
        rules: EFFECTTS_KNOWLEDGE,
      },
      null,
      2,
    )}\n`,
  });
  derivations.push({
    path: "guidance/AGENTS.fragment.md",
    content: [
      "# EffectTS project profile",
      "",
      "TypeScript is the host language. EffectTS is the default-closed application semantics profile.",
      "",
      "## Workflow",
      "",
      ...workflow,
      "",
      "## Enforced invariants",
      "",
      ...ruleLines,
      `- ${IMPORT_CLOSURE_DEFINITION.code} import closure: ${IMPORT_CLOSURE_DEFINITION.diagnostic.help}`,
      "",
      "## Reasoned local exception",
      "",
      ...escape,
      "",
    ].join("\n"),
  });
  derivations.push({
    path: "guidance/skills/effectts-programming/SKILL.md",
    content: [
      "---",
      "name: effectts-programming",
      "description: Implement and repair TypeScript inside the project's EffectTS profile.",
      "---",
      "",
      "# EffectTS programming",
      "",
      ...workflow,
      "",
      "Read [references/rules.md](references/rules.md) for the stable rule codes, invariants, repairs, and proof limits.",
      "",
    ].join("\n"),
  });
  derivations.push({
    path: "guidance/skills/effectts-programming/references/rules.md",
    content: ["# EffectTS rule reference", "", ...ruleLines, ""].join("\n"),
  });
  derivations.push({
    path: "guidance/prompts/implement.md",
    content:
      "Implement the requested change inside the configured EffectTS role and boundaries. Keep pure computation in TypeScript. Use Effect-native computation, failures, capabilities, resources, concurrency, observability, and Schema boundaries. Run EffectTS and @effect/tsgo; do not bypass diagnostics.\n",
  });
  derivations.push({
    path: "guidance/prompts/refactor-to-effect.md",
    content:
      "Refactor the reported ordinary TypeScript mechanism to the Effect concept named by the diagnostic. Preserve caller contracts and resource ownership. Apply only machine-applicable edits automatically; explain boundary-required and refactor-required changes.\n",
  });
  derivations.push({
    path: "guidance/prompts/diagnose.md",
    content:
      "Diagnose each EffectTS finding by stable code. State the failed invariant, proof source, analysis limit, owning Effect concept, safe repair class, and any explicit boundary decision still required.\n",
  });
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
  table.push("| rule | code | family | default | roles | boundary | strictness |");
  table.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const info of RULE_REGISTRY) {
    table.push(
      `| [\`effect/${info.rule}\`](./docs/rules/${info.rule}.md) | ${info.code} | ${info.family} | ${info.defaultSeverity} | ${info.applicability.roles.join(", ")} | ${info.applicability.boundaries.join(", ") || "—"} | ${info.strictness.join(", ")} |`,
    );
  }
  table.push("");
  table.push(
    `Domains — roles: ${ROLES.join(", ")}; platforms: ${PLATFORMS.join(", ")}; boundaries: ${BOUNDARIES.join(", ")}.`,
  );
  table.push(end);

  const readmePath = join(repoRoot, "README.md");
  const readme = readFileSync(readmePath, "utf8");
  const staleConfigurationPatterns = [
    /\b(?:expandDomains|expandImportClosurePolicy|ExpandInput|DomainGroup|RulePreset)\b/,
    /["']?(?:technology|profile|preset)["']?\s*:/,
  ];
  for (const pattern of staleConfigurationPatterns) {
    if (pattern.test(readme)) {
      throw new Error(`README.md retains obsolete configuration syntax: ${pattern.source}`);
    }
  }
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
