/** Exact runtime predicate for package engines `^20.19.0 || >=22.12.0`. */
export function satisfiesNodeEngine(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  if (match === null) return false;
  const major = Number.parseInt(match[1] ?? "", 10);
  const minor = Number.parseInt(match[2] ?? "", 10);
  return (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22;
}
