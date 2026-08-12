import { Effect as Fx, type Schema } from "effect"; // expect: no-import-from-barrel-package
import * as EffectRoot from "effect"; // expect: no-import-from-barrel-package

export type Program = Fx.Effect<void>;
export type Model = Schema.Schema<string>;
export const succeed = EffectRoot.Effect.succeed;
