// role: composition-root, platform: web-worker — worker root selects worker
// authority and performs final execution.

import * as Effect from "effect/Effect";

const program = Effect.log(`worker ${self.location.href}`);
export const started = Effect.runPromise(program);
