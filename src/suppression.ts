/**
 * Portable EffectTS escape parsing and auditing.
 *
 * The host linter owns syntax and scope. This module only consumes those
 * explicit facts: comments identify the two-line escape grammar, and callers
 * provide the next syntax node plus its lexical block as byte ranges. Source
 * line numbers are used for comment adjacency and file-header placement only;
 * they never decide which syntax a local exception applies to.
 */

import type { Comment } from "./ast.js";
import { RULE_NAMES } from "./registry.js";

export const PACKAGE_MARKER = "oxlint-effect-plugin";
export const LOCAL_DIRECTIVE_MARKER = `${PACKAGE_MARKER} allow`;
export const FILE_DIRECTIVE_MARKER = `${PACKAGE_MARKER} ignore-file`;

export const INVALID_LOCAL_EXCEPTION_CODE = "EFT9001" as const;
export const STALE_LOCAL_EXCEPTION_CODE = "EFT9002" as const;
export const INVALID_FILE_OPTOUT_CODE = "EFT9011" as const;

export type EscapeFindingCode =
  | typeof INVALID_LOCAL_EXCEPTION_CODE
  | typeof STALE_LOCAL_EXCEPTION_CODE
  | typeof INVALID_FILE_OPTOUT_CODE;

export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/** Accept the tuple shape emitted by some AST hosts as well as an object range. */
export type RangeInput = ByteRange | readonly [number, number];

/** Comment shape accepted from ESLint/Oxlint or a portable comment scanner. */
export interface CommentToken extends Comment {
  readonly range?: RangeInput;
}

export type LocalDirectiveProblem =
  | "broad-target"
  | "malformed"
  | "missing-reason"
  | "misplaced"
  | "duplicate";

export type FileDirectiveProblem = "malformed" | "missing-reason" | "late" | "duplicate";

export interface LocalDirective {
  readonly kind: "local-directive";
  readonly comment: CommentToken;
  readonly reasonComment: CommentToken | null;
  readonly range: ByteRange;
  readonly reasonRange: ByteRange | null;
  readonly targets: readonly string[];
  readonly rule: string | null;
  readonly reason: string | null;
  readonly problems: readonly LocalDirectiveProblem[];
}

export interface FileOptOutDirective {
  readonly kind: "file-directive";
  readonly comment: CommentToken;
  readonly reasonComment: CommentToken | null;
  readonly range: ByteRange;
  readonly reasonRange: ByteRange | null;
  readonly reason: string | null;
  readonly problems: readonly FileDirectiveProblem[];
}

/**
 * A caller-provided AST fact tying one local directive to its next syntax node.
 * `directiveIndex` is the index among local directives in source order. The
 * `directive` and `commentIndex` forms are also accepted for AST hosts that
 * retain comment identity. `blockRange` is required at runtime: a line cannot
 * prove lexical scope.
 */
export interface SyntaxTarget {
  readonly directive?: number | CommentToken | LocalDirective;
  readonly directiveIndex?: number;
  readonly commentIndex?: number;
  readonly directiveRange?: RangeInput;
  readonly nodeRange?: RangeInput;
  readonly targetRange?: RangeInput;
  readonly range?: RangeInput;
  readonly blockRange?: RangeInput;
  readonly targetBlockRange?: RangeInput;
  readonly lexicalBlockRange?: RangeInput;
  readonly directiveBlockRange?: RangeInput;
  readonly directiveLexicalBlockRange?: RangeInput;
  readonly sameLexicalBlock?: boolean;
  readonly isNext?: boolean;
  /** Optional nested forms used by callers that retain full node/block facts. */
  readonly node?: { readonly range?: RangeInput };
  readonly block?: { readonly range?: RangeInput };
}

export interface RuleDiagnostic {
  readonly rule: string;
  readonly range: RangeInput;
  readonly [key: string]: unknown;
}

export interface EscapeAuditInput {
  readonly sourceText: string;
  /** Stable file identity used in structured audit diagnostic spans. */
  readonly file?: string;
  readonly comments?: readonly CommentToken[];
  readonly shippedRules?: readonly string[];
  readonly syntaxTargets?: readonly SyntaxTarget[];
  readonly diagnostics?: readonly RuleDiagnostic[];
  /** Alias for coordinators that keep rule diagnostics separately. */
  readonly ruleDiagnostics?: readonly RuleDiagnostic[];
}

