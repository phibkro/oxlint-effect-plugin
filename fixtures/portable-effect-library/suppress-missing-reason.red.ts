// role: effect-library, platform: portable — an empty reason is rejected by
// the escape coordinator; the raw console diagnostic also remains.

export const debugDump = (payload: unknown): void => {
  // oxlint-effect-plugin allow(no-ambient-console):
  // reason:
  console.dir(payload); // expect: no-ambient-console
};
