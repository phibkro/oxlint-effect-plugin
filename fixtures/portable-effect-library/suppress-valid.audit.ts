// role: effect-library, platform: portable — the raw Oxlint rule still reports
// this use; the external escape coordinator removes the matched diagnostic.

export const debugDump = (payload: unknown): void => {
  // oxlint-effect-plugin allow(no-ambient-console):
  // reason: inspecting a vendor payload before the adapter boundary
  console.dir(payload); // expect: no-ambient-console
};
