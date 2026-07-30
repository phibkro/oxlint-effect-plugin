/**
 * Platform portability: reject cross-runtime imports and globals according to
 * the selected runtime-platform domain.
 *
 * Each concrete runtime admits only its own declared built-ins, globals, and
 * platform layers; compatibility APIs provided by another runtime are not
 * silently portable. `portable` rejects every concrete-runtime surface.
 * Official platform live-layer packages are admitted only in a matching
 * `composition-root` or `runtime-adapter` role.
 */

import type { Program } from "../ast.js";
import type { Rule, RuleContext } from "../plugin-api.js";
import type { Platform, Role } from "../domains.js";
import {
  collectAmbientReferences,
  collectAmbientGlobalObjectMembers,
  DOMAIN_SCHEMA_PROPERTIES,
  domainOptionsOf,
  formatMessage,
  platformPackageTarget,
  REQUIRED_DOMAIN_SCHEMA_KEYS,
  ruleOptionRecord,
  staticStringValue,
} from "../rule-support.js";

export const RULE_NAME = "no-cross-runtime";

const NODE_BUILTIN_MODULES = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "path/posix",
  "path/win32",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "timers",
  "timers/promises",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

/** Runtime that a module specifier belongs to, when identifying one. */
function specifierRuntime(specifier: string): Platform | null {
  if (specifier.startsWith("node:")) return "node";
  if (specifier === "bun" || specifier.startsWith("bun:")) return "bun";
  if (specifier.startsWith("jsr:") || specifier.startsWith("https:")) return "deno";
  if (NODE_BUILTIN_MODULES.has(specifier)) return "node";
  return null;
}

/** Runtime-identifying globals. A name may belong to several platforms. */
const GLOBAL_RUNTIMES: ReadonlyMap<string, readonly Platform[]> = new Map<
  string,
  readonly Platform[]
>([
  ["process", ["node"]],
  ["Buffer", ["node"]],
  ["require", ["node"]],
  ["__dirname", ["node"]],
  ["__filename", ["node"]],
  ["global", ["node"]],
  ["Bun", ["bun"]],
  ["Deno", ["deno"]],
  ["window", ["browser"]],
  ["document", ["browser"]],
  ["alert", ["browser"]],
  ["localStorage", ["browser"]],
  ["sessionStorage", ["browser"]],
  ["history", ["browser"]],
  ["location", ["browser", "web-worker"]],
  ["navigator", ["browser", "web-worker"]],
  ["self", ["browser", "web-worker"]],
  ["importScripts", ["web-worker"]],
]);

/**
 * `self` is legal in both browser and worker code, but in the browser domain
 * it is only a window alias; treat `importScripts` and `document` as the
 * distinguishing markers and keep `self` admitted in both.
 */
const ROLES_ADMITTING_PLATFORM_LAYERS: readonly Role[] = ["composition-root", "runtime-adapter"];

