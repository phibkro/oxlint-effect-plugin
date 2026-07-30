// role: runtime-adapter, platform: deno — Node/Bun compatibility surfaces are
// not silently Deno-native.

import * as fs from "node:fs/promises"; // expect: no-cross-runtime

export const read = fs.readFile;
export const bunVersion = Bun.version; // expect: no-cross-runtime
