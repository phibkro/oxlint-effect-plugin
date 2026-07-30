// role: runtime-adapter, platform: node (strict) — a node adapter cannot
// reach for Bun or browser surfaces.

import * as Effect from "effect/Effect";

export const readViaBun = (file: string) =>
  Effect.tryPromise({
    try: () => Bun.file(file).text(), // expect: no-cross-runtime
    catch: (cause) => ({ _tag: "ReadFailed" as const, cause }),
  });

export const width = window.innerWidth; // expect: no-cross-runtime
