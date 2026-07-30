/**
 * Orthogonal domain vocabulary from design spec 0001.
 *
 * Domains determine rule applicability, never severity. The four axes are
 * independent: technology, architectural role, runtime platform, and
 * semantic boundary.
 */

export const TECHNOLOGIES = ["effect-v4"] as const;
export type Technology = (typeof TECHNOLOGIES)[number];

export const ROLES = [
  "pure-library",
  "effect-library",
  "service",
  "application",
  "composition-root",
  "runtime-adapter",
  "test",
] as const;
export type Role = (typeof ROLES)[number];

export const PLATFORMS = ["portable", "node", "bun", "deno", "browser", "web-worker"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const BOUNDARIES = [
  "external-data",
  "observability",
  "security-sensitive",
  "persistence",
] as const;
export type Boundary = (typeof BOUNDARIES)[number];

export interface DomainDescription {
  readonly id: string;
  readonly axis: "technology" | "role" | "platform" | "boundary";
  readonly summary: string;
}

export const DOMAIN_DESCRIPTIONS: readonly DomainDescription[] = [
  {
    id: "effect-v4",
    axis: "technology",
    summary:
      "Code written against Effect v4. Explicit configuration is authoritative; import detection may only suggest it.",
  },
  {
    id: "pure-library",
    axis: "role",
    summary: "Deterministic values and functions; no Effect execution or ambient capability.",
  },
  {
    id: "effect-library",
    axis: "role",
    summary:
      "May describe Effects, services, schemas, and layers but cannot execute a runtime or bind a concrete platform.",
  },
  {
    id: "service",
    axis: "role",
    summary: "Stateful or capability-bearing implementation behind declared Effect services.",
  },
  {
    id: "application",
    axis: "role",
    summary: "Portable orchestration that leaves final requirements open.",
  },
  {
    id: "composition-root",
    axis: "role",
    summary: "Selects live layers, provides the final environment, and runs the program.",
  },
  { id: "runtime-adapter", axis: "role", summary: "Implements one declared platform capability." },
  { id: "test", axis: "role", summary: "Controlled execution and replacement services." },
  {
    id: "portable",
    axis: "platform",
    summary:
      "No concrete-runtime built-ins, globals, or platform layers. Conflicts with every concrete runtime.",
  },
  {
    id: "node",
    axis: "platform",
    summary:
      "Admits Node built-ins and globals only. Compatibility APIs provided by other runtimes are not silently portable.",
  },
  { id: "bun", axis: "platform", summary: "Admits Bun built-ins and globals only." },
  {
    id: "deno",
    axis: "platform",
    summary: "Admits the Deno namespace and Deno-style specifiers only.",
  },
  {
    id: "browser",
    axis: "platform",
    summary:
      "Admits browser document/window globals; rejects worker-only and server-runtime surfaces.",
  },
  {
    id: "web-worker",
    axis: "platform",
    summary:
      "Admits worker self/importScripts globals; rejects document/window and server-runtime surfaces.",
  },
  {
    id: "external-data",
    axis: "boundary",
    summary: "Data crossing from outside the type system; enables explicit decoding rules.",
  },
  {
    id: "observability",
    axis: "boundary",
    summary: "Logging, metrics, and tracing seams; enables observability-capability rules.",
  },
  {
    id: "security-sensitive",
    axis: "boundary",
    summary: "Code handling secrets or security decisions; enables stricter capability rules.",
  },
  { id: "persistence", axis: "boundary", summary: "Durable storage seams." },
];

export interface DomainSelection {
  readonly role: Role;
  readonly platform: Platform;
  readonly boundaries?: readonly Boundary[];
}

export function describeSelection(selection: Partial<DomainSelection>): string {
  const parts: string[] = [];
  if (selection.role !== undefined) parts.push(`role=${selection.role}`);
  if (selection.platform !== undefined) parts.push(`platform=${selection.platform}`);
  if (selection.boundaries !== undefined && selection.boundaries.length > 0) {
    parts.push(`boundaries=${[...selection.boundaries].toSorted().join("+")}`);
  }
  return parts.length > 0 ? parts.join(" ") : "none declared";
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value);
}

export function isBoundary(value: unknown): value is Boundary {
  return typeof value === "string" && (BOUNDARIES as readonly string[]).includes(value);
}
