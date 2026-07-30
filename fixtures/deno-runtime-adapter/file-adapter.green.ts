// role: runtime-adapter, platform: deno — Deno authority is admitted only in
// its declared adapter.

import * as Effect from "effect/Effect";

export const readText = (path: string) =>
  Effect.tryPromise({
    try: () => Deno.readTextFile(path),
    catch: (cause) => ({ _tag: "ReadFailed" as const, cause }),
  });
