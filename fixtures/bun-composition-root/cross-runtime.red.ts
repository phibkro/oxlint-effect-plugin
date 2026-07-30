// role: composition-root, platform: bun — node modules and globals are not
// silently portable into the declared bun domain, and a node platform layer
// does not match a bun root.

import * as fs from "node:fs"; // expect: no-cross-runtime
import * as NodeServices from "@effect/platform-node/NodeServices"; // expect: no-cross-runtime

export const layer = NodeServices.layer;

export const stats = fs.statSync("/etc/hosts");

export const pid = process.pid; // expect: no-cross-runtime
