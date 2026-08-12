import { describe, expect, test } from "bun:test";

import { effect, expandGroupRules, importClosurePolicy } from "../../src/config/expand.js";
import { domainOptionsOf } from "../../src/rule-support.js";

test("direct rule context requires valid role and platform values", () => {
  for (const options of [
    {},
    { role: "application" },
    { role: "warehouse", platform: "portable" },
    { role: "application", platform: "warehouse" },
  ]) {
    expect(() => domainOptionsOf({ options: [options] } as never)).toThrow();
  }
});

test("effect defaults every group to strict enforcement", () => {
  const fragment = effect({
    groups: [
      {
        files: ["src/**"],
        role: "effect-library",
        platform: "portable",
      },
    ],
  });

  expect(fragment.overrides[0]?.rules?.["effect/no-native-promise-control-flow"]).toBeDefined();
  expect(fragment.overrides[0]?.rules?.["effect/no-untyped-throw"]).toBeDefined();
  expect(fragment.overrides[0]?.rules?.["effect/no-opaque-instance-fields"]).toBeDefined();
  expect(fragment.overrides[0]?.rules?.["effect/no-import-from-barrel-package"]).toBeUndefined();
});

test("effect enables the optional package-barrel rule only by explicit policy", () => {
  const fragment = effect({
    rules: { "no-import-from-barrel-package": "error" },
    groups: [
      {
        files: ["src/**"],
        role: "effect-library",
        platform: "portable",
        ruleOptions: {
          "no-import-from-barrel-package": { packageNames: ["effect"] },
        },
      },
    ],
  });

  expect(fragment.overrides[0]?.rules?.["effect/no-import-from-barrel-package"]).toEqual([
    "error",
    {
      packageNames: ["effect"],
      role: "effect-library",
      platform: "portable",
    },
  ]);
});

test("effect lowers only an explicitly recommended group", () => {
  const fragment = effect({
    groups: [
      {
        files: ["src/strict/**"],
        role: "effect-library",
        platform: "portable",
      },
      {
        files: ["src/recommended/**"],
        role: "effect-library",
        platform: "portable",
        strictness: "recommended",
      },
    ],
  });

  expect(fragment.overrides[0]?.rules?.["effect/no-native-promise-control-flow"]).toBeDefined();
  expect(fragment.overrides[1]?.rules?.["effect/no-native-promise-control-flow"]).toBeUndefined();
  expect(fragment.overrides[1]?.rules?.["effect/no-ambient-console"]).toBeDefined();
});

test("effect rejects an unknown strictness from untyped configuration", () => {
  expect(() =>
    effect({
      strictness: "recomended",
      groups: [
        {
          files: ["src/**"],
          role: "application",
          platform: "portable",
        },
      ],
    } as never),
  ).toThrow('unknown strictness "recomended"');
});

test("effect rejects missing or invalid role and platform values", () => {
  const invalidGroups = [
    { files: ["src/**"], platform: "portable" },
    { files: ["src/**"], role: "application" },
    { files: ["src/**"], role: "unknown", platform: "portable" },
    { files: ["src/**"], role: "application", platform: "unknown" },
  ];

  for (const group of invalidGroups) {
    expect(() => effect({ groups: [group] } as never)).toThrow();
  }
});

