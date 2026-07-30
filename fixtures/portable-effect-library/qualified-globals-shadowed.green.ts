// A local value named globalThis is not ambient authority.

interface LocalGlobals {
  readonly fetch: (url: string) => string;
  readonly crypto: { readonly randomUUID: () => string };
  readonly setTimeout: (task: () => void, milliseconds: number) => number;
  readonly process: { readonly env: Readonly<Record<string, string>> };
  readonly Bun: { readonly version: string };
  readonly Deno: { readonly version: string };
  readonly JSON: { readonly parse: (text: string) => unknown };
}

export const local = (globalThis: LocalGlobals) => ({
  request: globalThis.fetch("/"),
  token: globalThis.crypto.randomUUID(),
  timer: globalThis.setTimeout(() => {}, 1),
  home: globalThis.process.env["HOME"],
  bun: globalThis.Bun.version,
  deno: globalThis.Deno.version,
  decoded: globalThis.JSON.parse("{}"),
});
