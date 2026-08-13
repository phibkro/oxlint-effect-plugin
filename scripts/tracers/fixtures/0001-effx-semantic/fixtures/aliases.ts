import { Effect, Effect as RenamedEffect } from "effect";
import * as EffectNamespace from "effect";

export type DirectImportedAlias<A, E = never, R = never> = Effect.Effect<A, E, R>;
export type WrappedEffectAlias<A, E = never, R = never> = DirectImportedAlias<A, E, R>;

export interface GenericEffectSubtype<A, E = never, R = never> extends Effect.Effect<A, E, R> {}

export interface LocalEffect<A = unknown> {
  readonly localValue: A;
}

export const directImportedAlias: DirectImportedAlias<number> = Effect.succeed(1);
export const wrappedEffectAlias: WrappedEffectAlias<number> = Effect.succeed(2);

export function makeEffect(): DirectImportedAlias<number> {
  return Effect.succeed(3);
}

export function makeGenericEffect<A>(value: A): GenericEffectSubtype<A> {
  return Effect.succeed(value) as GenericEffectSubtype<A>;
}

export const localLookalike: LocalEffect<number> = { localValue: 4 };

/* probe:direct-imported-effect */
Effect.succeed(0);
/* probe:renamed-imported-effect */
RenamedEffect.succeed(0);
/* probe:namespace-qualified-effect */
EffectNamespace.Effect.succeed(0);

/* probe:direct-type-alias-effect */
// oxlint-disable-next-line no-unused-expressions -- identity tracer requires an expression statement
directImportedAlias;

/* probe:wrapped-type-alias-effect */
// oxlint-disable-next-line no-unused-expressions -- identity tracer requires an expression statement
wrappedEffectAlias;

/* probe:function-returned-effect */
makeEffect();

/* probe:generic-effect-subtype */
makeGenericEffect("generic");

{
  // oxlint-disable-next-line no-shadow -- this fixture verifies shadowed Effect names
  const Effect = { succeed: (value: number): number => value };
  /* probe:shadowed-effect-name */
  Effect.succeed(0);
}

type MissingEffectAlias<A> = NotInstalledEffect<A>;
declare const unresolvedAlias: MissingEffectAlias<number>;
/* probe:unresolved-effect-alias */
// oxlint-disable-next-line no-unused-expressions -- identity tracer requires an expression statement
unresolvedAlias;

const opaqueWrapper = (value: unknown): unknown => value;
/* probe:opaque-wrapper-provenance */
opaqueWrapper(Effect.succeed(0));
/* probe:local-effect-lookalike */
// oxlint-disable-next-line no-unused-expressions -- identity tracer requires an expression statement
localLookalike;
