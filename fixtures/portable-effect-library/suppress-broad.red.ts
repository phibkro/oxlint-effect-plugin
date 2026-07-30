// role: effect-library, platform: portable — a broad suppression is rejected
// and the console use itself stays reported.

export const debugDump = (payload: unknown): void => {
  // expect-next-line: no-ambient-console
  // oxlint-effect-plugin allow(*): dev only: broad suppressions are rejected
  console.dir(payload); // expect: no-ambient-console
};
