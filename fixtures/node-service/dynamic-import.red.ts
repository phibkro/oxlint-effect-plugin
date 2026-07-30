// A matching Node runtime admits the module identity, but a service still may
// not take filesystem authority ambiently.

export const fsModule = import("node:fs"); // expect: no-ambient-authority
