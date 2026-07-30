// role: test, platform: portable (strict) — tests may execute explicitly and
// use promise control flow for assertions.

import * as Effect from "effect/Effect";

const program = Effect.succeed(41);

export async function testAddsOne(): Promise<void> {
  const value = await Effect.runPromise(Effect.map(program, (n) => n + 1));
  if (value !== 42) {
    throw new Error(`expected 42, got ${value}`);
  }
}

export const sync = Effect.runSync(program);
