/**
 * Oracle fixture matrix from design spec 0001.
 *
 * Each group maps one fixture directory to one declared domain intersection.
 * Expected diagnostics are declared inline in the fixture files themselves:
 *
 *   - `// expect: <rule>[, <rule>...]`         — diagnostics on this line
 *   - `// expect-next-line: <rule>[, ...]`     — diagnostics on the next line
 *     (used where the diagnostic is reported at a comment location, e.g.
 *     invalid suppression directives)
 *
 * The runner turns each group into `expandDomains` input, generates
 * equivalent `.oxlintrc.json` and `oxlint.config.ts` configurations, runs
 * oxlint, and compares actual diagnostics against the union of markers.
 */

import type { Boundary, Platform, Role } from "../src/domains.js";
import type { Strictness } from "../src/config/expand.js";

export interface FixtureGroup {
  /** Directory under fixtures/ (also the group id). */
  readonly dir: string;
  readonly role: Role;
  readonly platform: Platform;
  readonly boundaries?: readonly Boundary[];
  readonly strictness?: Strictness;
}

export const MATRIX: readonly FixtureGroup[] = [
  { dir: "portable-pure-library", role: "pure-library", platform: "portable" },
  {
    dir: "portable-effect-library",
    role: "effect-library",
    platform: "portable",
    boundaries: ["external-data"],
    strictness: "strict",
  },
  { dir: "portable-service", role: "service", platform: "portable" },
  { dir: "portable-application", role: "application", platform: "portable", strictness: "strict" },
  { dir: "portable-composition-root", role: "composition-root", platform: "portable" },
  { dir: "portable-runtime-adapter", role: "runtime-adapter", platform: "portable", strictness: "strict" },
  { dir: "portable-test", role: "test", platform: "portable", strictness: "strict" },
  { dir: "node-composition-root", role: "composition-root", platform: "node" },
  { dir: "node-service", role: "service", platform: "node" },
  { dir: "node-runtime-adapter", role: "runtime-adapter", platform: "node", strictness: "strict" },
  { dir: "bun-composition-root", role: "composition-root", platform: "bun" },
  { dir: "bun-runtime-adapter", role: "runtime-adapter", platform: "bun", strictness: "strict" },
  { dir: "deno-composition-root", role: "composition-root", platform: "deno" },
  { dir: "browser-application", role: "application", platform: "browser" },
  { dir: "web-worker-service", role: "service", platform: "web-worker" },
];
