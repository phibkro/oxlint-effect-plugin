// role: runtime-adapter, platform: node (strict) — implements one declared
// platform capability by wrapping the runtime API behind Effect.tryPromise.

import * as Effect from "effect/Effect";
import * as fs from "node:fs/promises";

export class ReadFailed {
  readonly _tag = "ReadFailed";
  constructor(readonly cause: unknown) {}
}

export const readTextFile = (file: string) =>
  Effect.tryPromise({
    try: async () => await fs.readFile(file, "utf8"),
    catch: (cause) => new ReadFailed(cause),
  });
