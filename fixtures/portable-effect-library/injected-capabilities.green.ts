// role: effect-library, platform: portable — injected clock, random, crypto,
// network, config, and observability capabilities are the admitted
// alternative to ambient authority.

import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Random from "effect/Random";

export interface CryptoCapability {
  readonly randomUuid: import("effect/Effect").Effect<string>;
}

export interface NetworkCapability {
  readonly get: (url: string) => import("effect/Effect").Effect<Uint8Array>;
}

export interface Observability {
  readonly info: (message: string) => import("effect/Effect").Effect<void>;
}

export const sample = Effect.gen(function* () {
  const at = yield* Clock.currentTimeMillis;
  const noise = yield* Random.next;
  const region = yield* Config.String("REGION");
  yield* Effect.sleep("1 second");
  return { at: new Date(at), noise, region };
});

export const injectedIo = (
  crypto: CryptoCapability,
  network: NetworkCapability,
  observability: Observability,
) =>
  Effect.gen(function* () {
    const id = yield* crypto.randomUuid;
    const body = yield* network.get(`/items/${id}`);
    yield* observability.info(`received ${body.byteLength} bytes`);
    return body;
  });
