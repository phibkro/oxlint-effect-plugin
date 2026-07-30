/**
 * Targeted `dev only:` suppression directives for `no-ambient-console`.
 *
 * Grammar (inside a line or block comment):
 *
 *     oxlint-effect-plugin allow(<rule>): dev only: <nonempty reason>
 *
 * Validity for the console rule:
 * - targeted: the parenthesized list names exactly `no-ambient-console`;
 * - reasoned: the text after the colon starts with `dev only:` followed by a
 *   nonempty reason.
 *
 * A directive in a comment on its own line applies to the next source line;
 * a trailing comment applies to its own line. The console rule is the only
 * suppressible rule in this tracer and owns the directive namespace.
 */

import type { Comment } from "./ast.js";

export const DIRECTIVE_MARKER = "oxlint-effect-plugin allow";

const DIRECTIVE_PATTERN = /oxlint-effect-plugin\s+allow\(([^)]*)\)\s*:?\s*(.*)/s;

export type DirectiveProblem = "broad-target" | "missing-reason";

export interface ParsedDirective {
  /** Comma-separated targets inside `allow(...)`, trimmed. */
  readonly targets: readonly string[];
  /** Nonempty reason after `dev only:`, when present. */
  readonly devOnlyReason: string | null;
  readonly problems: readonly DirectiveProblem[];
  /** Line of source code the directive applies to. */
  readonly appliesToLine: number;
  readonly comment: Comment;
}

export function parseDirective(
  comment: Comment,
  isTrailing: boolean,
  targetRule: string,
): ParsedDirective | null {
  const match = DIRECTIVE_PATTERN.exec(comment.value);
  if (match === null) return null;
  const targetsRaw = match[1] ?? "";
  const rest = (match[2] ?? "").trim();
  const targets = targetsRaw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const problems: DirectiveProblem[] = [];
  const targeted = targets.length === 1 && targets[0] === targetRule;
  if (!targeted) problems.push("broad-target");

  let devOnlyReason: string | null = null;
  const devOnlyMatch = /^dev only:\s*(.*)$/s.exec(rest);
  if (devOnlyMatch !== null) {
    const reason = (devOnlyMatch[1] ?? "").trim();
    if (reason.length > 0) devOnlyReason = reason;
  }
  if (devOnlyReason === null) problems.push("missing-reason");

  return {
    targets,
    devOnlyReason,
    problems,
    appliesToLine: isTrailing ? comment.loc.start.line : comment.loc.end.line + 1,
    comment,
  };
}

/** A comment is trailing when code precedes it on its starting line. */
export function isTrailingComment(comment: Comment, sourceText: string): boolean {
  const lines = sourceText.split("\n");
  const lineText = lines[comment.loc.start.line - 1];
  if (lineText === undefined) return false;
  const before = lineText.slice(0, comment.loc.start.column);
  return before.trim().length > 0;
}

export function collectDirectives(
  comments: readonly Comment[],
  sourceText: string,
  targetRule: string,
): ParsedDirective[] {
  const directives: ParsedDirective[] = [];
  for (const comment of comments) {
    const directive = parseDirective(comment, isTrailingComment(comment, sourceText), targetRule);
    if (directive !== null) directives.push(directive);
  }
  return directives;
}
