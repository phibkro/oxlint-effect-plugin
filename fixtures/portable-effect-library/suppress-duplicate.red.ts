// Duplicate directive identity is not collapsed by target line: exactly one
// directive suppresses the hit, and the duplicate is rejected by the audit.

// oxlint-effect-plugin allow(no-ambient-console):
// reason: first integration bring-up exception
// oxlint-effect-plugin allow(no-ambient-console):
// reason: duplicate integration bring-up exception
console.log("bring-up"); // expect: no-ambient-console
