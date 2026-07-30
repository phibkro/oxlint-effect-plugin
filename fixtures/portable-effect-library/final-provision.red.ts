// role: effect-library, platform: portable — final provision of an official
// platform layer prematurely closes the library's requirements, and the
// platform-layer import itself violates the portable domain.

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices"; // expect: no-cross-runtime

const program = Effect.succeed(1);

export const closed = Effect.provide(program, NodeServices.layer); // expect: no-premature-execution
