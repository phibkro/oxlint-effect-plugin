// role: effect-library, platform: portable, boundary: external-data — raw
// JSON parsing at the boundary bypasses explicit Schema decoding.

export const decode = (wire: string): unknown => JSON.parse(wire); // expect: no-raw-json-parse
