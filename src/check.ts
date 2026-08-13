import type { EffxJsonOutput } from "./effx-types.js";
import { EffxFailure } from "./effx-types.js";
import { applyCheckPolicy } from "./policy-check.js";
import { loadEffxProject } from "./project.js";
import { runCheckProviders } from "./providers.js";

export interface CheckOptions {
  readonly cwd: string;
  readonly paths?: readonly string[];
}

export function check(options: CheckOptions): EffxJsonOutput {
  try {
    const project = loadEffxProject(options.cwd, options.paths);
    const providerResult = runCheckProviders(project);
    const diagnostics = applyCheckPolicy(project, providerResult.diagnostics);
    return { schemaVersion: 2, status: diagnostics.length === 0 ? 0 : 1, diagnostics };
  } catch (error) {
    const failure =
      error instanceof EffxFailure
        ? error
        : new EffxFailure("EFFX_INTERNAL", error instanceof Error ? error.message : String(error));
    return {
      schemaVersion: 2,
      status: 2,
      diagnostics: [],
      failure: { code: failure.code, message: failure.message },
    };
  }
}

export function renderCheckHuman(output: EffxJsonOutput): string {
  if (output.status === 2)
    return `effx check failed [${output.failure?.code ?? "EFFX_INTERNAL"}]: ${output.failure?.message ?? "unknown failure"}`;
  if (output.diagnostics.length === 0) return "effx check: clean";
  const lines = output.diagnostics.map(
    (diagnostic) =>
      `${diagnostic.severity}[${diagnostic.code}] ${diagnostic.source.uri}:${diagnostic.range.start}-${diagnostic.range.end}: ${diagnostic.message}`,
  );
  lines.push(
    `effx check: ${output.diagnostics.length} diagnostic${output.diagnostics.length === 1 ? "" : "s"}`,
  );
  return lines.join("\n");
}
