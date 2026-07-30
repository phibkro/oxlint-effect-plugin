// role: effect-library, platform: portable — local shadowing of `process` and
// `crypto` is not ambient authority and not a cross-runtime global.

export interface FakeProcess {
  env: Record<string, string | undefined>;
}

export interface FakeCrypto {
  randomUUID(): string;
}

export const readHome = (process: FakeProcess): string | undefined => process.env["HOME"];

export const makeToken = (crypto: FakeCrypto): string => crypto.randomUUID();
