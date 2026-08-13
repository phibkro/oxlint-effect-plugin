import type { Schema } from "effect";
import * as Effect from "effect/Effect";

export type Model = Schema.Schema<string>;
export const succeed = Effect.succeed;