describe("expandGroupRules", () => {
  test("effect-library portable recommended enables the recommended families only", () => {
    const rules = expandGroupRules({
      files: ["src/**"],
      role: "effect-library",
      platform: "portable",
      strictness: "recommended",
    });
    expect(Object.keys(rules).toSorted()).toEqual([
      "effect/no-ambient-authority",
      "effect/no-ambient-console",
      "effect/no-cross-runtime",
      "effect/no-opaque-instance-fields",
      "effect/no-premature-execution",
    ]);
  });

  test("strict enables the full collection and marks runPromise ownership", () => {
    const rules = expandGroupRules({
      files: ["src/**"],
      role: "effect-library",
      platform: "portable",
    });
    expect(rules["effect/no-native-promise-control-flow"]).toEqual([
      "error",
      { role: "effect-library", platform: "portable" },
    ]);
    expect(rules["effect/no-untyped-throw"]).toBeDefined();
    expect(rules["effect/no-premature-execution"]).toEqual([
      "error",
      {
        role: "effect-library",
        platform: "portable",
        promiseRuleActive: true,
      },
    ]);
  });

  test("boundary gating: no-raw-json-parse requires external-data", () => {
    const without = expandGroupRules({
      files: ["a"],
      role: "service",
      platform: "portable",
    });
    expect(without["effect/no-raw-json-parse"]).toBeUndefined();
    const withBoundary = expandGroupRules({
      files: ["a"],
      role: "service",
      platform: "portable",
      boundaries: ["external-data"],
    });
    expect(withBoundary["effect/no-raw-json-parse"]).toEqual([
      "error",
      {
        role: "service",
        platform: "portable",
        boundaries: ["external-data"],
      },
    ]);
  });

  test("rule options cannot replace declared applicability context", () => {
    const rules = expandGroupRules({
      files: ["a"],
      role: "application",
      platform: "portable",
      boundaries: ["observability"],
      ruleOptions: {
        "no-ambient-console": {
          role: "test",
          platform: "node",
          boundaries: ["external-data"],
        },
      },
    });

    expect(rules["effect/no-ambient-console"]).toEqual([
      "error",
      {
        role: "application",
        platform: "portable",
        boundaries: ["observability"],
      },
    ]);
  });

  test("rule options cannot forge absent context or diagnostic ownership", () => {
    const rules = expandGroupRules({
      files: ["a"],
      role: "application",
      platform: "portable",
      severityOverrides: { "no-native-promise-control-flow": "off" },
      ruleOptions: {
        "no-premature-execution": {
          boundaries: ["external-data"],
          promiseRuleActive: true,
        },
      },
    });

    expect(rules["effect/no-premature-execution"]).toEqual([
      "error",
      { role: "application", platform: "portable" },
    ]);
  });

  test("test role gets portability and runtime-shape rules", () => {
    const rules = expandGroupRules({
      files: ["**/*.test.ts"],
      role: "test",
      platform: "portable",
    });
    expect(Object.keys(rules)).toEqual([
      "effect/no-cross-runtime",
      "effect/no-opaque-instance-fields",
    ]);
  });

  test("severity override off disables a rule and releases runPromise ownership", () => {
    const rules = expandGroupRules({
      files: ["a"],
      role: "application",
      platform: "portable",
      severityOverrides: { "no-native-promise-control-flow": "off" },
    });
    expect(rules["effect/no-native-promise-control-flow"]).toBeUndefined();
    expect(rules["effect/no-premature-execution"]).toEqual([
      "error",
      { role: "application", platform: "portable" },
    ]);
  });

  test("composition-root keeps execution rules off", () => {
    const rules = expandGroupRules({
      files: ["main.ts"],
      role: "composition-root",
      platform: "node",
    });
    expect(rules["effect/no-premature-execution"]).toBeUndefined();
    expect(rules["effect/no-native-promise-control-flow"]).toBeUndefined();
    expect(rules["effect/no-ambient-console"]).toBeDefined();
  });
});

describe("effect", () => {
  test("emits explicit plugin alias and per-group overrides", () => {
    const fragment = effect({
      groups: [{ files: ["src/**"], role: "application", platform: "portable" }],
    });
    expect(fragment.jsPlugins).toEqual([
      { name: "effect", specifier: "@phibkro/oxlint-effect-plugin" },
    ]);
    expect(fragment.overrides).toHaveLength(1);
    expect(fragment.overrides[0]?.files).toEqual(["src/**"]);
  });

  test("strict defaults and explicit project overrides win", () => {
    const fragment = effect({
      rules: {
        "no-native-promise-control-flow": "off",
        "no-untyped-throw": "warn",
      },
      groups: [
        {
          files: ["src/**"],
          role: "application",
          platform: "portable",
          boundaries: ["external-data"],
        },
      ],
    });
    const rules = fragment.overrides[0]?.rules ?? {};
    expect(Object.keys(rules).toSorted()).toEqual([
      "effect/no-ambient-authority",
      "effect/no-ambient-console",
      "effect/no-cross-runtime",
      "effect/no-opaque-instance-fields",
      "effect/no-premature-execution",
      "effect/no-raw-json-parse",
      "effect/no-untyped-throw",
    ]);
    expect(rules["effect/no-native-promise-control-flow"]).toBeUndefined();
    expect(rules["effect/no-untyped-throw"]).toEqual([
      "warn",
      {
        role: "application",
        platform: "portable",
        boundaries: ["external-data"],
      },
    ]);
  });

  test("rejects unreasoned trust and adapter dependencies outside adapters", () => {
    const group = {
      files: ["src/**"],
      role: "application",
      platform: "portable",
    } as const;
    expect(() =>
      effect({
        trustedPureDependencies: [{ specifier: "date-fns", reason: "  " }],
        groups: [group],
      }),
    ).toThrow("nonempty reason");
    expect(() =>
      effect({
        groups: [{ ...group, adapterDependencies: ["stripe"] }],
      }),
    ).toThrow("runtime-adapter");
  });

  test("rejects empty groups and unknown context or rule names", () => {
    expect(() => effect({ groups: [] })).toThrow("at least one rule group");
    expect(() =>
      effect({
        groups: [{ files: [], role: "application", platform: "portable" }],
      }),
    ).toThrow();
    expect(() =>
      effect({
        groups: [{ files: ["a"], role: "warehouse" as never, platform: "portable" }],
      }),
    ).toThrow('unknown role "warehouse"');
    expect(() =>
      effect({
        rules: { inheritedRule: "off" },
        groups: [{ files: ["a"], role: "application", platform: "portable" }],
      } as never),
    ).toThrow('unknown rule "inheritedRule"');
  });
});

