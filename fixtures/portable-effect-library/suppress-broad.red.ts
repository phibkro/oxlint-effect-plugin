// role: effect-library, platform: portable — a broad suppression is rejected
// and the console use itself stays reported.

export const debugDump = (payload: unknown): void => {
  // oxlint-effect-plugin allow(*):
  // reason: broad suppressions are forbidden
  console.dir(payload); // expect: no-ambient-console
};
