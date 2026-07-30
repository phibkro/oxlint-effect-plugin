// Resolved lexical binding identity prevents same-spelled locals from being
// attributed to the Effect imports they shadow.

import * as Effect from "effect/Effect";
import { runPromise } from "effect/Effect";

export const shadowNamespace = (
  Effect: { readonly runSync: (value: number) => number },
): number => Effect.runSync(1);

export const shadowNamed = (
  runPromise: (value: number) => number,
): number => runPromise(1);
