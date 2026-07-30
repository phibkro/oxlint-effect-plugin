// All static module edges carry the same authority and runtime identity.

export const fsModule = import("node:fs"); // expect: no-ambient-authority, no-cross-runtime
export { readFile } from "node:fs/promises"; // expect: no-ambient-authority, no-cross-runtime
export * from "node:child_process"; // expect: no-ambient-authority, no-cross-runtime
