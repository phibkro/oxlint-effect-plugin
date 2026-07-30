# Oxlint Effect Plugin

`@phibkro/oxlint-effect-plugin` is a reusable, compiled Oxlint JavaScript plugin
for explicit Effect v4 architecture, capability, runtime-platform, and
semantic-boundary policies. It provides high-confidence **syntax and scope**
diagnostics only — never type-aware proof; type-aware Effect diagnostics are
delegated to the [`@effect/tsgo`](./docs/tsgo-boundary.md) companion.

This package is third-party and does not imply Effect project endorsement.
Its product identity and rule namespace are version-neutral. The currently
supported Effect major and exact reviewed release are machine-readable in
`package.json` and [`compatibility.json`](./compatibility.json); configuration
selects that compatibility contract through the `effect-v4` technology domain.

## Install

```sh
bun add -d @phibkro/oxlint-effect-plugin oxlint
```

The package ships compiled ESM JavaScript with declarations and source maps;
consumers never need a TypeScript runtime loader. Loading is verified under
Bun and Node; Deno has a narrower [declared journey](./compatibility.json).

## Use

Quick start with an explicit rule (the technology axis is required and
authoritative):

```jsonc
// .oxlintrc.json
{
  "jsPlugins": [{ "name": "effect", "specifier": "@phibkro/oxlint-effect-plugin" }],
  "rules": {
    "effect/no-ambient-console": ["error", { "technology": "effect-v4", "role": "application", "platform": "portable" }]
  }
}
```

Real projects declare their domain structure once and expand it:

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";
import { expandDomains } from "@phibkro/oxlint-effect-plugin";

export default defineConfig({
  ...expandDomains({
    technology: "effect-v4",
    groups: [
      { files: ["src/domain/**"], role: "effect-library", platform: "portable", strictness: "strict" },
      { files: ["src/services/**"], role: "service", platform: "portable" },
      { files: ["src/main.ts"], role: "composition-root", platform: "node" },
      { files: ["src/adapters/node/**"], role: "runtime-adapter", platform: "node" },
      { files: ["**/*.test.ts"], role: "test", platform: "portable" },
    ],
  }),
});
```

Domains determine **applicability, not severity**: a rule is enabled for a
file group exactly when the group's declared role (and, where required,
boundary) is in the rule's applicability set. Severity can be overridden per
group via `severityOverrides`.

## Rules

<!-- BEGIN GENERATED RULES (bun run gen) -->

| rule | family | roles | boundary | preset |
| --- | --- | --- | --- | --- |
| [`effect/no-ambient-console`](./docs/rules/no-ambient-console.md) | observability-capability | pure-library, effect-library, service, application, composition-root, runtime-adapter | — | recommended |
| [`effect/no-ambient-authority`](./docs/rules/no-ambient-authority.md) | ambient-capability | pure-library, effect-library, service, application | — | recommended |
| [`effect/no-cross-runtime`](./docs/rules/no-cross-runtime.md) | platform-portability | pure-library, effect-library, service, application, composition-root, runtime-adapter, test | — | recommended |
| [`effect/no-premature-execution`](./docs/rules/no-premature-execution.md) | execution-topology | pure-library, effect-library, service, application, runtime-adapter | — | recommended |
| [`effect/no-native-promise-control-flow`](./docs/rules/no-native-promise-control-flow.md) | execution-topology | effect-library, service, application, runtime-adapter | — | strict |
| [`effect/no-raw-json-parse`](./docs/rules/no-raw-json-parse.md) | external-decoding | pure-library, effect-library, service, application, composition-root, runtime-adapter | external-data | recommended |
| [`effect/no-untyped-throw`](./docs/rules/no-untyped-throw.md) | typed-failure | pure-library, effect-library, service, application | — | strict |

Domains — roles: pure-library, effect-library, service, application, composition-root, runtime-adapter, test; platforms: portable, node, bun, deno, browser, web-worker; boundaries: external-data, observability, security-sensitive, persistence.
<!-- END GENERATED RULES -->

## Suppressing the console rule

A genuinely developer-only statement may carry one targeted suppression with
a nonempty `dev only:` reason:

```ts
// oxlint-effect-plugin allow(no-ambient-console): dev only: inspecting raw webhook payloads
console.dir(payload);
```

Broad, missing-reason, and unused directives are themselves reported.
Because native Oxlint/ESLint disable directives run before plugin rules, use
the independent [`auditNativeDisableDirectives`](./docs/suppression-audit.md)
host gate to prevent bypass.

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

The first tracer is specified in
[`design-specs/0001-reusable-effect-domains.md`](./design-specs/0001-reusable-effect-domains.md);
prior art and provenance are recorded in [`PROVENANCE.md`](./PROVENANCE.md).

This repository was extracted as an independent product from the Semantic
Systems design frontier recorded at source commit
`4d1f6947c0c5b8ba802f4e2ddf6ff8325e053ddd`. Semantic Systems is a consumer,
not package authority.

## License

[MIT](./LICENSE)
