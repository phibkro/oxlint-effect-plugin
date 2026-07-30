// Named Effect and ManagedRuntime imports retain their module identity.

import { runSync as executeSync } from "effect/Effect";
import { make as makeRuntime } from "effect/ManagedRuntime";

declare const program: unknown;
declare const layer: unknown;

export const executed = executeSync(program); // expect: no-premature-execution
export const runtime = makeRuntime(layer); // expect: no-premature-execution
