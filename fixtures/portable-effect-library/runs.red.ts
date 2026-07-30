// role: effect-library, platform: portable — libraries describe programs;
// execution belongs to the composition root.

import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Layer from "effect/Layer";

const program = Effect.succeed(1);

export const eager = Effect.runSync(program); // expect: no-premature-execution

export const eagerPromise = Effect.runPromise(program); // expect: no-native-promise-control-flow

export const runtime = ManagedRuntime.make(Layer.empty); // expect: no-premature-execution
