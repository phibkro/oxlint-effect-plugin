// role: pure-library, platform: portable — ambient clock observations are rejected.

export const stampNow = (): number => Date.now(); // expect: no-ambient-authority

export const today = (): Date => new Date(); // expect: no-ambient-authority

export const legacyClock = (): string => Date(); // expect: no-ambient-authority
