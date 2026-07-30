/**
 * Portable host-gate for native linter disable directives.
 *
 * A rule cannot report a directive that prevents the host linter from
 * invoking it. Consumers therefore run this independent audit over source
 * text before/alongside Oxlint. It rejects broad native disables and native
 * disables targeting this plugin; the plugin's reasoned directive remains
 * the only admitted console escape hatch.
 */

export interface NativeDisableFinding {
  readonly line: number;
  readonly directive: string;
  readonly targets: readonly string[];
  readonly reason: "broad-native-disable" | "plugin-native-disable";
}

export interface SuppressionAuditOptions {
  /** Oxlint plugin aliases whose native disables are forbidden. */
  readonly pluginNames?: readonly string[];
}

const DIRECTIVE =
  /\b((?:oxlint|eslint)-disable(?:-next-line|-line)?)\b(?:\s+([^*\n]*?))?(?=\s*(?:\*\/)?$)/;

function commentPayloads(sourceText: string): readonly { line: number; text: string }[] {
  const payloads: { line: number; text: string }[] = [];
  const lines = sourceText.split(/\r?\n/);
  let inBlock = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    let cursor = 0;
    while (cursor < line.length) {
      if (inBlock) {
        const end = line.indexOf("*/", cursor);
        const text = end < 0 ? line.slice(cursor) : line.slice(cursor, end);
        payloads.push({ line: index + 1, text });
        if (end < 0) break;
        inBlock = false;
        cursor = end + 2;
        continue;
      }
      const lineComment = line.indexOf("//", cursor);
      const blockComment = line.indexOf("/*", cursor);
      if (lineComment < 0 && blockComment < 0) break;
      if (lineComment >= 0 && (blockComment < 0 || lineComment < blockComment)) {
        payloads.push({ line: index + 1, text: line.slice(lineComment + 2) });
        break;
      }
      const end = line.indexOf("*/", blockComment + 2);
      if (end < 0) {
        payloads.push({ line: index + 1, text: line.slice(blockComment + 2) });
        inBlock = true;
        break;
      }
      payloads.push({ line: index + 1, text: line.slice(blockComment + 2, end) });
      cursor = end + 2;
    }
  }
  return payloads;
}

export function auditNativeDisableDirectives(
  sourceText: string,
  options: SuppressionAuditOptions = {},
): readonly NativeDisableFinding[] {
  const pluginNames = new Set(options.pluginNames ?? ["effect"]);
  const findings: NativeDisableFinding[] = [];
  for (const comment of commentPayloads(sourceText)) {
    const match = DIRECTIVE.exec(comment.text.trim());
    if (match === null) continue;
    const directive = match[1] ?? "";
    const targetText = (match[2] ?? "").trim();
    const targetList = targetText.split(/(?:^|\s+)--(?:\s+|$)/, 1)[0] ?? "";
    const targets = targetList
      .split(/[\s,]+/)
      .map((target) => target.trim())
      .filter(Boolean);
    if (targets.length === 0) {
      findings.push({
        line: comment.line,
        directive,
        targets,
        reason: "broad-native-disable",
      });
      continue;
    }
    if (
      targets.some((target) => {
        const slash = target.indexOf("/");
        return slash > 0 && pluginNames.has(target.slice(0, slash));
      })
    ) {
      findings.push({
        line: comment.line,
        directive,
        targets,
        reason: "plugin-native-disable",
      });
    }
  }
  return findings;
}
