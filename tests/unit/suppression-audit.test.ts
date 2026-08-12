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
      expect(auditNativeDisableDirectives(source)[0]?.code).toBe("EFT9031");
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
        "// oxlint-disable-next-line architecture/no-ambient-console\nconsole.log('hidden')",
        { pluginNames: ["architecture"] },
      )[0]?.code,
    ).toBe("EFT9032");
    expect(
      auditNativeDisableDirectives(
        "console.log('hidden') // eslint-disable-line effect/no-ambient-console",
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
        "// oxlint-effect-plugin allow(no-ambient-console):\n// reason: local bring-up\nconsole.log('x')",
      ),
    ).toEqual([]);
  });
});