describe("importClosurePolicy", () => {
  test("projects trusted-pure declarations and importer context", () => {
    const policy = importClosurePolicy({
      trustedPureDependencies: [
        { specifier: "date-fns/format", reason: "reviewed total transform" },
      ],
      groups: [
        {
          files: ["src/**"],
          role: "application",
          platform: "portable",
        },
        {
          files: ["src/adapters/**"],
          role: "runtime-adapter",
          platform: "node",
          adapterDependencies: ["stripe"],
        },
      ],
    });

    expect(policy).toEqual({
      trustedPureDependencies: [
        { specifier: "date-fns/format", reason: "reviewed total transform" },
      ],
      groups: [
        {
          files: ["src/**"],
          role: "application",
          platform: "portable",
          adapterDependencies: [],
        },
        {
          files: ["src/adapters/**"],
          role: "runtime-adapter",
          platform: "node",
          adapterDependencies: ["stripe"],
        },
      ],
    });
  });

  test("defaults optional policy data to empty arrays", () => {
    expect(
      importClosurePolicy({
        groups: [{ files: ["src/**"], role: "service", platform: "portable" }],
      }),
    ).toEqual({
      trustedPureDependencies: [],
      groups: [
        {
          files: ["src/**"],
          role: "service",
          platform: "portable",
          adapterDependencies: [],
        },
      ],
    });
  });

  test("copies policy arrays and dependency records", () => {
    const trustedPureDependencies = [
      { specifier: "date-fns/format", reason: "reviewed total transform" },
    ];
    const files = ["src/**"];
    const adapterDependencies = ["stripe"];
    const group = {
      files,
      role: "runtime-adapter" as const,
      platform: "node" as const,
      adapterDependencies,
    };
    const input = {
      trustedPureDependencies,
      groups: [group],
    };
    const policy = importClosurePolicy(input);

    expect(policy.trustedPureDependencies).not.toBe(trustedPureDependencies);
    expect(policy.trustedPureDependencies[0]).not.toBe(trustedPureDependencies[0]);
    expect(policy.groups).not.toBe(input.groups);
    expect(policy.groups[0]).not.toBe(group);
    expect(policy.groups[0]?.files).not.toBe(files);
    expect(policy.groups[0]?.adapterDependencies).not.toBe(adapterDependencies);

    trustedPureDependencies[0]!.reason = "mutated";
    files.push("other/**");
    adapterDependencies.push("other");
    expect(policy.trustedPureDependencies[0]?.reason).toBe("reviewed total transform");
    expect(policy.groups[0]?.files).toEqual(["src/**"]);
    expect(policy.groups[0]?.adapterDependencies).toEqual(["stripe"]);
  });

  test("reuses builder validation for invalid declarations", () => {
    const valid = {
      groups: [{ files: ["src/**"], role: "application" as const, platform: "portable" as const }],
    };

    expect(() => importClosurePolicy({ ...valid, strictness: "maximum" as never })).toThrow(
      "unknown strictness",
    );
    expect(() => importClosurePolicy({ ...valid, groups: [] })).toThrow("at least one rule group");
    expect(() =>
      importClosurePolicy({
        ...valid,
        trustedPureDependencies: [{ specifier: "date-fns", reason: " " }],
      }),
    ).toThrow("nonempty reason");
    expect(() =>
      importClosurePolicy({
        ...valid,
        groups: [
          {
            files: ["src/**"],
            role: "application" as const,
            platform: "portable" as const,
            adapterDependencies: ["stripe"],
          },
        ],
      }),
    ).toThrow("runtime-adapter");
  });
});
