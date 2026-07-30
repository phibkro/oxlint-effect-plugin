# Native suppression audit boundary

Oxlint and ESLint process native disable directives before invoking JavaScript
rules. Consequently, no plugin rule can make its own execution tamper-proof:
a broad native disable or one targeting `effect/*` can prevent the rule from
observing the source.

`auditNativeDisableDirectives(sourceText, { pluginNames })` is a portable,
side-effect-free host-gate exported by this package. It rejects:

- broad `oxlint-disable*` and `eslint-disable*` directives; and
- native directives targeting any configured plugin alias.

It does not reject targeted native directives for unrelated rules. Hosts own
file discovery and must run the audit independently of Oxlint. This repository
runs its filesystem adapter during `bun run check`.

The audit is a bounded lexical comment scan, not a parser or proof. A host that
transforms source before linting must audit the exact source presented to
Oxlint. The custom targeted `oxlint-effect-plugin allow(no-ambient-console): dev
only: <reason>` directive remains the only package-defined console exception.
