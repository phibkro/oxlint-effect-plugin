import { describe, expect, test } from "bun:test";

import { auditNativeDisableDirectives } from "../../src/suppression-audit.js";

describe("auditNativeDisableDirectives", () => {
  test("rejects broad native directives that can prevent plugin execution", () => {
    for (const source of [
      "// oxlint-disable\nconsole.log('hidden')",
      "// oxlint-disable -- generated output\nconsole.log('hidden')",
      "/* eslint-disable */\nconsole.log('hidden')",
      "// eslint-disable-next-line\nconsole.log('hidden')",
    ]) {
      expect(auditNativeDisableDirectives(source)[0]?.reason).toBe("broad-native-disable");
    }
  });

  test("rejects native directives targeting the plugin under configured aliases", () => {
    expect(
      auditNativeDisableDirectives(
        "// oxlint-disable-next-line architecture/no-ambient-console\nconsole.log('hidden')",
        { pluginNames: ["architecture"] },
      )[0]?.reason,
    ).toBe("plugin-native-disable");
    expect(
      auditNativeDisableDirectives(
        "console.log('hidden') // eslint-disable-line effect-v4/no-ambient-console",
      )[0]?.reason,
    ).toBe("plugin-native-disable");
  });

  test("does not reject targeted native directives for unrelated plugins", () => {
    expect(
      auditNativeDisableDirectives("// oxlint-disable-next-line no-console\nconsole.log('x')"),
    ).toEqual([]);
  });

  test("custom reasoned directives are outside the native audit namespace", () => {
    expect(
      auditNativeDisableDirectives(
        "// oxlint-effect-v4 allow(no-ambient-console): dev only: local bring-up\nconsole.log('x')",
      ),
    ).toEqual([]);
  });
});
