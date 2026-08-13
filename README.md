# EffectTS Enforcement Layer

`@phibkro/oxlint-effect-plugin` makes EffectTS an explicit programming profile inside TypeScript.
It ships compiled Oxlint rules, semantic diagnostics, safe repair metadata, import policy, escape auditing, and agent guidance.

The rules provide high-confidence syntax and scope evidence. The module-policy gate provides resolved import-edge evidence.
Type-aware Effect diagnostics remain owned by [`@effect/tsgo`](./docs/tsgo-boundary.md).

This package is third-party and does not imply Effect project endorsement.
Its product identity and rule namespace are version-neutral. The currently
supported Effect major and exact reviewed release are machine-readable in
`package.json` and [`compatibility.json`](./compatibility.json). Installing the
plugin selects that compatibility contract; configuration does not repeat it.

## Install

```sh
bun add -d @phibkro/oxlint-effect-plugin oxlint
```

The package ships compiled ESM JavaScript with declarations and source maps;
consumers never need a TypeScript runtime loader. Loading is verified under
Bun and Node; Deno has a narrower [declared journey](./compatibility.json).

## Use

Quick start with an explicit rule. Role and platform are required and
authoritative:

```jsonc
// .oxlintrc.json
{
  "jsPlugins": [{ "name": "effect", "specifier": "@phibkro/oxlint-effect-plugin" }],
  "rules": {
    "effect/no-ambient-console": [
      "error",
      { "role": "application", "platform": "portable" },
    ],
  },
}
```

The plugin defines the Effect enforcement domain. Projects declare role,
platform, and boundary context once:

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";
import {
  effect,
  importClosurePolicy,
  type EffectConfigInput,
} from "@phibkro/oxlint-effect-plugin";

const effectConfig = {
  trustedPureDependencies: [
    {
      specifier: "date-fns/format",
      reason: "reviewed total transform over caller-owned Date values",
    },
  ],
  rules: {
    "no-raw-json-parse": "off", // explicit project dialect override
  },
  groups: [
    { files: ["src/domain/**"], role: "effect-library", platform: "portable" },
    { files: ["src/services/**"], role: "service", platform: "portable" },
    {
      files: ["src/legacy/**"],
      role: "application",
      platform: "portable",
      strictness: "recommended", // explicit lowering
    },
    { files: ["src/main.ts"], role: "composition-root", platform: "node" },
    {
      files: ["src/adapters/node/**"],
      role: "runtime-adapter",
      platform: "node",
      adapterDependencies: ["stripe"],
    },
    { files: ["**/*.test.ts"], role: "test", platform: "portable" },
  ],
} satisfies EffectConfigInput;

export default defineConfig({
  ...effect(effectConfig),
});

