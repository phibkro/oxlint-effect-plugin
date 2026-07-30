// role: composition-root, platform: browser — browser root selects browser
// authority and performs final execution.

import * as Effect from "effect/Effect";

const program = Effect.log(`booting ${document.location.href}`);
export const started = Effect.runPromise(program);
