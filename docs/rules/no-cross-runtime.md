# effect-v4/no-cross-runtime

Family: platform-portability · Default severity: error

## Rationale

A declared runtime-platform domain admits only its own built-ins, globals, and platform layers. Compatibility APIs provided by another runtime are not silently portable, and official platform live layers belong only to a matching composition-root or runtime-adapter.

## Applicability (domains select rules, never severity)

- Roles: pure-library, effect-library, service, application, composition-root, runtime-adapter, test
- Required boundary: none

## Limitation

Classifies static import specifiers and runtime-identifying globals; computed dynamic imports and feature detection escape analysis. `self`/`navigator`/`location` are admitted in both browser and web-worker domains.

