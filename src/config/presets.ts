/**
 * Presets: quick-start config fragments derived from the same expansion the
 * typed builder uses.
 *
 * Both presets assume the conservative default domain declaration
 * `role: "application", platform: "portable"` for all TypeScript/JavaScript
 * files. Projects with real domain structure should call `expandDomains`
 * with explicit groups instead; explicit configuration is authoritative.
 *
 * - `recommended`: default-severity rules for the assumed domains.
 * - `strict`: additionally enables strict-only rules
 *   (`no-native-promise-control-flow`, `no-untyped-throw`) and the
 *   `external-data` boundary decoding rule.
 */

import type { OxlintConfigFragment } from "./expand.js";
import { expandDomains } from "./expand.js";

const DEFAULT_FILES = ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"] as const;

export const recommended: OxlintConfigFragment = expandDomains({
  technology: "effect-v4",
  groups: [
    {
      files: DEFAULT_FILES,
      role: "application",
      platform: "portable",
      strictness: "recommended",
    },
  ],
});

export const strict: OxlintConfigFragment = expandDomains({
  technology: "effect-v4",
  groups: [
    {
      files: DEFAULT_FILES,
      role: "application",
      platform: "portable",
      boundaries: ["external-data"],
      strictness: "strict",
    },
  ],
});
