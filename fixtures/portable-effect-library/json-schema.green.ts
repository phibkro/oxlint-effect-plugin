// role: effect-library, platform: portable, boundary: external-data —
// external data crosses an explicit Schema decoding seam.

import * as Schema from "effect/Schema";

export const Payload = Schema.Struct({
  id: Schema.String,
  at: Schema.Number,
});

export const decodePayload = Schema.decodeUnknownEffect(Payload);
