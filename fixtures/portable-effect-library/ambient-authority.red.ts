// role: effect-library, platform: portable — ambient capabilities belong to
// declared Effect services. `process` is additionally a Node-identifying
// global inside the portable domain.

import * as Effect from "effect/Effect";

export const entropy = (): number => Math.random(); // expect: no-ambient-authority

export const request = fetch("https://example.com/data"); // expect: no-ambient-authority

export const later = (callback: () => void): void => {
  setTimeout(callback, 1_000); // expect: no-ambient-authority
};

export const home = process.env["HOME"]; // expect: no-ambient-authority, no-cross-runtime

/** Capturing nondeterminism in a thunk still hides the ambient clock. */
export const hiddenClock = Effect.sync(() => Date.now()); // expect: no-ambient-authority
