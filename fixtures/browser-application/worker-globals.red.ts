// role: application, platform: browser — worker-only and server-runtime
// globals are rejected in the browser domain.

importScripts("/vendor.js"); // expect: no-cross-runtime

export const pid = process.pid; // expect: no-cross-runtime, no-ambient-authority
