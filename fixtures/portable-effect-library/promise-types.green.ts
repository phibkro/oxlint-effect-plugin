// role: effect-library, platform: portable (strict) — Promise type references
// and declared external Promise signatures are never diagnosed; local
// shadowing of Promise is respected.

export interface ExternalClient {
  readonly load: (url: string) => Promise<string>;
}

export type Deferred<A> = Promise<A>;

export declare function externalLoad(url: string): Promise<Uint8Array>;

export const withLocalPromise = (Promise: { resolve: (n: number) => number }): number =>
  Promise.resolve(42);
