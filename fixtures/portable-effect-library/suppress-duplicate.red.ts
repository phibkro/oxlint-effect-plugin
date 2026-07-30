// Duplicate directive identity is not collapsed by target line: exactly one
// directive suppresses the hit and the duplicate is reported unused.

console.log("bring-up"); /* oxlint-effect-v4 allow(no-ambient-console): dev only: first */ /* oxlint-effect-v4 allow(no-ambient-console): dev only: duplicate */ // expect: no-ambient-console
