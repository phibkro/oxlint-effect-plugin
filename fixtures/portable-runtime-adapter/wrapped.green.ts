// role: runtime-adapter, platform: portable (strict) — native Promise
// mechanics are admitted only inside Effect.tryPromise / Effect.promise /
// Effect.callback wrappers around external APIs.

import * as Effect from "effect/Effect";

export interface ExternalClient {
  readonly read: (key: string) => Promise<string>;
  readonly subscribe: (onValue: (value: string) => void, signal: AbortSignal) => void;
}

export const readEffect = (client: ExternalClient, key: string) =>
  Effect.tryPromise({
    try: async () => {
      const value = await client.read(key);
      return value.trim();
    },
    catch: (cause) => ({ _tag: "ReadFailed" as const, cause }),
  });

export const firstValue = (client: ExternalClient) =>
  Effect.callback<string>((resume) => {
    const controller = new AbortController();
    client.subscribe((value) => resume(Effect.succeed(value)), controller.signal);
    return Effect.sync(() => controller.abort());
  });

export const bridgedRead = (client: ExternalClient, key: string) =>
  Effect.callback<string>((resume, signal) => {
    void (async () => {
      const value = await client.read(key);
      if (!signal.aborted) resume(Effect.succeed(value));
    })();
  });
