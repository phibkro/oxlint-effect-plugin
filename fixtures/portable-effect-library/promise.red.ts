// role: effect-library, platform: portable (strict) — native Promise control
// flow bypasses Effect structured concurrency.

export async function load(url: string): Promise<string> { // expect: no-native-promise-control-flow
  const response = await Promise.resolve(url); // expect: no-native-promise-control-flow
  return response;
}

export const wait = new Promise<void>((resolve) => resolve()); // expect: no-native-promise-control-flow

export const both = Promise.all([wait, wait]); // expect: no-native-promise-control-flow