// Project import-graph policy from the same declaration.
const closure = importClosurePolicy(effectConfig);
```

Strict enforcement is the default. Set `strictness: "recommended"` at project
or group level only when you intend to lower the rule collection. Role,
platform, and boundary determine applicability. Use `rules` or
`severityOverrides` for explicit severity changes.

## Rules

<!-- BEGIN GENERATED RULES (bun run gen) -->

| rule | code | family | default | roles | boundary | strictness |
| --- | --- | --- | --- | --- | --- | --- |
| [`effect/no-ambient-console`](./docs/rules/no-ambient-console.md) | EFT2101 | observability | error | pure-library, effect-library, service, application, composition-root, runtime-adapter | — | recommended, strict |
| [`effect/no-ambient-authority`](./docs/rules/no-ambient-authority.md) | EFT2201 | capability | error | pure-library, effect-library, service, application | — | recommended, strict |
| [`effect/no-cross-runtime`](./docs/rules/no-cross-runtime.md) | EFT2301 | platform | error | pure-library, effect-library, service, application, composition-root, runtime-adapter, test | — | recommended, strict |
| [`effect/no-premature-execution`](./docs/rules/no-premature-execution.md) | EFT4101 | execution | error | pure-library, effect-library, service, application, runtime-adapter | — | recommended, strict |
| [`effect/no-native-promise-control-flow`](./docs/rules/no-native-promise-control-flow.md) | EFT3101 | computation | error | effect-library, service, application, runtime-adapter | — | strict |
| [`effect/no-raw-json-parse`](./docs/rules/no-raw-json-parse.md) | EFT1201 | boundary | error | pure-library, effect-library, service, application, composition-root, runtime-adapter | external-data | recommended, strict |
| [`effect/no-untyped-throw`](./docs/rules/no-untyped-throw.md) | EFT3201 | failure | error | pure-library, effect-library, service, application | — | strict |
| [`effect/no-opaque-instance-fields`](./docs/rules/no-opaque-instance-fields.md) | EFT1101 | modeling | error | pure-library, effect-library, service, application, composition-root, runtime-adapter, test | — | recommended, strict |
| [`effect/no-import-from-barrel-package`](./docs/rules/no-import-from-barrel-package.md) | EFT5102 | architecture | off | pure-library, effect-library, service, application, composition-root, runtime-adapter, test | — | recommended, strict |

Domains — roles: pure-library, effect-library, service, application, composition-root, runtime-adapter, test; platforms: portable, node, bun, deno, browser, web-worker; boundaries: external-data, observability, security-sensitive, persistence.
<!-- END GENERATED RULES -->

## Reasoned escapes

A local exception names one exact rule. The next comment gives a nonempty reason.
The pair applies to the next syntax node in the same lexical block.

```ts
// oxlint-effect-plugin allow(no-ambient-console):
// reason: the vendor payload must be inspected before it enters the adapter
console.dir(payload);
```

A file can leave the profile only through a visible top-level opt-out:

```ts
// oxlint-effect-plugin ignore-file:
// reason: generated vendor bindings wrapped by PaymentClient
```

Broad, duplicate, misplaced, missing-reason, unused, and stale local exceptions fail the escape audit.
Late or missing-reason file opt-outs also fail.

The coordinator supplies AST-derived syntax and block ranges with normalized rule diagnostics to `auditEffectTSEscapes`.
It then emits only `remainingDiagnostics` and fails all returned audit findings.

Native Oxlint or ESLint disable directives run before plugin rules.
Use [`auditNativeDisableDirectives`](./docs/suppression-audit.md) as a required host gate.

## Diagnostics, import policy, and agent guidance

`translateOxlintJson` joins native Oxlint JSON with stable `EFT` codes, invariants, proof sources, help, documentation, and safe edits.
`explainEffectTS` resolves a code or rule without filesystem authority.

```sh
effectts explain EFT3101
oxlint --format json | effectts translate --plugin effect
```

`importClosurePolicy` projects the same `EffectConfigInput` declaration used by
`effect` into copied trusted-pure records and per-group
`{ files, role, platform, adapterDependencies }` context. The coordinator maps
resolved importer files to that context and passes the projected trusted-pure
records to the pure [`evaluateImportClosure`](./docs/import-closure.md) gate.
The gate does not claim to prove package purity.

Agent assets ship under [`guidance/`](./guidance/), including an `AGENTS.md` fragment, a portable skill, prompts, and machine-readable knowledge.

## AST, scope, and typed companions

Custom rules use Oxc AST plus resolved lexical binding identity. Oxlint does
not expose TypeScript types to JavaScript plugin rules. Generic typed rules can
run through the pinned Oxlint typed engine, while Effect-specific typed
diagnostics run through the pinned `@effect/tsgo` language service; the
[companion boundary](./docs/tsgo-boundary.md) records the non-duplicating split
and the remaining typed Promise-chain gap.

## Development

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check        # format, lint, types, unit tests, generation drift, oracle matrix
bun run accept:0001  # pack + isolated Bun/Node/Deno consumer journeys
```

`dist/` is ignored output, never commit evidence. Produce an artifact with
standard `bun pm pack`, whose checked `prepack` lifecycle deletes, rebuilds,
and verifies `dist/`. Do not use `bun pm pack --ignore-scripts`: that flag is
reserved here for installing the already-built artifact into consumers and
would deliberately bypass the producer invariant.

The first tracer is specified in
[`design-specs/0001-reusable-effect-domains.md`](./design-specs/0001-reusable-effect-domains.md);
prior art and provenance are recorded in [`PROVENANCE.md`](./PROVENANCE.md).

This repository was extracted as an independent product from the Semantic
Systems design frontier recorded at source commit
`4d1f6947c0c5b8ba802f4e2ddf6ff8325e053ddd`. Semantic Systems is a consumer,
not package authority.

## License

[MIT](./LICENSE)
