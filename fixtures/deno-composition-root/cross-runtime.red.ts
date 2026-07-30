// role: composition-root, platform: deno — node builtins, node globals, and
// browser windows are not part of the declared Deno surface.

import * as fs from "node:fs"; // expect: no-cross-runtime

export const stats = fs.statSync("/etc/hosts");

export const cwd = process.cwd(); // expect: no-cross-runtime

export const title = document.title; // expect: no-cross-runtime