export const noCrossRuntime: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject imports and globals from runtimes other than the declared runtime-platform domain; admit official platform layers only in a matching composition-root or runtime-adapter.",
    },
    schema: [
      {
        type: "object",
        properties: {
          ...DOMAIN_SCHEMA_PROPERTIES,
          extraAllowedModules: { type: "array", items: { type: "string" } },
        },
        required: REQUIRED_DOMAIN_SCHEMA_KEYS,
        additionalProperties: false,
      },
    ],
  },
  create(context: RuleContext) {
    const domains = domainOptionsOf(context);
    const platform: Platform = domains.platform ?? "portable";
    const role: Role | undefined = domains.role;
    const optionRecord = ruleOptionRecord(context);
    const extraAllowed = new Set(
      Array.isArray(optionRecord["extraAllowedModules"])
        ? (optionRecord["extraAllowedModules"] as unknown[]).filter(
            (value): value is string => typeof value === "string",
          )
        : [],
    );

    const checkSpecifier = (node: import("../ast.js").Node, specifier: string): void => {
      if (extraAllowed.has(specifier)) return;

      const layerTarget = platformPackageTarget(specifier);
      if (layerTarget !== null) {
        const roleAdmits = role !== undefined && ROLES_ADMITTING_PLATFORM_LAYERS.includes(role);
        const platformMatches = layerTarget === platform;
        if (!roleAdmits || !platformMatches) {
          context.report({
            node,
            message: formatMessage({
              rule: RULE_NAME,
              finding: `Platform live-layer package "${specifier}" is admitted only in a composition-root or runtime-adapter declared for platform "${layerTarget}" (this file declares ${role ?? "no role"} on ${platform}).`,
              remedy:
                "Move live-layer selection to the matching composition root or runtime adapter.",
              domains,
            }),
          });
        }
        return;
      }

      const runtime = specifierRuntime(specifier);
      if (runtime !== null && runtime !== platform) {
        context.report({
          node,
          message: formatMessage({
            rule: RULE_NAME,
            finding: `Import "${specifier}" binds the ${runtime} runtime inside the declared ${platform} platform domain; compatibility APIs from another runtime are not silently portable.`,
            remedy:
              platform === "portable"
                ? "Keep portable code free of concrete-runtime modules; inject the capability as an Effect service."
                : `Use the declared ${platform} surface, or re-declare this file's runtime-platform domain.`,
            domains,
          }),
        });
      }
    };

    return {
      ImportDeclaration(node: import("../ast.js").ImportDeclaration) {
        const specifier = staticStringValue(node.source);
        if (specifier !== null) checkSpecifier(node, specifier);
      },
      ImportExpression(node: import("../ast.js").ImportExpression) {
        const specifier = staticStringValue(node.source);
        if (specifier !== null) checkSpecifier(node, specifier);
      },
      ExportNamedDeclaration(node: import("../ast.js").ExportNamedDeclaration) {
        const specifier = staticStringValue(node.source);
        if (specifier !== null) checkSpecifier(node, specifier);
      },
      ExportAllDeclaration(node: import("../ast.js").ExportAllDeclaration) {
        const specifier = staticStringValue(node.source);
        if (specifier !== null) checkSpecifier(node, specifier);
      },
      "Program:exit"(program: Program) {
        const globalScope = context.sourceCode.getScope(program);
        const ambient = collectAmbientReferences(globalScope);
        for (const [name, runtimes] of GLOBAL_RUNTIMES) {
          if (runtimes.includes(platform)) continue;
          for (const identifier of ambient.get(name) ?? []) {
            context.report({
              node: identifier,
              message: formatMessage({
                rule: RULE_NAME,
                finding: `Global \`${name}\` identifies the ${runtimes.join("/")} runtime inside the declared ${platform} platform domain.`,
                remedy:
                  platform === "portable"
                    ? "Keep portable code free of runtime-identifying globals; inject the capability as an Effect service."
                    : `Use the declared ${platform} surface, or re-declare this file's runtime-platform domain.`,
                domains,
              }),
            });
          }
        }
        for (const qualified of collectAmbientGlobalObjectMembers(ambient)) {
          const runtimes = GLOBAL_RUNTIMES.get(qualified.globalName);
          if (runtimes === undefined || runtimes.includes(platform)) continue;
          context.report({
            node: qualified.use.reportNode,
            message: formatMessage({
              rule: RULE_NAME,
              finding: `Qualified global \`${qualified.object.name}.${qualified.globalName}\` identifies the ${runtimes.join("/")} runtime inside the declared ${platform} platform domain.`,
              remedy:
                platform === "portable"
                  ? "Keep portable code free of runtime-identifying globals; inject the capability as an Effect service."
                  : `Use the declared ${platform} surface, or re-declare this file's runtime-platform domain.`,
              domains,
            }),
          });
        }
      },
    };
  },
};
