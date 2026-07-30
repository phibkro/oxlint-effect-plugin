// Named adapter constructors are admitted only by their resolved import binding.

import { tryPromise } from "effect/Effect";

export const read = (client: { read: () => Promise<string> }) =>
  tryPromise({
    try: async () => client.read(),
    catch: (cause) => cause,
  });

export const shadowed = (
  tryPromise: (thunk: () => Promise<string>) => Promise<string>,
): Promise<string> => tryPromise(async () => "local, not Effect"); // expect: no-native-promise-control-flow
