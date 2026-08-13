import { RuleTester } from "oxlint/plugins-dev";

import { noAmbientConsole } from "../dist/rules/no-ambient-console.js";

const domains = {
  role: "effect-library",
  platform: "portable",
  boundaries: [],
};

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "ts" } },
});

tester.run("no-ambient-console approved repair", noAmbientConsole, {
  valid: [
    {
      code: 'import { Effect, Console } from "effect";\nexport const program = Effect.gen(function* () {\n  yield* Console.log(value);\n});\n',
      options: [domains],
    },
  ],
  invalid: [
    {
      code: 'import { Effect } from "effect";\nexport const program = Effect.gen(function* () {\n  console.log(value);\n});\n',
      options: [domains],
      errors: [{ message: /EFT2101/ }],
      output:
        'import { Effect, Console } from "effect";\nexport const program = Effect.gen(function* () {\n  yield* Console.log(value);\n});\n',
    },
    {
      code: 'import { Effect } from "effect";\nconst Console = { local: true };\nexport const program = Effect.gen(function* () {\n  console.log(value);\n});\n',
      options: [domains],
      errors: [{ message: /EFT2101/ }],
      output:
        'import { Effect, Console as EffectConsole } from "effect";\nconst Console = { local: true };\nexport const program = Effect.gen(function* () {\n  yield* EffectConsole.log(value);\n});\n',
    },
    {
      code: 'import { Effect as E } from "effect";\nexport const program = E.gen(function* () {\n  console.log(value);\n});\n',
      options: [domains],
      errors: [{ message: /EFT2101/ }],
      output:
        'import { Effect as E, Console } from "effect";\nexport const program = E.gen(function* () {\n  yield* Console.log(value);\n});\n',
    },
    {
      code: 'import { Effect } from "effect";\nexport const program = Effect.gen(function* () {\n  const Console = { local: true };\n  console.log(value);\n});\n',
      options: [domains],
      errors: [{ message: /EFT2101/ }],
      output:
        'import { Effect, Console as EffectConsole } from "effect";\nexport const program = Effect.gen(function* () {\n  const Console = { local: true };\n  yield* EffectConsole.log(value);\n});\n',
    },
    {
      code: 'import { Effect } from "effect";\nconsole.log(value);\n',
      options: [domains],
      errors: [{ message: /EFT2101/ }],
      output: null,
    },
    {
      code: 'import { Effect } from "effect";\nexport const program = Effect.gen(function* () {\n  class Registry {\n    static {\n      console.log(value);\n    }\n  }\n});\n',
      options: [domains],
      errors: [{ message: /EFT2101/ }],
      output: null,
    },
    {
      code: 'import { Effect, Console } from "effect";\nexport const program = Effect.gen(function* () {\n  {\n    const Console = { local: true };\n    console.log(value);\n  }\n});\n',
      options: [domains],
      errors: [{ message: /EFT2101/ }],
      output: null,
    },
  ],
});
