// role: runtime-adapter, platform: bun — Node and Deno authority remain
// cross-runtime even though Bun offers compatibility APIs.

import * as fs from "node:fs/promises"; // expect: no-cross-runtime

export const read = fs.readFile;
export const denoOs = Deno.build.os; // expect: no-cross-runtime
