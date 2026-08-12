import { Effect } from "effect"

type Wrapper<A> = { readonly inner: A }
declare const wrappedEffect: Wrapper<Effect.Effect<number>>

type LocalEffect<A> = { readonly local: A }
declare const localLookalike: LocalEffect<number>

namespace Shadowed {
  export interface Effect<A> {
    readonly local: A
  }
  export declare const value: Effect<number>
}

/* probe:unsupported-wrapper */
wrappedEffect

/* probe:local-lookalike */
localLookalike

/* probe:shadowed-name */
Shadowed.value
