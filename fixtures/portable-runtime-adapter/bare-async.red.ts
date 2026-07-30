// role: runtime-adapter, platform: portable (strict) — Promise mechanics
// outside an Effect wrapper are rejected even in adapters.

export async function drain(reader: { next: () => Promise<string | null> }): Promise<void> { // expect: no-native-promise-control-flow
  await reader.next();
}

export const gate = new Promise<void>((resolve) => resolve()); // expect: no-native-promise-control-flow
