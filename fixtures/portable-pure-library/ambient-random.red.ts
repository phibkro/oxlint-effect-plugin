// role: pure-library, platform: portable — ambient randomness is rejected.

export const roll = (): number => Math.random(); // expect: no-ambient-authority

export const token = (): string => crypto.randomUUID(); // expect: no-ambient-authority
