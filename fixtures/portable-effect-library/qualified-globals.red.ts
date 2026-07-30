// Qualified ambient globals must retain the same capability/runtime/boundary
// meaning as their bare forms.

export const request = globalThis.fetch("https://example.com"); // expect: no-ambient-authority
export const token = globalThis.crypto.randomUUID(); // expect: no-ambient-authority
export const timer = globalThis.setTimeout(() => {}, 1); // expect: no-ambient-authority
export const home = globalThis.process.env["HOME"]; // expect: no-ambient-authority, no-cross-runtime
export const bun = globalThis.Bun.version; // expect: no-ambient-authority, no-cross-runtime
export const deno = globalThis.Deno.version; // expect: no-ambient-authority, no-cross-runtime
export const decoded = globalThis.JSON.parse("{}"); // expect: no-raw-json-parse
