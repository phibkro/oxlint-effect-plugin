// role: runtime-adapter, platform: bun (strict) — wraps Bun's file API behind
// Effect.tryPromise.

import * as Effect from "effect/Effect";

export class WriteFailed {
  readonly _tag = "WriteFailed";
  constructor(readonly cause: unknown) {}
}

export const writeTextFile = (file: string, contents: string) =>
  Effect.tryPromise({
    try: () => Bun.write(file, contents),
    catch: (cause) => new WriteFailed(cause),
  });
