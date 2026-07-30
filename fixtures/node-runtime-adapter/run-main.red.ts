// A named platform runtime entry point still executes outside the composition
// root; a same-spelled parameter does not inherit its binding.

import { runMain } from "@effect/platform-node/NodeRuntime";

declare const program: unknown;
runMain(program); // expect: no-premature-execution

export const shadowed = (runMain: (value: number) => number): number => runMain(1);
