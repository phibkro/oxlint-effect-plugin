// role: application, platform: portable (strict) — applications compose
// services but do not execute the program.

import * as Effect from "effect/Effect";

const program = Effect.succeed("value");

export const result = Effect.runPromiseExit(program); // expect: no-native-promise-control-flow

export const sync = Effect.runSyncExit(program); // expect: no-premature-execution
