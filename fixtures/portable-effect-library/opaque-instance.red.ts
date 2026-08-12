import { Schema as S } from "effect";
import { Opaque as O, String, Struct } from "effect/Schema";

export class User extends S.Opaque<User>()(S.Struct({ name: S.String })) {
  // expect-next-line: no-opaque-instance-fields
  displayName(): string {
    return this.name;
  }

  static empty(): User {
    return S.decodeUnknownSync(User)({ name: "" });
  }
}

export class Account extends O<Account>()(Struct({ id: String })) {
  readonly localCache = new Map<string, string>(); // expect: no-opaque-instance-fields
}

export const Anonymous = class extends S.Opaque<unknown>()(S.Struct({ value: S.Number })) {
  // expect-next-line: no-opaque-instance-fields
  valueOf(): number {
    return this.value;
  }
};
