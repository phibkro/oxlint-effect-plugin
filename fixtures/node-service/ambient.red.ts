// role: service, platform: node — even on the matching runtime, services take
// capabilities from the Effect environment, not ambiently. The node platform
// admits `process` and `node:fs` (no cross-runtime diagnostics here); the
// ambient-authority diagnostics remain.

import * as fs from "node:fs/promises"; // expect: no-ambient-authority

export const home = process.env["HOME"]; // expect: no-ambient-authority

export const read = (file: string) => fs.readFile(file, "utf8");
