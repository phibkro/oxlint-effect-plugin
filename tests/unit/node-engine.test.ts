import { describe, expect, test } from "bun:test";

import { satisfiesNodeEngine } from "../../scripts/node-engine.js";

describe("satisfiesNodeEngine", () => {
  test("matches ^20.19.0 || >=22.12.0 exactly at major/minor boundaries", () => {
    for (const version of ["20.19.0", "v20.20.1", "22.12.0", "23.0.0", "24.18.0"]) {
      expect(satisfiesNodeEngine(version)).toBe(true);
    }
    for (const version of ["20.18.9", "21.9.0", "22.11.9", "19.99.0", "not-a-version"]) {
      expect(satisfiesNodeEngine(version)).toBe(false);
    }
  });
});
