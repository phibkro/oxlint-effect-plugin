import { Effect as RenamedEffect } from "effect"
import * as EffectNamespace from "effect"
import type { Effect as ImportedEffect } from "effect"

export type DirectAlias<A, E = never, R = never> = ImportedEffect<A, E, R>
export type RenamedAlias<A, E = never, R = never> = DirectAlias<A, E, R>
export interface InterfaceSubtype<A, E = never, R = never> extends EffectNamespace.Effect<A, E, R> {}

export const directValue = RenamedEffect.succeed(1)
export const renamedValue = RenamedEffect.succeed(2)
export const namespaceValue = EffectNamespace.succeed(3)
export const aliasValue: DirectAlias<number> = RenamedEffect.succeed(4)
export const renamedAliasValue: RenamedAlias<number> = RenamedEffect.succeed(5)
export const subtypeValue: InterfaceSubtype<number> = RenamedEffect.succeed(6) as InterfaceSubtype<number>

export function returnedIdentity(): DirectAlias<number> {
  return RenamedEffect.succeed(7)
}

/* probe:direct-import */
RenamedEffect.succeed(8)

/* probe:renamed-import */
RenamedEffect.succeed(9)

/* probe:namespace-qualified */
EffectNamespace.succeed(10)

/* probe:type-alias */
aliasValue

/* probe:renamed-type-alias */
renamedAliasValue

/* probe:interface-subtype */
subtypeValue

/* probe:function-returned */
returnedIdentity()