export interface LocalException {
  readonly kind: "local-exception";
  readonly directive: LocalDirective;
  readonly rule: string;
  readonly reason: string;
  readonly targetRange: ByteRange;
  readonly blockRange: ByteRange;
  readonly used: boolean;
  readonly suppressedDiagnosticCount: number;
}

export interface FileOptOut {
  readonly kind: "file-opt-out";
  readonly directive: FileOptOutDirective;
  readonly reason: string;
  readonly range: ByteRange;
}

export type LocalFindingReason = LocalDirectiveProblem;
export type FileFindingReason = FileDirectiveProblem;

export interface EscapeFinding {
  readonly code: EscapeFindingCode;
  readonly invariant: "invalid-local-exception" | "stale-local-exception" | "invalid-file-opt-out";
  readonly schemaVersion: 1;
  readonly subject: {
    readonly kind: "audit";
    readonly invariant:
      | "invalid-local-exception"
      | "stale-local-exception"
      | "invalid-file-opt-out";
  };
  readonly family: "audit";
  readonly severity: "error";
  readonly reason: LocalFindingReason | FileFindingReason | "unused-or-stale";
  readonly message: string;
  readonly explanation: string;
  readonly help: string;
  readonly docs: "README.md#reasoned-escapes";
  readonly primarySpan: {
    readonly file: string;
    readonly offset: number;
    readonly length: number;
    readonly line: number;
    readonly column: number;
  };
  readonly proofSources: readonly ["syntax", "scope"];
  readonly suggestions: readonly [];
  readonly origin: { readonly engine: "audit"; readonly code: EscapeFindingCode };
  readonly range: ByteRange;
  readonly line: number;
  readonly column: number;
  readonly directive: LocalDirective | FileOptOutDirective;
}

export interface SuppressionMatch {
  readonly diagnostic: RuleDiagnostic;
  readonly exception: LocalException;
}

export interface SuppressionMatchResult {
  readonly suppressed: readonly RuleDiagnostic[];
  readonly remaining: readonly RuleDiagnostic[];
  readonly matches: readonly SuppressionMatch[];
  readonly usedExceptions: readonly LocalException[];
}

export interface EscapeInventory {
  readonly localExceptions: readonly LocalException[];
  readonly fileOptOuts: readonly FileOptOut[];
}

export interface EscapeAuditResult {
  readonly inventory: EscapeInventory;
  readonly localExceptions: readonly LocalException[];
  readonly fileOptOuts: readonly FileOptOut[];
  readonly findings: readonly EscapeFinding[];
  readonly validFileOptOut: FileOptOut | null;
  readonly suppressedDiagnostics: readonly RuleDiagnostic[];
  readonly remainingDiagnostics: readonly RuleDiagnostic[];
}

interface CommentMeta {
  readonly comment: CommentToken;
  readonly range: ByteRange;
}

interface LocalCandidate {
  readonly directive: LocalDirective;
  readonly comment: CommentMeta;
  readonly ordinal: number;
  readonly targets: ResolvedTarget[];
}

interface FileCandidate {
  readonly directive: FileOptOutDirective;
  readonly comment: CommentMeta;
}

interface ResolvedTarget {
  readonly nodeRange: ByteRange | null;
  readonly blockRange: ByteRange | null;
  readonly directiveBlockRange: ByteRange | null;
  readonly isNext: boolean;
  readonly sameLexicalBlock: boolean;
}

const LOCAL_HEADER = /^oxlint-effect-plugin\s+allow\(([^)]*)\):[ \t]*$/;
const FILE_HEADER = /^oxlint-effect-plugin\s+ignore-file:[ \t]*$/;
const REASON_HEADER = /^reason:[ \t]*(.*)$/s;

function normalizeRange(value: unknown): ByteRange | null {
  if (Array.isArray(value) && value.length >= 2) {
    const start = value[0];
    const end = value[1];
    if (typeof start === "number" && typeof end === "number") {
      if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start) {
        return { start, end };
      }
    }
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const record = value as { readonly start?: unknown; readonly end?: unknown };
  if (typeof record.start !== "number" || typeof record.end !== "number") return null;
  if (
    !Number.isSafeInteger(record.start) ||
    !Number.isSafeInteger(record.end) ||
    record.start < 0 ||
    record.end < record.start
  ) {
    return null;
  }
  return { start: record.start, end: record.end };
}

function sameRange(left: ByteRange | null, right: ByteRange | null): boolean {
  return left !== null && right !== null && left.start === right.start && left.end === right.end;
}

