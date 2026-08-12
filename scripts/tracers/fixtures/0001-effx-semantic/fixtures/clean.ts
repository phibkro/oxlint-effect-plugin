import { Effect } from "effect";

export const program = Effect.succeed(1);

const count = 1;
// oxlint-disable-next-line no-unused-expressions -- verifies ordinary expressions stay unclassified
count + 1;
