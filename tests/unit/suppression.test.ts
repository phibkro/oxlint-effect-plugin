import { describe, expect, test } from "bun:test";

import type { Comment } from "../../src/ast.js";
import { isTrailingComment, parseDirective } from "../../src/suppression.js";

const RULE = "no-ambient-console";

const comment = (value: string, line = 3): Comment => ({
  type: "Line",
  value,
  loc: { start: { line, column: 2 }, end: { line, column: 2 + value.length } },
});

describe("parseDirective", () => {
  test("non-directive comments are ignored", () => {
    expect(parseDirective(comment(" just a note"), false, RULE)).toBeNull();
  });

  test("valid targeted directive with nonempty dev only reason", () => {
    const directive = parseDirective(
      comment(" oxlint-effect-v4 allow(no-ambient-console): dev only: tracing bring-up"),
      false,
      RULE,
    );
    expect(directive?.problems).toEqual([]);
    expect(directive?.devOnlyReason).toBe("tracing bring-up");
    expect(directive?.appliesToLine).toBe(4);
  });

  test("trailing directive applies to its own line", () => {
    const directive = parseDirective(
      comment(" oxlint-effect-v4 allow(no-ambient-console): dev only: same line"),
      true,
      RULE,
    );
    expect(directive?.appliesToLine).toBe(3);
  });

  test("broad target (*) is a problem", () => {
    const directive = parseDirective(
      comment(" oxlint-effect-v4 allow(*): dev only: reason"),
      false,
      RULE,
    );
    expect(directive?.problems).toContain("broad-target");
  });

  test("multi-rule target is a problem", () => {
    const directive = parseDirective(
      comment(" oxlint-effect-v4 allow(no-ambient-console, no-untyped-throw): dev only: reason"),
      false,
      RULE,
    );
    expect(directive?.problems).toContain("broad-target");
  });

  test("missing or empty dev only reason is a problem", () => {
    for (const value of [
      " oxlint-effect-v4 allow(no-ambient-console): dev only:",
      " oxlint-effect-v4 allow(no-ambient-console): because I said so",
      " oxlint-effect-v4 allow(no-ambient-console):",
    ]) {
      const directive = parseDirective(comment(value), false, RULE);
      expect(directive?.problems).toContain("missing-reason");
    }
  });
});

describe("isTrailingComment", () => {
  test("detects code before the comment on the same line", () => {
    const source =
      "const x = 1;\nconsole.log(x); // oxlint-effect-v4 allow(no-ambient-console): dev only: y\n";
    const trailing = comment(" oxlint-effect-v4 allow(no-ambient-console): dev only: y", 2);
    const trailingAtColumn: Comment = {
      ...trailing,
      loc: { start: { line: 2, column: 16 }, end: { line: 2, column: 80 } },
    };
    expect(isTrailingComment(trailingAtColumn, source)).toBe(true);
    const own = comment(" oxlint-effect-v4 allow(no-ambient-console): dev only: y", 1);
    expect(
      isTrailingComment(
        { ...own, loc: { start: { line: 1, column: 0 }, end: own.loc.end } },
        "// c\nconsole.log(1);\n",
      ),
    ).toBe(false);
  });
});
