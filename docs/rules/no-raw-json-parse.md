# effect-v4/no-raw-json-parse

Family: external-decoding · Default severity: error

## Rationale

External JSON must cross an explicit Effect Schema decoding seam instead of raw JSON.parse. Only JSON syntax is claimed; other syntaxes require their own parser/Schema seam.

## Applicability (domains select rules, never severity)

- Roles: pure-library, effect-library, service, application, composition-root, runtime-adapter
- Required boundary: external-data

## Limitation

Flags ambient bare or statically global-object-qualified `JSON.parse`; parsing behind aliases, wrappers, computed dynamic properties, or other syntaxes escapes analysis. Lint enforces the seam, it does not validate data.
