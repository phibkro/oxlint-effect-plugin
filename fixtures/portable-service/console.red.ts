// role: service, platform: portable — ambient console is severe in services.

import * as Effect from "effect/Effect";

export const audit = (entry: string) =>
  Effect.sync(() => {
    console.error("audit", entry); // expect: no-ambient-console
    return entry.length;
  });
