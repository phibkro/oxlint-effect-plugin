// role: effect-library, platform: portable — local shadowing of `console` is
// not an ambient-global violation.

export interface Sink {
  log(message: string): void;
}

export const withLocalConsole = (console: Sink): void => {
  console.log("this is the injected sink, not the ambient global");
};

export const blockScoped = (): number => {
  const console = { log: (_message: string) => 0 };
  console.log("shadowed");
  return 1;
};

export const localGlobalObject = (
  globalThis: { console: Sink },
): void => globalThis.console.log("injected object");
