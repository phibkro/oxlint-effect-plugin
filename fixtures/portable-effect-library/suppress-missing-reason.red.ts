// role: effect-library, platform: portable — a suppression without a nonempty
// `dev only:` reason is rejected and the console use stays reported.

export const debugDump = (payload: unknown): void => {
  // expect-next-line: no-ambient-console
  // oxlint-effect-plugin allow(no-ambient-console): dev only:
  console.dir(payload); // expect: no-ambient-console
};
