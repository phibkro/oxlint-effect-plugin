import { Schema as EffectSchema } from "effect";
import * as S from "effect/Schema";

export class User extends EffectSchema.Opaque<User>()(
  EffectSchema.Struct({ name: EffectSchema.String }),
) {
  constructor(input: { readonly name: string }) {
    super(input);
  }

  static empty(): User {
    return EffectSchema.decodeUnknownSync(User)({ name: "" });
  }
}

export class Account extends S.Opaque<Account>()(S.Struct({ id: S.String })) {}

const Schema = {
  Opaque: () => () => class {},
};

export class LocalLookalike extends Schema.Opaque()() {
  method(): string {
    return "local";
  }
}
