#!/usr/bin/env node

import { check, renderCheckHuman } from "./check.js";
import { translateOxlintJson } from "./diagnostics.js";
import { explainEffectTS, type EffectTSExplanation } from "./explain.js";
import { planGitHubReview, type PlanGitHubReviewInput } from "./github-review.js";

interface ProcessLike {
  readonly argv: readonly string[];
  readonly stdin: {
    setEncoding(encoding: "utf8"): void;
    on(event: "data", listener: (chunk: string) => void): void;
    on(event: "end", listener: () => void): void;
  };
  readonly stdout: { write(text: string): void };
  readonly stderr: { write(text: string): void };
  exitCode: number;
}
declare const process: ProcessLike & { readonly cwd: () => string };

const args = process.argv.slice(2);
const writeJson = (value: unknown): void =>
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

function readStdin(onInput: (input: string) => void): void {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    input += chunk;
  });
  process.stdin.on("end", () => onInput(input));
}

function writeExplanation(explanation: EffectTSExplanation): void {
  process.stdout.write(
    [
      `${explanation.code}: ${explanation.summary}`,
      `Invariant: ${explanation.invariant}`,
      `Family: ${explanation.family}`,
      `Why: ${explanation.rationale}`,
      `Help: ${explanation.help}`,
      `Proof: ${explanation.proofSources.join(", ")}`,
      `Docs: ${explanation.docs}`,
      ...explanation.limitations.map((limitation) => `Limitation: ${limitation}`),
      "",
    ].join("\n"),
  );
}

function usageError(message?: string): void {
  if (message !== undefined) process.stderr.write(`effx: ${message}\n`);
  process.stderr.write(
    "usage: effx check [--format json] [paths...]\n" +
      "       effx explain <EFT-code|rule> [--format json]\n" +
      "       effx translate [--plugin <alias>] < oxlint.json\n" +
      "       effx github plan < decoded-input.json\n",
  );
  process.exitCode = 2;
}

const command = args[0];
if (command === "check") {
  const formatIndex = args.indexOf("--format");
  const format = formatIndex < 0 ? "human" : args[formatIndex + 1];
  if (format !== "human" && format !== "json") usageError("--format requires json or human");
  else {
    const paths = args
      .slice(1)
      .filter(
        (argument, index) => argument !== "--format" && (index === 0 || args[index] !== "--format"),
      );
    const output = check({ cwd: process.cwd(), ...(paths.length === 0 ? {} : { paths }) });
    if (format === "json") writeJson(output);
    else process.stdout.write(`${renderCheckHuman(output)}\n`);
    process.exitCode = output.status;
  }
} else if (command === "explain") {
  const query = args[1];
  if (query === undefined || query.startsWith("--"))
    usageError("explain requires a diagnostic code or rule name");
  else {
    const explanation = explainEffectTS(query);
    if (explanation === null)
      usageError(`unknown diagnostic code or rule ${JSON.stringify(query)}`);
    else if (args.includes("--format") && args[args.indexOf("--format") + 1] === "json")
      writeJson(explanation);
    else writeExplanation(explanation);
  }
} else if (command === "translate") {
  const pluginIndex = args.indexOf("--plugin");
  const pluginName = pluginIndex === -1 ? "effect" : args[pluginIndex + 1];
  if (pluginName === undefined || pluginName.startsWith("--"))
    usageError("--plugin requires an Oxlint plugin alias");
  else
    readStdin((input) => {
      try {
        writeJson(translateOxlintJson(input, { pluginName }));
      } catch (error) {
        process.stderr.write(
          `effx: could not translate Oxlint JSON: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exitCode = 1;
      }
    });
} else if (command === "github" && args[1] === "plan") {
  readStdin((input) => {
    try {
      const decoded = JSON.parse(input) as PlanGitHubReviewInput;
      const plan = planGitHubReview(decoded);
      writeJson(plan);
      if (!plan.accepted) process.exitCode = 1;
    } catch (error) {
      process.stderr.write(
        `effx: could not plan GitHub review: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    }
  });
} else usageError();
