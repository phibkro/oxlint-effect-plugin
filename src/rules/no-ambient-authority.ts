/**
 * Ambient capability: reject ambient clock, random, cryptographic, network,
 * timer, environment, filesystem, process, and runtime authority where an
 * Effect service or injected capability owns the operation.
 *
 * Deterministic constructors such as `new Date(capturedMillis)` are admitted;
 * observations such as `new Date()` and `Date.now()` are rejected. Capturing
 * nondeterminism in a thunk does not launder authority: `Effect.sync(() =>
 * Date.now())` still hides an ambient clock from the Effect environment.
 * Local shadowing is respected via scope analysis.
 */

import type { Program } from "../ast.js";
import type { Rule, RuleContext } from "../plugin-api.js";
import {
  classifyAmbientUse,
  collectAmbientReferences,
  domainOptionsOf,
  formatMessage,
  ruleOptionRecord,
} from "../rule-support.js";

export const RULE_NAME = "no-ambient-authority";

export const CAPABILITIES = [
  "clock",
  "random",
  "crypto",
  "network",
  "timer",
  "environment",
  "filesystem",
  "process",
  "runtime",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const REMEDIES: Readonly<Record<Capability, string>> = {
  clock: "Use the Effect Clock service (effect/Clock, e.g. Clock.currentTimeMillis).",
  random: "Use the Effect Random service (effect/Random, e.g. Random.next).",
  crypto: "Inject a declared cryptographic capability as an Effect service.",
  network: "Use an injected HTTP/socket capability (e.g. effect/unstable/http) provided by the composition root.",
  timer: "Use Effect scheduling (Effect.sleep, Effect.schedule) instead of ambient timers.",
  environment: "Read configuration through effect/Config and a ConfigProvider supplied at the composition root.",
  filesystem: "Use a declared FileSystem service provided by a platform layer at the composition root.",
  process: "Use a declared process/command capability provided by a platform layer at the composition root.",
  runtime: "Access runtime facilities through declared Effect services bound at the composition root.",
};

interface GlobalAuthority {
  readonly capability: Capability;
  /** Restrict to these member names; `null` means any use of the global. */
  readonly members: readonly string[] | null;
  /** When true, a bare call such as `fetch(...)` is the authority. */
  readonly callable: boolean;
}

const GLOBAL_AUTHORITIES: ReadonlyMap<string, GlobalAuthority> = new Map<string, GlobalAuthority>([
  ["Math", { capability: "random", members: ["random"], callable: false }],
  ["crypto", { capability: "crypto", members: null, callable: false }],
  ["performance", { capability: "clock", members: ["now", "timeOrigin"], callable: false }],
  ["fetch", { capability: "network", members: null, callable: true }],
  ["XMLHttpRequest", { capability: "network", members: null, callable: false }],
  ["WebSocket", { capability: "network", members: null, callable: false }],
  ["EventSource", { capability: "network", members: null, callable: false }],
  ["setTimeout", { capability: "timer", members: null, callable: true }],
  ["setInterval", { capability: "timer", members: null, callable: true }],
  ["setImmediate", { capability: "timer", members: null, callable: true }],
  ["clearTimeout", { capability: "timer", members: null, callable: true }],
  ["clearInterval", { capability: "timer", members: null, callable: true }],
  ["queueMicrotask", { capability: "timer", members: null, callable: true }],
  ["process", { capability: "process", members: null, callable: false }],
  ["Deno", { capability: "runtime", members: null, callable: false }],
  ["Bun", { capability: "runtime", members: null, callable: false }],
]);

/** Node/Bun module specifiers that carry ambient authority when imported. */
const MODULE_AUTHORITIES: ReadonlyMap<string, Capability> = new Map<string, Capability>([
  ["fs", "filesystem"],
  ["fs/promises", "filesystem"],
  ["child_process", "process"],
  ["process", "process"],
  ["os", "runtime"],
  ["net", "network"],
  ["http", "network"],
  ["https", "network"],
  ["http2", "network"],
  ["dns", "network"],
  ["tls", "network"],
  ["dgram", "network"],
  ["crypto", "crypto"],
  ["worker_threads", "runtime"],
  ["cluster", "runtime"],
  ["timers", "timer"],
  ["timers/promises", "timer"],
  ["perf_hooks", "clock"],
  ["vm", "runtime"],
  ["v8", "runtime"],
  ["bun", "runtime"],
]);

function moduleAuthority(specifier: string): Capability | null {
  const bare = specifier.startsWith("node:")
    ? specifier.slice("node:".length)
    : specifier.startsWith("bun:")
      ? "bun"
      : specifier;
  return MODULE_AUTHORITIES.get(bare) ?? null;
}

function isEnvironmentMember(globalName: string, property: string | null): boolean {
  return (
    (globalName === "process" && (property === "env" || property === "argv")) ||
    ((globalName === "Deno" || globalName === "Bun") && property === "env")
  );
}

export const noAmbientAuthority: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject ambient clock, random, crypto, network, timer, environment, filesystem, process, and runtime authority where an Effect service owns the operation.",
    },
    schema: [
      {
        type: "object",
        properties: {
          role: { type: "string" },
          platform: { type: "string" },
          boundaries: { type: "array", items: { type: "string" } },
          capabilities: {
            type: "array",
            items: { type: "string", enum: [...CAPABILITIES] },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context: RuleContext) {
    const domains = domainOptionsOf(context);
    const optionRecord = ruleOptionRecord(context);
    const selected = Array.isArray(optionRecord["capabilities"])
      ? new Set(
          (optionRecord["capabilities"] as unknown[]).filter(
            (value): value is Capability =>
              typeof value === "string" && (CAPABILITIES as readonly string[]).includes(value),
          ),
        )
      : new Set<Capability>(CAPABILITIES);

    const report = (node: import("../ast.js").Node, capability: Capability, finding: string): void => {
      if (!selected.has(capability)) return;
      context.report({
        node,
        message: formatMessage({
          rule: RULE_NAME,
          finding,
          remedy: REMEDIES[capability],
          domains,
        }),
      });
    };

    return {
      ImportDeclaration(node: import("../ast.js").ImportDeclaration) {
        const specifier = node.source.value;
        if (typeof specifier !== "string") return;
        const capability = moduleAuthority(specifier);
        if (capability !== null) {
          report(
            node,
            capability,
            `Importing "${specifier}" takes ambient ${capability} authority instead of a declared Effect capability.`,
          );
        }
      },
      "Program:exit"(program: Program) {
        const globalScope = context.sourceCode.getScope(program);
        const ambient = collectAmbientReferences(globalScope);

        for (const identifier of ambient.get("Date") ?? []) {
          const use = classifyAmbientUse(identifier);
          if (use.kind === "new") {
            if (use.argumentCount === 0) {
              report(
                use.reportNode,
                "clock",
                "`new Date()` observes the ambient clock; deterministic `new Date(capturedMilliseconds)` is admitted.",
              );
            }
            continue;
          }
          if (use.kind === "call") {
            report(use.reportNode, "clock", "`Date()` observes the ambient clock.");
            continue;
          }
          if (use.kind === "member" && (use.property === "now" || use.property === null)) {
            report(use.reportNode, "clock", "`Date.now()` observes the ambient clock.");
          }
        }

        for (const [globalName, authority] of GLOBAL_AUTHORITIES) {
          for (const identifier of ambient.get(globalName) ?? []) {
            const use = classifyAmbientUse(identifier);
            const capability = isEnvironmentMember(globalName, use.property)
              ? "environment"
              : authority.capability;
            if (use.kind === "member") {
              if (authority.members === null || use.property === null || authority.members.includes(use.property)) {
                report(
                  use.reportNode,
                  capability,
                  `Ambient \`${globalName}${use.property === null ? "[...]" : `.${use.property}`}\` exercises ${capability} authority outside the Effect environment.`,
                );
              }
              continue;
            }
            if (use.kind === "call" && authority.callable) {
              report(
                use.reportNode,
                capability,
                `Ambient \`${globalName}(...)\` exercises ${capability} authority outside the Effect environment.`,
              );
              continue;
            }
            if (use.kind === "new" && (globalName === "XMLHttpRequest" || globalName === "WebSocket" || globalName === "EventSource")) {
              report(
                use.reportNode,
                capability,
                `Ambient \`new ${globalName}(...)\` exercises ${capability} authority outside the Effect environment.`,
              );
            }
          }
        }
      },
    };
  },
};
