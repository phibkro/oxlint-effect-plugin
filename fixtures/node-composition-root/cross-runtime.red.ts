// role: composition-root, platform: node — other runtimes' surfaces are not
// silently portable into the node domain.

import { Database } from "bun:sqlite"; // expect: no-cross-runtime

export const db = new Database(":memory:");

export const contents = Bun.file("/etc/hosts"); // expect: no-cross-runtime

export const home = Deno.env.get("HOME"); // expect: no-cross-runtime
