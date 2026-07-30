// High-confidence Promise syntax includes global-object qualification,
// immutable direct aliases, top-level for-await, and named Effect imports.

import { runPromise as executePromise } from "effect/Effect";

declare const program: unknown;
declare const stream: AsyncIterable<number>;

export const directGlobal = new globalThis.Promise<void>(() => {}); // expect: no-native-promise-control-flow
export const staticGlobal = globalThis.Promise.all([]); // expect: no-native-promise-control-flow

const NativePromise = globalThis.Promise;
export const aliased = NativePromise.resolve(1); // expect: no-native-promise-control-flow

for await (const item of stream) { // expect: no-native-promise-control-flow
  void item;
}

export const executed = executePromise(program); // expect: no-native-promise-control-flow