function lineStarts(sourceText: string): readonly number[] {
  const starts: number[] = [0];
  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

function positionOffset(
  position: { readonly line: number; readonly column: number },
  starts: readonly number[],
): number {
  const lineStart = starts[Math.max(0, position.line - 1)] ?? 0;
  return Math.max(0, lineStart + Math.max(0, position.column));
}

function rangeForComment(
  comment: CommentToken,
  starts: readonly number[],
  sourceLength: number,
): ByteRange {
  const explicit = normalizeRange(comment.range);
  if (explicit !== null) return explicit;
  const start = positionOffset(comment.loc.start, starts);
  const end = positionOffset(comment.loc.end, starts);
  return {
    start: Math.min(sourceLength, start),
    end: Math.min(sourceLength, Math.max(start, end)),
  };
}

function offsetPosition(
  offset: number,
  starts: readonly number[],
): { line: number; column: number } {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((starts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  return { line: low + 1, column: Math.max(0, offset - (starts[low] ?? 0)) };
}

function scanComments(sourceText: string): CommentToken[] {
  const starts = lineStarts(sourceText);
  const comments: CommentToken[] = [];
  let index = 0;
  while (index < sourceText.length) {
    const character = sourceText[index] ?? "";
    const next = sourceText[index + 1] ?? "";
    if (character === "'" || character === '"' || character === "`") {
      const quote = character;
      index += 1;
      while (index < sourceText.length) {
        const current = sourceText[index] ?? "";
        if (current === "\\") {
          index += 2;
          continue;
        }
        index += 1;
        if (current === quote) break;
      }
      continue;
    }
    if (character === "/" && next === "/") {
      const start = index;
      index += 2;
      while (
        index < sourceText.length &&
        sourceText[index] !== "\n" &&
        sourceText[index] !== "\r"
      ) {
        index += 1;
      }
      const end = index;
      comments.push({
        type: "Line",
        value: sourceText.slice(start + 2, end),
        loc: { start: offsetPosition(start, starts), end: offsetPosition(end, starts) },
        range: [start, end],
      });
      continue;
    }
    if (character === "/" && next === "*") {
      const start = index;
      index += 2;
      while (
        index < sourceText.length &&
        !(sourceText[index] === "*" && sourceText[index + 1] === "/")
      ) {
        index += 1;
      }
      if (index < sourceText.length) index += 2;
      const end = Math.min(index, sourceText.length);
      comments.push({
        type: "Block",
        value: sourceText.slice(start + 2, Math.max(start + 2, end - 2)),
        loc: { start: offsetPosition(start, starts), end: offsetPosition(end, starts) },
        range: [start, end],
      });
      continue;
    }
    index += 1;
  }
  return comments;
}

function commentMeta(comments: readonly CommentToken[], sourceText: string): CommentMeta[] {
  const starts = lineStarts(sourceText);
  return comments
    .map((comment) => ({ comment, range: rangeForComment(comment, starts, sourceText.length) }))
    .toSorted((left, right) => {
      const byStart = left.range.start - right.range.start;
      if (byStart !== 0) return byStart;
      return left.range.end - right.range.end;
    });
}

function sourceLine(sourceText: string, line: number, starts: readonly number[]): string | null {
  const start = starts[line - 1];
  if (start === undefined) return null;
  const end = starts[line] ?? sourceText.length;
  return sourceText.slice(start, end).replace(/\r?\n$/, "");
}

function commentIsStandalone(meta: CommentMeta, sourceText: string): boolean {
  if (sourceText.length === 0) return true;
  const starts = lineStarts(sourceText);
  const startLine = meta.comment.loc.start.line;
  const endLine = meta.comment.loc.end.line;
  const first = sourceLine(sourceText, startLine, starts);
  const last = sourceLine(sourceText, endLine, starts);
  if (first === null || last === null) return true;
  const beforeRaw = first.slice(0, Math.max(0, meta.comment.loc.start.column));
  const beforeTrimmed = beforeRaw.trim();
  const payloadStart =
    (meta.comment.type === "Line" && beforeTrimmed === "//") ||
    (meta.comment.type === "Block" && beforeTrimmed.endsWith("/*"));
  const before = payloadStart ? "" : beforeRaw;
  const after = last.slice(Math.max(0, meta.comment.loc.end.column));
  return before.trim().length === 0 && after.trim().length === 0;
}

function commentsAreImmediate(
  current: CommentMeta,
  next: CommentMeta | undefined,
  sourceText: string,
): boolean {
  if (next === undefined) return false;
  if (next.comment.loc.start.line !== current.comment.loc.end.line + 1) return false;
  if (current.range.end > sourceText.length || next.range.start > sourceText.length) return true;
  const gap = sourceText.slice(current.range.end, next.range.start);
  return gap.trim().length === 0;
}

function markerKind(value: string): "local" | "file" | null {
  const text = value.trimStart();
  if (/^oxlint-effect-plugin\s+allow(?:\b|\()/.test(text)) return "local";
  if (/^oxlint-effect-plugin\s+ignore-file(?:\b|:)/.test(text)) return "file";
  return null;
}

function parseReason(
  current: CommentMeta,
  next: CommentMeta | undefined,
  sourceText: string,
): {
  readonly comment: CommentToken | null;
  readonly range: ByteRange | null;
  readonly reason: string | null;
} {
  if (!commentsAreImmediate(current, next, sourceText) || next === undefined) {
    return { comment: null, range: null, reason: null };
  }
  const match = REASON_HEADER.exec(next.comment.value.trim());
  if (match === null) return { comment: null, range: null, reason: null };
  const reason = (match[1] ?? "").trim();
  return {
    comment: next.comment,
    range: next.range,
    reason: reason.length > 0 ? reason : null,
  };
}

function pushProblem<T>(problems: T[], problem: T): void {
  if (!problems.includes(problem)) problems.push(problem);
}

function parseLocal(
  current: CommentMeta,
  next: CommentMeta | undefined,
  sourceText: string,
  shippedRules: ReadonlySet<string>,
): LocalDirective {
  const text = current.comment.value.trim();
  const problems: LocalDirectiveProblem[] = [];
  const match = LOCAL_HEADER.exec(text);
  let targets: string[] = [];
  let rule: string | null = null;
  if (match === null) {
    pushProblem(problems, "malformed");
  } else {
    const rawTargets = match[1] ?? "";
    targets = rawTargets
      .split(",")
      .map((target) => target.trim())
      .filter((target) => target.length > 0);
    if (targets.length !== 1 || targets[0] === "*") {
      pushProblem(problems, "broad-target");
    } else if (!shippedRules.has(targets[0] ?? "")) {
      pushProblem(problems, "malformed");
    } else {
      rule = targets[0] ?? null;
    }
  }
  const parsedReason = parseReason(current, next, sourceText);
  if (parsedReason.reason === null) pushProblem(problems, "missing-reason");
  if (!commentIsStandalone(current, sourceText)) pushProblem(problems, "misplaced");
  if (parsedReason.comment !== null) {
    const reasonMeta: CommentMeta = { comment: parsedReason.comment, range: parsedReason.range! };
    if (!commentIsStandalone(reasonMeta, sourceText)) pushProblem(problems, "misplaced");
  }
  return {
    kind: "local-directive",
    comment: current.comment,
    reasonComment: parsedReason.comment,
    range: current.range,
    reasonRange: parsedReason.range,
    targets,
    rule,
    reason: parsedReason.reason,
    problems,
  };
}

function parseFile(
  current: CommentMeta,
  next: CommentMeta | undefined,
  sourceText: string,
): FileOptOutDirective {
  const text = current.comment.value.trim();
  const problems: FileDirectiveProblem[] = [];
  if (FILE_HEADER.exec(text) === null) pushProblem(problems, "malformed");
  const parsedReason = parseReason(current, next, sourceText);
  if (parsedReason.reason === null) pushProblem(problems, "missing-reason");
  if (!commentIsStandalone(current, sourceText)) pushProblem(problems, "late");
  if (parsedReason.comment !== null) {
    const reasonMeta: CommentMeta = { comment: parsedReason.comment, range: parsedReason.range! };
    if (!commentIsStandalone(reasonMeta, sourceText)) pushProblem(problems, "late");
  }
  return {
    kind: "file-directive",
    comment: current.comment,
    reasonComment: parsedReason.comment,
    range: current.range,
    reasonRange: parsedReason.range,
    reason: parsedReason.reason,
    problems,
  };
}

function hasCodeBefore(sourceText: string, offset: number): boolean {
  let prefix = sourceText.slice(0, Math.max(0, Math.min(offset, sourceText.length)));
  if (prefix.charCodeAt(0) === 0xfeff) prefix = prefix.slice(1);
  if (prefix.startsWith("#!")) {
    const shebangEnd = prefix.search(/\r?\n/);
    prefix = shebangEnd < 0 ? "" : prefix.slice(shebangEnd + (prefix[shebangEnd] === "\r" ? 2 : 1));
  }
  let output = "";
  let index = 0;
  while (index < prefix.length) {
    const character = prefix[index] ?? "";
    const next = prefix[index + 1] ?? "";
    if (character === "'" || character === '"' || character === "`") {
      output += character;
      index += 1;
      while (index < prefix.length) {
        const current = prefix[index] ?? "";
        output += current;
        if (current === "\\") {
          index += 1;
          if (index < prefix.length) output += prefix[index] ?? "";
        } else if (current === character) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    if (character === "/" && next === "/") {
      index += 2;
      while (index < prefix.length && prefix[index] !== "\n" && prefix[index] !== "\r") index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      index += 2;
      while (index < prefix.length && !(prefix[index] === "*" && prefix[index + 1] === "/")) {
        if (prefix[index] === "\n" || prefix[index] === "\r") output += prefix[index];
        else output += " ";
        index += 1;
      }
      if (index < prefix.length) index += 2;
      continue;
    }
    output += character;
    index += 1;
  }
  return output.trim().length > 0;
}

function field(target: SyntaxTarget, name: string): unknown {
  return (target as unknown as Record<string, unknown>)[name];
}

function targetRange(target: SyntaxTarget): ByteRange | null {
  return (
    normalizeRange(target.nodeRange) ??
    normalizeRange(target.targetRange) ??
    normalizeRange(target.range) ??
    normalizeRange(target.node?.range)
  );
}

function targetBlockRange(target: SyntaxTarget): ByteRange | null {
  return (
    normalizeRange(target.targetBlockRange) ??
    normalizeRange(target.lexicalBlockRange) ??
    normalizeRange(target.blockRange) ??
    normalizeRange(target.block?.range)
  );
}

function directiveBlockRange(target: SyntaxTarget): ByteRange | null {
  return (
    normalizeRange(target.directiveBlockRange) ??
    normalizeRange(target.directiveLexicalBlockRange) ??
    normalizeRange(field(target, "directiveBlock"))
  );
}

function resolveTarget(target: SyntaxTarget): ResolvedTarget {
  const blockRange = targetBlockRange(target);
  const explicitDirectiveBlock = directiveBlockRange(target);
  const sameLexicalBlock =
    target.sameLexicalBlock !== false &&
    (explicitDirectiveBlock === null || sameRange(explicitDirectiveBlock, blockRange));
  return {
    nodeRange: targetRange(target),
    blockRange,
    directiveBlockRange: explicitDirectiveBlock,
    isNext: target.isNext !== false,
    sameLexicalBlock,
  };
}

function candidateForReference(
  reference: unknown,
  candidates: readonly LocalCandidate[],
  comments: readonly CommentMeta[],
): LocalCandidate | null {
  if (typeof reference === "number" && Number.isInteger(reference)) {
    const byComment = comments[reference];
    if (byComment !== undefined) {
      const candidate = candidates.find((entry) => entry.comment === byComment);
      if (candidate !== undefined) return candidate;
    }
    return candidates[reference] ?? null;
  }
  const range = normalizeRange(reference);
  if (range !== null) {
    return candidates.find((entry) => sameRange(entry.comment.range, range)) ?? null;
  }
  if (typeof reference !== "object" || reference === null) return null;
  const object = reference as {
    readonly kind?: unknown;
    readonly range?: unknown;
    readonly comment?: unknown;
  };
  if (object.kind === "local-exception" || object.kind === "local-directive") {
    const nestedRange = normalizeRange(object.range);
    if (nestedRange !== null) {
      return candidates.find((entry) => sameRange(entry.directive.range, nestedRange)) ?? null;
    }
  }
  if (object.comment !== undefined) {
    return candidateForReference(object.comment, candidates, comments);
  }
  const objectRange = normalizeRange(object.range);
  if (objectRange !== null) {
    return candidates.find((entry) => sameRange(entry.comment.range, objectRange)) ?? null;
  }
  return candidates.find((entry) => entry.comment.comment === reference) ?? null;
}

function assignTargets(
  candidates: LocalCandidate[],
  targets: readonly SyntaxTarget[],
  comments: readonly CommentMeta[],
): void {
  const assigned = new Set<number>();
  let implicitOrdinal = 0;
  for (const syntaxTarget of targets) {
    const explicit =
      syntaxTarget.directive ??
      syntaxTarget.directiveIndex ??
      syntaxTarget.commentIndex ??
      syntaxTarget.directiveRange;
    let candidate =
      explicit === undefined ? null : candidateForReference(explicit, candidates, comments);
    if (candidate === null && explicit === undefined) {
      while (implicitOrdinal < candidates.length && assigned.has(implicitOrdinal))
        implicitOrdinal += 1;
      candidate = candidates[implicitOrdinal] ?? null;
      implicitOrdinal += 1;
    }
    if (candidate === null) continue;
    const resolved = resolveTarget(syntaxTarget);
    candidate.targets.push(resolved);
    const ordinal = candidate.ordinal;
    if (assigned.has(ordinal) && resolved.nodeRange !== null) {
      // Keep the second fact; duplicate detection below will make it invalid.
    }
    assigned.add(ordinal);
  }
}

function localProblem(candidate: LocalCandidate): LocalDirectiveProblem | null {
  const problems = candidate.directive.problems;
  if (problems.includes("malformed")) return "malformed";
  if (problems.includes("broad-target")) return "broad-target";
  if (problems.includes("missing-reason")) return "missing-reason";
  if (problems.includes("misplaced")) return "misplaced";
  const target = candidate.targets[0];
  if (
    target === undefined ||
    target.nodeRange === null ||
    target.blockRange === null ||
    !target.isNext ||
    !target.sameLexicalBlock ||
    (candidate.directive.reasonRange !== null &&
      target.nodeRange.start < candidate.directive.reasonRange.end)
  ) {
    return "misplaced";
  }
  if (candidate.targets.length !== 1) return "duplicate";
  return null;
}

function localFinding(
  candidate: LocalCandidate,
  reason: LocalFindingReason | "unused-or-stale",
  file: string,
  code:
    | typeof INVALID_LOCAL_EXCEPTION_CODE
    | typeof STALE_LOCAL_EXCEPTION_CODE = INVALID_LOCAL_EXCEPTION_CODE,
): EscapeFinding {
  const line = candidate.directive.comment.loc.start.line;
  const column = candidate.directive.comment.loc.start.column;
  const range = candidate.directive.range;
  const invariant =
    code === INVALID_LOCAL_EXCEPTION_CODE ? "invalid-local-exception" : "stale-local-exception";
  const message =
    code === INVALID_LOCAL_EXCEPTION_CODE
      ? `Invalid local exception (${reason}).`
      : "Local exception is unused or stale.";
  return {
    schemaVersion: 1,
    code,
    subject: { kind: "audit", invariant },
    family: "audit",
    invariant,
    severity: "error",
    reason: code === INVALID_LOCAL_EXCEPTION_CODE ? reason : "unused-or-stale",
    message,
    explanation:
      "EffectTS exceptions must name one shipped rule, carry a reason, and target one syntax node in the same lexical block.",
    help: "Use the canonical two-line local exception immediately before the target node, or remove the stale exception.",
    docs: "README.md#reasoned-escapes",
    primarySpan: { file, offset: range.start, length: range.end - range.start, line, column },
    proofSources: ["syntax", "scope"],
    suggestions: [],
    origin: { engine: "audit", code },
    range,
    line,
    column,
    directive: candidate.directive,
  };
}

function fileFinding(
  candidate: FileCandidate,
  reason: FileFindingReason,
  file: string,
): EscapeFinding {
  const range = candidate.directive.range;
  const line = candidate.directive.comment.loc.start.line;
  const column = candidate.directive.comment.loc.start.column;
  return {
    schemaVersion: 1,
    code: INVALID_FILE_OPTOUT_CODE,
    subject: { kind: "audit", invariant: "invalid-file-opt-out" },
    family: "audit",
    invariant: "invalid-file-opt-out",
    severity: "error",
    reason,
    message: `Invalid file opt-out (${reason}).`,
    explanation:
      "A file opt-out must use the fixed package marker before executable code and carry a nonempty reason.",
    help: "Move the canonical two-line file opt-out to the file header, add its reason, or remove it.",
    docs: "README.md#reasoned-escapes",
    primarySpan: { file, offset: range.start, length: range.end - range.start, line, column },
    proofSources: ["syntax", "scope"],
    suggestions: [],
    origin: { engine: "audit", code: INVALID_FILE_OPTOUT_CODE },
    range,
    line,
    column,
    directive: candidate.directive,
  };
}

function diagnosticSort(left: RuleDiagnostic, right: RuleDiagnostic): number {
  const leftRange = normalizeRange(left.range);
  const rightRange = normalizeRange(right.range);
  if (leftRange !== null && rightRange !== null) {
    if (leftRange.start !== rightRange.start) return leftRange.start - rightRange.start;
    if (leftRange.end !== rightRange.end) return leftRange.end - rightRange.end;
  }
  return left.rule.localeCompare(right.rule);
}

/**
 * Return every rule diagnostic whose exact rule and byte range are contained
 * by one valid local exception target. Diagnostics for other rules remain.
 */
export function matchSuppressedDiagnostics(
  input:
    | {
        readonly diagnostics: readonly RuleDiagnostic[];
        readonly localExceptions: readonly LocalException[];
      }
    | readonly RuleDiagnostic[],
  localExceptions?: readonly LocalException[],
): SuppressionMatchResult {
  let diagnostics: readonly RuleDiagnostic[];
  let exceptions: readonly LocalException[];
  if (Array.isArray(input)) {
    diagnostics = input as readonly RuleDiagnostic[];
    exceptions = localExceptions ?? [];
  } else {
    const options = input as {
      readonly diagnostics: readonly RuleDiagnostic[];
      readonly localExceptions: readonly LocalException[];
    };
    diagnostics = options.diagnostics;
    exceptions = options.localExceptions;
  }
  const orderedDiagnostics = diagnostics
    .map((diagnostic, index) => ({ diagnostic, index }))
    .toSorted(
      (left, right) =>
        diagnosticSort(left.diagnostic, right.diagnostic) || left.index - right.index,
    );
  const orderedExceptions = exceptions
    .map((exception, index) => ({ exception, index }))
    .toSorted(
      (left, right) =>
        left.exception.targetRange.start - right.exception.targetRange.start ||
        left.exception.targetRange.end - right.exception.targetRange.end ||
        left.exception.directive.range.start - right.exception.directive.range.start ||
        left.index - right.index,
    );
  const suppressed: RuleDiagnostic[] = [];
  const remaining: RuleDiagnostic[] = [];
  const matches: SuppressionMatch[] = [];
  const used = new Set<LocalException>();
  for (const entry of orderedDiagnostics) {
    const diagnosticRange = normalizeRange(entry.diagnostic.range);
    const match =
      diagnosticRange === null
        ? undefined
        : orderedExceptions.find((candidate) => {
            if (candidate.exception.rule !== entry.diagnostic.rule) return false;
            return (
              diagnosticRange.start >= candidate.exception.targetRange.start &&
              diagnosticRange.end <= candidate.exception.targetRange.end
            );
          });
    if (match === undefined) {
      remaining.push(entry.diagnostic);
      continue;
    }
    suppressed.push(entry.diagnostic);
    used.add(match.exception);
    matches.push({ diagnostic: entry.diagnostic, exception: match.exception });
  }
  return {
    suppressed,
    remaining,
    matches,
    usedExceptions: orderedExceptions
      .filter((entry) => used.has(entry.exception))
      .map((entry) => entry.exception),
  };
}

/**
 * Parse and audit the fixed-package local exception and file opt-out grammar.
 * The result is deterministic by source range and contains only valid escape
 * inventory entries; malformed entries are represented by EFT findings.
 */
export function auditEffectTSEscapes(input: EscapeAuditInput): EscapeAuditResult {
  const sourceText = input.sourceText;
  const file = input.file ?? "<input>";
  const comments = commentMeta(input.comments ?? scanComments(sourceText), sourceText);
  const shippedRules = new Set(input.shippedRules ?? RULE_NAMES);
  const localCandidates: LocalCandidate[] = [];
  const fileCandidates: FileCandidate[] = [];

  for (let index = 0; index < comments.length; index += 1) {
    const current = comments[index];
    if (current === undefined) continue;
    const next = comments[index + 1];
    const kind = markerKind(current.comment.value);
    if (kind === "local") {
      const directive = parseLocal(current, next, sourceText, shippedRules);
      localCandidates.push({
        directive,
        comment: current,
        ordinal: localCandidates.length,
        targets: [],
      });
    } else if (kind === "file") {
      const directive = parseFile(current, next, sourceText);
      const placement = hasCodeBefore(sourceText, current.range.start);
      if (placement) {
        const problems = [...directive.problems];
        pushProblem(problems, "late");
        fileCandidates.push({
          directive: { ...directive, problems },
          comment: current,
        });
      } else {
        fileCandidates.push({ directive, comment: current });
      }
    }
  }

  assignTargets(localCandidates, input.syntaxTargets ?? [], comments);

  const findings: EscapeFinding[] = [];
  const provisionalExceptions: LocalException[] = [];
  const validCandidates: LocalCandidate[] = [];
  const duplicateKeys = new Set<string>();

  for (const candidate of localCandidates) {
    const problem = localProblem(candidate);
    if (problem !== null) {
      findings.push(localFinding(candidate, problem, file));
      continue;
    }
    const target = candidate.targets[0]!;
    const key = `${candidate.directive.rule!}\u0000${target.nodeRange!.start}:${target.nodeRange!.end}\u0000${target.blockRange!.start}:${target.blockRange!.end}`;
    if (duplicateKeys.has(key)) {
      findings.push(localFinding(candidate, "duplicate", file));
      continue;
    }
    duplicateKeys.add(key);
    validCandidates.push(candidate);
    provisionalExceptions.push({
      kind: "local-exception",
      directive: candidate.directive,
      rule: candidate.directive.rule!,
      reason: candidate.directive.reason!,
      targetRange: target.nodeRange!,
      blockRange: target.blockRange!,
      used: false,
      suppressedDiagnosticCount: 0,
    });
  }

  const diagnostics = input.diagnostics ?? input.ruleDiagnostics ?? [];
  const firstMatch = matchSuppressedDiagnostics({
    diagnostics,
    localExceptions: provisionalExceptions,
  });
  const counts = new Map<LocalException, number>();
  for (const match of firstMatch.matches) {
    counts.set(match.exception, (counts.get(match.exception) ?? 0) + 1);
  }
  const localExceptions = provisionalExceptions.map((exception) => ({
    ...exception,
    used: (counts.get(exception) ?? 0) > 0,
    suppressedDiagnosticCount: counts.get(exception) ?? 0,
  }));
  const finalMatch = matchSuppressedDiagnostics({ diagnostics, localExceptions });
  for (let index = 0; index < localExceptions.length; index += 1) {
    const exception = localExceptions[index];
    if (exception !== undefined && !exception.used) {
      const candidate = validCandidates[index];
      if (candidate !== undefined) {
        findings.push(localFinding(candidate, "unused-or-stale", file, STALE_LOCAL_EXCEPTION_CODE));
      }
    }
  }

  const validFileCandidates: FileCandidate[] = [];
  for (const candidate of fileCandidates) {
    const problem = candidate.directive.problems[0];
    if (problem !== undefined) {
      findings.push(fileFinding(candidate, problem, file));
      continue;
    }
    validFileCandidates.push(candidate);
  }
  if (validFileCandidates.length > 1) {
    for (const duplicate of validFileCandidates.slice(1)) {
      findings.push(fileFinding(duplicate, "duplicate", file));
    }
  }
  const fileOptOuts: FileOptOut[] =
    validFileCandidates.length > 0
      ? [
          {
            kind: "file-opt-out",
            directive: validFileCandidates[0]!.directive,
            reason: validFileCandidates[0]!.directive.reason!,
            range: validFileCandidates[0]!.directive.range,
          },
        ]
      : [];
  const validFileOptOut =
    fileOptOuts.length === 1 &&
    !findings.some((finding) => finding.code === INVALID_FILE_OPTOUT_CODE)
      ? fileOptOuts[0]!
      : null;
  const effectiveFindings =
    validFileOptOut === null
      ? findings
      : findings.filter((finding) => finding.code !== STALE_LOCAL_EXCEPTION_CODE);
  const fileSuppressedDiagnostics =
    validFileOptOut === null
      ? []
      : matchSuppressedDiagnostics({ diagnostics, localExceptions: [] }).remaining;

  effectiveFindings.sort(
    (left, right) =>
      left.range.start - right.range.start ||
      left.range.end - right.range.end ||
      left.code.localeCompare(right.code) ||
      left.reason.localeCompare(right.reason),
  );
  const inventory: EscapeInventory = { localExceptions, fileOptOuts };
  return {
    inventory,
    localExceptions,
    fileOptOuts,
    findings: effectiveFindings,
    validFileOptOut,
    suppressedDiagnostics:
      validFileOptOut === null ? finalMatch.suppressed : fileSuppressedDiagnostics,
    remainingDiagnostics: validFileOptOut === null ? finalMatch.remaining : [],
  };
}
