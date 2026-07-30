// role: effect-library, platform: portable — one targeted suppression with a
// nonempty `dev only:` reason admits a genuinely developer-only statement.

export const debugDump = (payload: unknown): void => {
  // oxlint-effect-v4 allow(no-ambient-console): dev only: inspecting raw webhook payloads during integration bring-up
  console.dir(payload);
};
