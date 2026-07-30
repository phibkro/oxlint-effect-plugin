# effect-v4/no-ambient-console

Family: observability-capability · Default severity: error

## Rationale

Ambient console output bypasses the Effect observability capability (levels, spans, structured output, redaction). Severe in Effect-bearing operational code; a genuinely developer-only statement carries one targeted nonempty `dev only:` suppression.

## Applicability (domains select rules, never severity)

- Roles: pure-library, effect-library, service, application, composition-root, runtime-adapter
- Required boundary: none

## Limitation

Detects ambient `console` member access and `globalThis`/`window`/`self.console`; aliased references (`const c = console`) escape syntax analysis. Native oxlint/eslint disable comments bypass this policy and should be restricted in review.

## Suppression contract

```ts
// oxlint-effect-v4 allow(no-ambient-console): dev only: <nonempty reason>
console.dir(payload);
```

The directive must target exactly this rule and carry a nonempty `dev only:` reason; it applies to the next line (or its own line when trailing). Broad, missing-reason, and unused directives are themselves reported.
