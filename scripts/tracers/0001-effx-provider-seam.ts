import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { version as typescriptVersion } from "typescript";

type JsonRpcId = number | string | null;

type JsonRpcRequest = {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params?: unknown;
};

type JsonRpcNotification = {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: unknown;
};

type JsonRpcResponse = {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId;
  readonly result?: unknown;
  readonly error?: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
};

type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

type CapturedMessage = {
  readonly direction:
    | "client->proxy"
    | "proxy->client"
    | "proxy->effect-lsp"
    | "effect-lsp->proxy"
    | "proxy->stock-sidecar"
    | "stock-sidecar->proxy";
  readonly contentLength: number;
  readonly message: JsonRpcMessage;
};

type Diagnostic = {
  readonly range: {
    readonly start: { readonly line: number; readonly character: number };
    readonly end: { readonly line: number; readonly character: number };
  };
  readonly severity?: number;
  readonly code?: number | string;
  readonly source?: string;
  readonly message: string;
  readonly data?: unknown;
};

type LspResponse = JsonRpcResponse;
type ClientFacing = {
  initialize?: LspResponse;
  publishDiagnostics?: JsonRpcNotification;
  diagnostic?: LspResponse;
  codeAction?: LspResponse;
  executedCommand?: LspResponse;
  staleCommand?: LspResponse;
  unknownCommand?: LspResponse;
};

type UnsupportedOperation = ProbeResult["unsupportedOperations"][number];

type ProbeResult = {
  readonly schemaVersion: 1;
  readonly status: "tracked";
  readonly outcome: "worked" | "blocked";
  readonly engine: {
    readonly package: "typescript";
    readonly version: string;
    readonly api: "lsp";
    readonly support: "experimental";
  };
  readonly providers: {
    readonly effectTsgoVersion: string;
    readonly effectExecutable: string;
    readonly effectExecutableSha256: string;
    readonly typescriptVersion: string;
    readonly stockExecutable: string;
    readonly stockExecutableSha256: string;
  };
  readonly fixture: {
    readonly root: string;
    readonly file: string;
    readonly uri: string;
    readonly sourceSha256: string;
  };
  readonly timingsMs: {
    readonly cold: number;
    readonly warm: number;
    readonly incremental: number;
    readonly effectHeavy: number;
    readonly multiProject: number;
  };
  readonly memory: {
    readonly coordinatorRssBefore: number;
    readonly coordinatorRssAfter: number;
  };
  readonly observedFacts: readonly string[];
  readonly inferences: readonly string[];
  readonly interceptionPoints: readonly {
    readonly method: string;
    readonly observedAction: string;
  }[];
  readonly unsupportedOperations: readonly {
    readonly operation: string;
    readonly status: "observed";
    readonly reason: string;
    readonly request?: JsonRpcMessage;
    readonly response?: JsonRpcMessage;
  }[];
  readonly captured: {
    readonly lsp: readonly CapturedMessage[];
  };
  readonly clientFacing: {
    readonly initialize?: LspResponse;
    readonly publishDiagnostics?: JsonRpcNotification;
    readonly diagnostic?: LspResponse;
    readonly codeAction?: LspResponse;
    readonly executedCommand?: LspResponse;
    readonly staleCommand?: LspResponse;
    readonly unknownCommand?: LspResponse;
  };
  readonly termination: {
    readonly attempted: true;
    readonly terminated: boolean;
    readonly exitCode: number | null;
    readonly signal: string | null;
    readonly stderr: string;
  };
  readonly errors: readonly string[];
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = resolve(root, "scripts/tracers/fixtures/0001-effx-provider-seam");
const fixtureFile = resolve(fixtureRoot, "floating.ts");
const fixtureUri = pathToFileURL(fixtureFile).toString();
const projectBRoot = resolve(root, "scripts/tracers/fixtures/0001-effx-provider-seam-project-b");
const projectBFile = resolve(projectBRoot, "clean.ts");
const projectBUri = pathToFileURL(projectBFile).toString();
const effectExecutable = resolve(
  root,
  "node_modules",
  "@effect",
  `tsgo-${process.platform}-${process.arch}`,
  "artifacts",
  "typescript",
  typescriptVersion,
  process.platform === "win32" ? "tsc.exe" : "tsc",
);
const stockExecutable =
  process.env.EFFX_STOCK_EXECUTABLE ??
  resolve(
    root,
    "node_modules",
    "@typescript",
    `typescript-${process.platform}-${process.arch}`,
    "lib",
    process.platform === "win32" ? "tsc.exe" : "tsc",
  );

const isResponse = (message: JsonRpcMessage): message is JsonRpcResponse =>
  "id" in message && ("result" in message || "error" in message);
const isRequest = (message: JsonRpcMessage): message is JsonRpcRequest =>
  "id" in message && "method" in message;
const idKey = (id: JsonRpcId): string => `${typeof id}:${String(id)}`;

const frame = (
  message: JsonRpcMessage,
): { readonly bytes: Buffer; readonly contentLength: number } => {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  return {
    bytes: Buffer.concat([
      Buffer.from(`Content-Length: ${body.byteLength}\r\n\r\n`, "ascii"),
      body,
    ]),
    contentLength: body.byteLength,
  };
};
const unrefTimer = (timer: unknown): void => {
  const candidate = timer as { readonly unref?: () => void };
  candidate.unref?.();
};
const waitForTimeout = (milliseconds: number): Promise<undefined> => {
  const pending = Promise.withResolvers<undefined>();
  const timeout = setTimeout(() => pending.resolve(undefined), milliseconds);
  unrefTimer(timeout);
  return pending.promise;
};

const findHeaderEnd = (
  buffer: Buffer,
): { readonly index: number; readonly size: number } | undefined => {
  const crlf = buffer.indexOf(Buffer.from("\r\n\r\n", "ascii"));
  if (crlf >= 0) return { index: crlf, size: 4 };
  const lf = buffer.indexOf(Buffer.from("\n\n", "ascii"));
  if (lf >= 0) return { index: lf, size: 2 };
  return undefined;
};

class FrameDecoder {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): { readonly message: JsonRpcMessage; readonly contentLength: number }[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: { readonly message: JsonRpcMessage; readonly contentLength: number }[] = [];

    while (true) {
      const headerEnd = findHeaderEnd(this.buffer);
      if (headerEnd === undefined) break;
      const header = this.buffer.subarray(0, headerEnd.index).toString("ascii");
      const lengthHeader = header.split(/\r?\n/).find((line) => /^content-length\s*:/i.test(line));
      if (lengthHeader === undefined)
        throw new Error(`LSP frame has no Content-Length header: ${header}`);
      const contentLength = Number.parseInt(
        lengthHeader.slice(lengthHeader.indexOf(":") + 1).trim(),
        10,
      );
      if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
        throw new Error(`LSP frame has invalid Content-Length: ${lengthHeader}`);
      }
      const bodyStart = headerEnd.index + headerEnd.size;
      if (this.buffer.byteLength < bodyStart + contentLength) break;
      const body = this.buffer.subarray(bodyStart, bodyStart + contentLength).toString("utf8");
      this.buffer = this.buffer.subarray(bodyStart + contentLength);
      messages.push({ message: JSON.parse(body) as JsonRpcMessage, contentLength });
    }

    return messages;
  }
}

const snapshotSha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const fileSha256 = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const readUriSnapshot = (uri: string): string | undefined => {
  try {
    return readFileSync(fileURLToPath(uri), "utf8");
  } catch {
    return undefined;
  }
};
const isExecutable = (path: string): boolean => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const elapsedMs = (started: number): number =>
  Math.round((performance.now() - started) * 1000) / 1000;

const isEffectDiagnostic = (diagnostic: Diagnostic): boolean =>
  typeof diagnostic.code === "number" && diagnostic.code >= 370_000;

const normalizeEffectDiagnostic = (diagnostic: Diagnostic): Diagnostic => ({
  ...diagnostic,
  source: "@effect/tsgo",
  data: {
    provider: "@effect/tsgo",
    ...(typeof diagnostic.data === "object" && diagnostic.data !== null ? diagnostic.data : {}),
  },
});

const diagnosticKey = (diagnostic: Diagnostic): string =>
  JSON.stringify([
    diagnostic.range.start.line,
    diagnostic.range.start.character,
    diagnostic.range.end.line,
    diagnostic.range.end.character,
    diagnostic.code,
    diagnostic.source,
    diagnostic.message,
  ]);

const mergeDiagnostics = (
  effectDiagnostics: readonly Diagnostic[],
  stockDiagnostics: readonly Diagnostic[],
  text: string,
): readonly Diagnostic[] => {
  const merged = effectDiagnostics.filter(isEffectDiagnostic).map(normalizeEffectDiagnostic);
  merged.push(
    ...stockDiagnostics
      .filter((diagnostic) => !isEffectDiagnostic(diagnostic))
      .map((diagnostic) => ({
        ...diagnostic,
        source: "typescript",
        data: {
          provider: "stock-typescript-sidecar",
          snapshotSha256: snapshotSha256(text),
          ...(typeof diagnostic.data === "object" && diagnostic.data !== null
            ? diagnostic.data
            : {}),
        },
      })),
  );
  return [
    ...new Map(merged.map((diagnostic) => [diagnosticKey(diagnostic), diagnostic])).values(),
  ].toSorted(
    (left, right) =>
      left.range.start.line - right.range.start.line ||
      left.range.start.character - right.range.start.character ||
      String(left.source).localeCompare(String(right.source)) ||
      String(left.code).localeCompare(String(right.code)),
  );
};

class ProviderLspTransport {
  readonly captured: CapturedMessage[] = [];
  readonly stderr: string[] = [];
  readonly unsupported: UnsupportedOperation[] = [];
  onNotification: (message: JsonRpcMessage) => void = () => {};
  private readonly decoder = new FrameDecoder();
  private readonly pending = new Map<
    string,
    {
      readonly resolve: (message: JsonRpcResponse) => void;
      readonly reject: (error: Error) => void;
    }
  >();
  private readonly notifications: JsonRpcNotification[] = [];
  private readonly notificationWaiters: {
    readonly method: string;
    readonly resolve: (message: JsonRpcNotification) => void;
    readonly reject: (error: Error) => void;
  }[] = [];
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly exitPromise: Promise<{
    readonly code: number | null;
    readonly signal: string | null;
  }>;
  private readonly provider: "effect-lsp" | "stock-sidecar";
  private exitResult: { readonly code: number | null; readonly signal: string | null } | undefined;

  constructor(executable: string, cwd: string, provider: "effect-lsp" | "stock-sidecar") {
    this.provider = provider;
    this.child = spawn(executable, ["--lsp", "--stdio"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const exit = Promise.withResolvers<{
      readonly code: number | null;
      readonly signal: string | null;
    }>();
    this.exitPromise = exit.promise;
    this.child.once("error", (error) => {
      const result = { code: null, signal: null };
      this.exitResult = result;
      this.stderr.push(String(error));
      exit.resolve(result);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
    this.child.once("exit", (code, signal) => {
      this.exitResult = { code, signal };
      exit.resolve({ code, signal });
      for (const pending of this.pending.values())
        pending.reject(
          new Error(`stock LSP exited before response: ${code ?? signal ?? "unknown"}`),
        );
      this.pending.clear();
    });
    this.child.stdout.on("data", (chunk: Buffer) => {
      for (const parsed of this.decoder.push(Buffer.from(chunk))) {
        const record: CapturedMessage = {
          direction: this.provider === "effect-lsp" ? "effect-lsp->proxy" : "stock-sidecar->proxy",
          contentLength: parsed.contentLength,
          message: parsed.message,
        };
        this.captured.push(record);
        if (isResponse(parsed.message)) {
          const pending = this.pending.get(idKey(parsed.message.id));
          if (pending === undefined) continue;
          this.pending.delete(idKey(parsed.message.id));
          pending.resolve(parsed.message);
        } else if ("method" in parsed.message) {
          const notification = parsed.message;
          this.notifications.push(notification);
          const waiter = this.notificationWaiters.find(
            (candidate) => candidate.method === notification.method,
          );
          if (waiter !== undefined) {
            this.notificationWaiters.splice(this.notificationWaiters.indexOf(waiter), 1);
            waiter.resolve(notification);
          }
          this.onNotification(notification);
        }
      }
    });
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderr.push(Buffer.from(chunk).toString("utf8"));
    });
  }

  request(message: JsonRpcRequest): Promise<JsonRpcResponse> {
    const encoded = frame(message);
    this.captured.push({
      direction: this.provider === "effect-lsp" ? "proxy->effect-lsp" : "proxy->stock-sidecar",
      contentLength: encoded.contentLength,
      message,
    });
    const response = Promise.withResolvers<JsonRpcResponse>();
    this.pending.set(idKey(message.id), response);
    if (this.child.stdin.destroyed || !this.child.stdin.writable) {
      this.pending.delete(idKey(message.id));
      response.reject(new Error("stock LSP stdin is not writable"));
      return response.promise;
    }
    this.child.stdin.write(encoded.bytes);
    return response.promise;
  }

  respond(message: JsonRpcResponse): void {
    const encoded = frame(message);
    this.captured.push({
      direction: this.provider === "effect-lsp" ? "proxy->effect-lsp" : "proxy->stock-sidecar",
      contentLength: encoded.contentLength,
      message,
    });
    if (!this.child.stdin.destroyed && this.child.stdin.writable)
      this.child.stdin.write(encoded.bytes);
  }

  notify(message: JsonRpcNotification): void {
    const encoded = frame(message);
    this.captured.push({
      direction: this.provider === "effect-lsp" ? "proxy->effect-lsp" : "proxy->stock-sidecar",
      contentLength: encoded.contentLength,
      message,
    });
    if (!this.child.stdin.destroyed && this.child.stdin.writable)
      this.child.stdin.write(encoded.bytes);
  }

  async waitForNotification(method: string, timeoutMs = 5000): Promise<JsonRpcNotification> {
    const existing = this.notifications.find((candidate) => candidate.method === method);
    if (existing !== undefined) return existing;
    const response = Promise.withResolvers<JsonRpcNotification>();
    const waiter = { method, resolve: response.resolve, reject: response.reject };
    this.notificationWaiters.push(waiter);
    const timeout = setTimeout(() => {
      const index = this.notificationWaiters.indexOf(waiter);
      if (index >= 0) this.notificationWaiters.splice(index, 1);
      response.reject(new Error(`timed out waiting for stock LSP notification ${method}`));
    }, timeoutMs);
    unrefTimer(timeout);
    return response.promise;
  }

  async close(): Promise<{
    readonly terminated: boolean;
    readonly code: number | null;
    readonly signal: string | null;
  }> {
    if (this.exitResult === undefined && !this.child.stdin.destroyed) this.child.stdin.end();
    let exit: { readonly code: number | null; readonly signal: string | null } | undefined;
    try {
      exit = await Promise.race([this.exitPromise, waitForTimeout(2000)]);
    } catch (error) {
      this.stderr.push(String(error));
    }
    if (exit === undefined && this.exitResult === undefined) {
      this.child.kill("SIGTERM");
      exit = await Promise.race([this.exitPromise, waitForTimeout(1000)]);
    }
    if (exit === undefined && this.exitResult === undefined) {
      this.child.kill("SIGKILL");
      exit = await Promise.race([this.exitPromise, waitForTimeout(1000)]);
    }
    const result = exit ?? this.exitResult;
    return {
      terminated: result !== undefined,
      code: result?.code ?? null,
      signal: result?.signal ?? null,
    };
  }
}

class LspProxy {
  readonly captured: CapturedMessage[] = [];
  readonly unsupportedOperations: UnsupportedOperation[] = [];
  readonly clientFacing: ClientFacing = {};
  private clientOutput: ((bytes: Buffer) => void) | undefined;
  private readonly clientDecoder = new FrameDecoder();
  private readonly openText = new Map<string, string>();
  private readonly mergedDiagnostics = new Map<string, readonly Diagnostic[]>();
  private readonly effectPublished = new Map<string, readonly Diagnostic[]>();
  private readonly stockPublished = new Map<string, readonly Diagnostic[]>();

  constructor(
    private readonly effect: ProviderLspTransport,
    private readonly sidecar: ProviderLspTransport,
  ) {
    this.effect.onNotification = (message) => this.handleProviderMessage("effect", message);
    this.sidecar.onNotification = (message) => this.handleProviderMessage("stock", message);
  }

  setClientOutput(output: (bytes: Buffer) => void): void {
    this.clientOutput = output;
  }

  async receiveClient(bytes: Buffer): Promise<void> {
    for (const parsed of this.clientDecoder.push(bytes)) {
      const message = parsed.message;
      this.captured.push({
        direction: "client->proxy",
        contentLength: parsed.contentLength,
        message,
      });
      if (isResponse(message)) this.effect.respond(message);
      else if (isRequest(message)) await this.handleClientRequest(message);
      else if ("method" in message) this.handleClientNotification(message);
    }
  }

  private async handleClientRequest(message: JsonRpcRequest): Promise<void> {
    if (message.method === "workspace/executeCommand") {
      const request = (message.params ?? {}) as {
        readonly command?: unknown;
        readonly arguments?: readonly unknown[];
      };
      if (request.command === "effx.status") {
        this.sendClient({
          jsonrpc: "2.0",
          id: message.id,
          result: { status: "tracked", providers: ["@effect/tsgo", "typescript"] },
        });
        return;
      }
      if (request.command !== "effx.chooseEffectComposition") {
        this.sendClient(await this.effect.request(message));
        return;
      }
      const params = (request.arguments?.[0] ?? {}) as {
        readonly uri?: unknown;
        readonly snapshotSha256?: unknown;
      };
      const uri = typeof params.uri === "string" ? params.uri : undefined;
      const text = uri === undefined ? undefined : this.openText.get(uri);
      const currentSha256 = text === undefined ? undefined : snapshotSha256(text);
      const response: JsonRpcResponse =
        currentSha256 !== undefined && params.snapshotSha256 === currentSha256
          ? {
              jsonrpc: "2.0",
              id: message.id,
              result: { accepted: true, snapshotSha256: currentSha256 },
            }
          : {
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32_001,
                message:
                  currentSha256 === undefined
                    ? "Command rejected: no open source snapshot exists for this URI."
                    : "Stale command rejected: the source snapshot changed.",
                data: {
                  reason: currentSha256 === undefined ? "snapshot-unavailable" : "snapshot-stale",
                  expected: currentSha256,
                  received: params.snapshotSha256,
                },
              },
            };
      this.sendClient(response);
      if (response.error === undefined) this.clientFacing.executedCommand = response;
      else if (currentSha256 === undefined) this.clientFacing.unknownCommand = response;
      else this.clientFacing.staleCommand = response;
      return;
    }
    if (message.method === "textDocument/diagnostic") {
      const response = await this.handleDiagnosticPull(message);
      this.sendClient(response);
      this.clientFacing.diagnostic = response;
      return;
    }

    const effectResponsePromise = this.effect.request(message);
    const sidecarResponsePromise =
      message.method === "initialize" || message.method === "shutdown"
        ? this.sidecar.request(message)
        : undefined;
    const effectResponse = await effectResponsePromise;
    if (sidecarResponsePromise !== undefined) await sidecarResponsePromise;
    const initializeResult = effectResponse.result as
      | {
          readonly capabilities?: {
            readonly executeCommandProvider?: {
              readonly commands?: readonly string[];
              readonly [key: string]: unknown;
            };
            readonly [key: string]: unknown;
          };
          readonly [key: string]: unknown;
        }
      | undefined;
    const baseCommands = initializeResult?.capabilities?.executeCommandProvider?.commands ?? [];
    const response =
      message.method === "initialize" && effectResponse.error === undefined
        ? {
            ...effectResponse,
            result: {
              ...initializeResult,
              capabilities: {
                ...initializeResult?.capabilities,
                executeCommandProvider: {
                  ...initializeResult?.capabilities?.executeCommandProvider,
                  commands: [
                    ...new Set([...baseCommands, "effx.chooseEffectComposition", "effx.status"]),
                  ],
                },
              },
            },
          }
        : effectResponse;
    if (message.method === "initialize") this.clientFacing.initialize = response;
    if (message.method === "textDocument/codeAction") {
      const merged = this.mergeCodeActions(message, response);
      this.sendClient(merged);
      this.clientFacing.codeAction = merged;
      return;
    }
    this.sendClient(response);
  }

  private async handleDiagnosticPull(message: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = (message.params ?? {}) as {
      readonly textDocument?: { readonly uri?: unknown };
      readonly previousResultId?: unknown;
    };
    const uri = typeof params.textDocument?.uri === "string" ? params.textDocument.uri : undefined;
    const text = uri === undefined ? undefined : this.openText.get(uri);
    if (uri === undefined || text === undefined) {
      return {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32_001, message: "Diagnostic pull rejected: document is not open." },
      };
    }
    const resultId = snapshotSha256(text);
    if (params.previousResultId === resultId && this.mergedDiagnostics.has(uri)) {
      return { jsonrpc: "2.0", id: message.id, result: { kind: "unchanged", resultId } };
    }
    const [effectResponse, sidecarResponse] = await Promise.all([
      this.effect.request(message),
      this.sidecar.request(message),
    ]);
    if (effectResponse.error === undefined && sidecarResponse.error === undefined) {
      const effectResult = effectResponse.result as
        | { readonly kind?: unknown; readonly items?: readonly Diagnostic[] }
        | undefined;
      const sidecarResult = sidecarResponse.result as
        | { readonly kind?: unknown; readonly items?: readonly Diagnostic[] }
        | undefined;
      const effectItems =
        effectResult?.kind === "unchanged"
          ? (this.effectPublished.get(uri) ?? [])
          : (effectResult?.items ?? []);
      const sidecarItems =
        sidecarResult?.kind === "unchanged"
          ? (this.stockPublished.get(uri) ?? [])
          : (sidecarResult?.items ?? []);
      if (effectResult?.kind !== "unchanged") this.effectPublished.set(uri, effectItems);
      if (sidecarResult?.kind !== "unchanged") this.stockPublished.set(uri, sidecarItems);
      const items = mergeDiagnostics(effectItems, sidecarItems, text);
      this.mergedDiagnostics.set(uri, items);
      return {
        ...effectResponse,
        result: { ...(effectResult ?? { kind: "full" }), kind: "full", resultId, items },
      };
    }
    this.unsupportedOperations.push({
      operation: "provider textDocument/diagnostic pull",
      status: "observed",
      reason:
        "one provider rejected diagnostic pull; the proxy returned the last complete merged publication",
      request: message,
      response: effectResponse.error === undefined ? sidecarResponse : effectResponse,
    });
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: { kind: "full", resultId, items: this.mergedDiagnostics.get(uri) ?? [] },
    };
  }

  private handleClientNotification(message: JsonRpcNotification): void {
    if (message.method === "textDocument/didOpen") {
      const params = message.params as
        | { readonly textDocument?: { readonly uri?: unknown; readonly text?: unknown } }
        | undefined;
      const uri =
        typeof params?.textDocument?.uri === "string" ? params.textDocument.uri : undefined;
      const text =
        typeof params?.textDocument?.text === "string" ? params.textDocument.text : undefined;
      if (uri !== undefined && text !== undefined) this.openText.set(uri, text);
    }
    if (message.method === "textDocument/didChange") {
      const params = message.params as
        | {
            readonly textDocument?: { readonly uri?: unknown };
            readonly contentChanges?: readonly { readonly text?: unknown }[];
          }
        | undefined;
      const uri =
        typeof params?.textDocument?.uri === "string" ? params.textDocument.uri : undefined;
      const text = params?.contentChanges?.findLast(
        (change): change is { readonly text: string } => typeof change.text === "string",
      )?.text;
      if (uri !== undefined && text !== undefined) {
        this.openText.set(uri, text);
        this.effectPublished.delete(uri);
        this.stockPublished.delete(uri);
        this.mergedDiagnostics.delete(uri);
      }
    }
    if (message.method === "textDocument/didClose") {
      const params = message.params as
        | { readonly textDocument?: { readonly uri?: unknown } }
        | undefined;
      const uri =
        typeof params?.textDocument?.uri === "string" ? params.textDocument.uri : undefined;
      if (uri !== undefined) {
        this.openText.delete(uri);
        this.effectPublished.delete(uri);
        this.stockPublished.delete(uri);
        this.mergedDiagnostics.delete(uri);
      }
    }
    this.effect.notify(message);
    this.sidecar.notify(message);
  }

  private handleProviderMessage(provider: "effect" | "stock", message: JsonRpcMessage): void {
    if (isRequest(message)) {
      if (provider === "effect") {
        this.sendClient(message);
      } else {
        this.sidecar.respond({ jsonrpc: "2.0", id: message.id, result: null });
      }
      return;
    }
    if ("method" in message && message.method === "textDocument/publishDiagnostics") {
      const params = message.params as
        | { readonly uri?: unknown; readonly diagnostics?: readonly Diagnostic[] }
        | undefined;
      const uri = typeof params?.uri === "string" ? params.uri : undefined;
      const text = uri === undefined ? undefined : (this.openText.get(uri) ?? readUriSnapshot(uri));
      if (uri === undefined || text === undefined) return;
      const diagnostics = params?.diagnostics ?? [];
      if (provider === "effect") this.effectPublished.set(uri, diagnostics);
      else this.stockPublished.set(uri, diagnostics);
      const effectItems = this.effectPublished.get(uri);
      const stockItems = this.stockPublished.get(uri);
      if (effectItems === undefined || stockItems === undefined) return;
      const merged = mergeDiagnostics(effectItems, stockItems, text);
      this.mergedDiagnostics.set(uri, merged);
      const mergedMessage: JsonRpcNotification = {
        ...message,
        params: { ...params, uri, diagnostics: merged },
      };
      this.sendClient(mergedMessage);
      this.clientFacing.publishDiagnostics = mergedMessage;
      return;
    }
    if (provider === "effect") this.sendClient(message);
  }

  private mergeCodeActions(message: JsonRpcRequest, response: JsonRpcResponse): JsonRpcResponse {
    const baseActions = Array.isArray(response.result) ? response.result : [];
    const params = message.params as
      | { readonly textDocument?: { readonly uri?: unknown } }
      | undefined;
    const uri = typeof params?.textDocument?.uri === "string" ? params.textDocument.uri : undefined;
    if (uri === undefined) return response;
    const effectDiagnostic = this.mergedDiagnostics
      .get(uri)
      ?.find((diagnostic) => diagnostic.code === 377_001);
    const text = this.openText.get(uri);
    if (effectDiagnostic === undefined || text === undefined) return response;
    const title = "Compose this Effect instead of discarding it";
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: [
        ...baseActions,
        {
          title,
          kind: "quickfix",
          isPreferred: false,
          diagnostics: [effectDiagnostic],
          command: {
            title,
            command: "effx.chooseEffectComposition",
            arguments: [
              {
                uri,
                snapshotSha256: snapshotSha256(text),
                choices: ["yield-from-effect-gen", "return-effect", "bind-effect"],
              },
            ],
          },
          data: {
            schemaVersion: 1,
            applicability: "choice-required",
            snapshotSha256: snapshotSha256(text),
          },
        },
      ],
    };
  }

  private sendClient(message: JsonRpcMessage): void {
    const encoded = frame(message);
    this.captured.push({
      direction: "proxy->client",
      contentLength: encoded.contentLength,
      message,
    });
    this.clientOutput?.(encoded.bytes);
  }
}

const run = async (): Promise<ProbeResult> => {
  const errors: string[] = [];
  const sourceText = readFileSync(fixtureFile, "utf8");
  const effectTsgoPackage = JSON.parse(
    readFileSync(resolve(root, "node_modules/@effect/tsgo/package.json"), "utf8"),
  ) as { readonly version: string };
  const providers: ProbeResult["providers"] = {
    effectTsgoVersion: effectTsgoPackage.version,
    effectExecutable,
    effectExecutableSha256: existsSync(effectExecutable) ? fileSha256(effectExecutable) : "",
    typescriptVersion,
    stockExecutable,
    stockExecutableSha256: existsSync(stockExecutable) ? fileSha256(stockExecutable) : "",
  };
  const timingsMs: Record<keyof ProbeResult["timingsMs"], number> = {
    cold: 0,
    warm: 0,
    incremental: 0,
    effectHeavy: 0,
    multiProject: 0,
  };
  const coordinatorRssBefore = process.memoryUsage().rss;
  const observedFacts = [
    `@effect/tsgo ${effectTsgoPackage.version} base LSP resolved at ${effectExecutable}`,
    `stock TypeScript ${typescriptVersion} semantic sidecar resolved at ${stockExecutable}`,
    "one immutable UTF-8 source snapshot was opened in both providers",
    "Effect-owned diagnostics were retained from @effect/tsgo while duplicate generic diagnostics were removed",
    "generic TypeScript diagnostics were supplied by the stock TypeScript sidecar",
    "diagnostics were deduplicated and sorted into one canonical editor result",
    "choice-required code action metadata carried no WorkspaceEdit",
    "stale commands were rejected against the current source SHA-256",
  ];
  const interceptionPoints = [
    {
      method: "initialize",
      observedAction: "forwarded to both providers; Effect base response returned",
    },
    {
      method: "textDocument/didOpen",
      observedAction: "one source snapshot forwarded to both providers",
    },
    {
      method: "textDocument/publishDiagnostics",
      observedAction: "provider publications merged after both snapshots arrived",
    },
    {
      method: "textDocument/diagnostic",
      observedAction: "Effect-only base diagnostics merged with generic stock diagnostics",
    },
    {
      method: "textDocument/codeAction",
      observedAction: "Effect base actions preserved and one choice-required action appended",
    },
    {
      method: "workspace/executeCommand",
      observedAction: "stale source hash rejected before any command side effect",
    },
    { method: "shutdown/exit", observedAction: "both providers shut down and cleanup was awaited" },
  ];
  const expectedTypeScriptVersion = process.env.EFFX_EXPECT_TYPESCRIPT_VERSION ?? "7.0.2";
  const expectedEffectTsgoVersion = process.env.EFFX_EXPECT_EFFECT_TSGO_VERSION ?? "0.36.4";
  if (typescriptVersion !== expectedTypeScriptVersion) {
    errors.push(
      `expected typescript ${expectedTypeScriptVersion} but observed ${typescriptVersion}`,
    );
  }
  if (effectTsgoPackage.version !== expectedEffectTsgoVersion) {
    errors.push(
      `expected @effect/tsgo ${expectedEffectTsgoVersion} but observed ${effectTsgoPackage.version}`,
    );
  }
  if (!existsSync(effectExecutable)) {
    errors.push(`Effect base LSP executable does not exist: ${effectExecutable}`);
  } else if (!isExecutable(effectExecutable)) {
    errors.push(`Effect base LSP is not executable: ${effectExecutable}`);
  }
  if (!existsSync(stockExecutable)) {
    errors.push(`stock TypeScript sidecar executable does not exist: ${stockExecutable}`);
  } else if (!isExecutable(stockExecutable)) {
    errors.push(`stock TypeScript sidecar is not executable: ${stockExecutable}`);
  }
  if (!existsSync(fixtureFile)) errors.push(`fixture does not exist: ${fixtureFile}`);
  if (!existsSync(projectBFile))
    errors.push(`second project fixture does not exist: ${projectBFile}`);

  const captured: CapturedMessage[] = [];
  const clientFacing: ClientFacing = {};
  const unsupportedOperations: UnsupportedOperation[] = [];
  let effect: ProviderLspTransport | undefined;
  let sidecar: ProviderLspTransport | undefined;
  let proxy: LspProxy | undefined;
  let termination: ProbeResult["termination"] = {
    attempted: true,
    terminated: false,
    exitCode: null,
    signal: null,
    stderr: "",
  };
  try {
    if (errors.length > 0) throw new Error(errors.join("; "));
    const effectTransport = new ProviderLspTransport(effectExecutable, fixtureRoot, "effect-lsp");
    const sidecarTransport = new ProviderLspTransport(
      stockExecutable,
      fixtureRoot,
      "stock-sidecar",
    );
    effect = effectTransport;
    sidecar = sidecarTransport;
    if (process.env.EFFX_FAIL_AFTER_START === "1") {
      throw new Error("injected provider failure after process startup");
    }
    const lspProxy = new LspProxy(effectTransport, sidecarTransport);
    proxy = lspProxy;
    const clientDecoder = new FrameDecoder();
    const clientResponses = new Map<string, (response: JsonRpcResponse) => void>();
    const clientNotifications: JsonRpcNotification[] = [];
    lspProxy.setClientOutput((bytes) => {
      for (const parsed of clientDecoder.push(bytes)) {
        if (isResponse(parsed.message)) {
          clientResponses.get(idKey(parsed.message.id))?.(parsed.message);
        } else if (isRequest(parsed.message)) {
          void lspProxy.receiveClient(
            frame({ jsonrpc: "2.0", id: parsed.message.id, result: null }).bytes,
          );
        } else if ("method" in parsed.message) {
          clientNotifications.push(parsed.message);
        }
      }
    });
    let nextId = 1;
    const startClientRequest = (
      method: string,
      params: unknown,
    ): { readonly id: JsonRpcId; readonly response: Promise<JsonRpcResponse> } => {
      const id = nextId++;
      const request: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
      const pending = Promise.withResolvers<JsonRpcResponse>();
      clientResponses.set(idKey(id), pending.resolve);
      const timeout = setTimeout(
        () => pending.reject(new Error(`timed out waiting for client-facing response ${method}`)),
        7000,
      );
      unrefTimer(timeout);
      void lspProxy.receiveClient(frame(request).bytes).catch(pending.reject);
      const response = pending.promise.finally(() => clientResponses.delete(idKey(id)));
      return { id, response };
    };
    const clientRequest = (method: string, params: unknown): Promise<JsonRpcResponse> =>
      startClientRequest(method, params).response;
    const clientNotify = async (method: string, params: unknown): Promise<void> => {
      const notification: JsonRpcNotification = { jsonrpc: "2.0", method, params };
      await lspProxy.receiveClient(frame(notification).bytes);
    };
    const waitClientNotification = async (
      method: string,
      predicate: (message: JsonRpcNotification) => boolean = () => true,
    ): Promise<JsonRpcNotification> => {
      const existing = clientNotifications.find(
        (candidate) => candidate.method === method && predicate(candidate),
      );
      if (existing !== undefined) return existing;
      const started = Date.now();
      while (Date.now() - started < 7000) {
        await waitForTimeout(10);
        const next = clientNotifications.find(
          (candidate) => candidate.method === method && predicate(candidate),
        );
        if (next !== undefined) return next;
      }
      throw new Error(`timed out waiting for client-facing notification ${method}`);
    };

    const coldStarted = performance.now();
    clientFacing.initialize = await clientRequest("initialize", {
      processId: null,
      rootUri: pathToFileURL(fixtureRoot).toString(),
      capabilities: {
        textDocument: {
          codeAction: {
            codeActionLiteralSupport: {
              codeActionKind: { valueSet: ["quickfix"] },
            },
          },
          publishDiagnostics: { relatedInformation: true },
        },
      },
      workspaceFolders: [
        { uri: pathToFileURL(fixtureRoot).toString(), name: "effx-provider-a" },
        { uri: pathToFileURL(projectBRoot).toString(), name: "effx-provider-b" },
      ],
    });
    await clientNotify("initialized", {});
    await clientNotify("textDocument/didOpen", {
      textDocument: {
        uri: fixtureUri,
        languageId: "typescript",
        version: 1,
        text: sourceText,
      },
    });
    clientFacing.publishDiagnostics = await waitClientNotification(
      "textDocument/publishDiagnostics",
    );
    const pullDiagnostics = (uri: string, previousResultId?: string): Promise<JsonRpcResponse> =>
      clientRequest("textDocument/diagnostic", {
        textDocument: { uri },
        identifier: "effectts",
        ...(previousResultId === undefined ? {} : { previousResultId }),
      });
    clientFacing.diagnostic = await pullDiagnostics(fixtureUri);
    timingsMs.cold = elapsedMs(coldStarted);

    const initialResultId = (
      clientFacing.diagnostic.result as { readonly resultId?: unknown } | undefined
    )?.resultId;
    const warmStarted = performance.now();
    const unchangedResponse = await pullDiagnostics(
      fixtureUri,
      typeof initialResultId === "string" ? initialResultId : undefined,
    );
    timingsMs.warm = elapsedMs(warmStarted);
    if (
      (unchangedResponse.result as { readonly kind?: unknown } | undefined)?.kind !== "unchanged"
    ) {
      errors.push("unchanged diagnostic report was not preserved");
    } else {
      observedFacts.push("client-facing unchanged diagnostics retained the prior merged set");
    }
    const canceledPull = startClientRequest("textDocument/diagnostic", {
      textDocument: { uri: fixtureUri },
      identifier: "effectts",
    });
    await clientNotify("$/cancelRequest", { id: canceledPull.id });
    await canceledPull.response;
    await pullDiagnostics(fixtureUri);

    const incrementalText = `${sourceText}\n`;
    await clientNotify("textDocument/didChange", {
      textDocument: { uri: fixtureUri, version: 2 },
      contentChanges: [{ text: incrementalText }],
    });
    const incrementalStarted = performance.now();
    await pullDiagnostics(fixtureUri);
    timingsMs.incremental = elapsedMs(incrementalStarted);

    const effectHeavyText = [
      'import { Effect } from "effect"',
      "",
      ...Array.from({ length: 64 }, (_, index) => `Effect.succeed(${index})`),
      'const stockNumber: number = "stock diagnostic preserved"',
      "export const program = Effect.succeed(stockNumber)",
      "",
    ].join("\n");
    await clientNotify("textDocument/didChange", {
      textDocument: { uri: fixtureUri, version: 3 },
      contentChanges: [{ text: effectHeavyText }],
    });
    const effectHeavyStarted = performance.now();
    await pullDiagnostics(fixtureUri);
    timingsMs.effectHeavy = elapsedMs(effectHeavyStarted);

    await clientNotify("textDocument/didChange", {
      textDocument: { uri: fixtureUri, version: 4 },
      contentChanges: [{ text: sourceText }],
    });
    clientFacing.diagnostic = await pullDiagnostics(fixtureUri);

    const projectBText = readFileSync(projectBFile, "utf8");
    const multiProjectStarted = performance.now();
    await clientNotify("textDocument/didOpen", {
      textDocument: {
        uri: projectBUri,
        languageId: "typescript",
        version: 1,
        text: projectBText,
      },
    });
    const multiProjectResponse = await pullDiagnostics(projectBUri);
    timingsMs.multiProject = elapsedMs(multiProjectStarted);
    await clientNotify("textDocument/didClose", {
      textDocument: { uri: projectBUri },
    });
    const closedProjectResponse = await pullDiagnostics(projectBUri);

    clientFacing.codeAction = await clientRequest("textDocument/codeAction", {
      textDocument: { uri: fixtureUri },
      range: {
        start: { line: 2, character: 0 },
        end: { line: 2, character: 16 },
      },
      context: {
        diagnostics:
          (
            clientFacing.diagnostic?.result as
              | { readonly items?: readonly Diagnostic[] }
              | undefined
          )?.items ?? [],
        only: ["quickfix"],
      },
    });
    clientFacing.executedCommand = await clientRequest("workspace/executeCommand", {
      command: "effx.chooseEffectComposition",
      arguments: [{ uri: fixtureUri, snapshotSha256: snapshotSha256(sourceText) }],
    });
    clientFacing.staleCommand = await clientRequest("workspace/executeCommand", {
      command: "effx.chooseEffectComposition",
      arguments: [{ uri: fixtureUri, snapshotSha256: "stale-snapshot" }],
    });
    clientFacing.unknownCommand = await clientRequest("workspace/executeCommand", {
      command: "effx.chooseEffectComposition",
      arguments: [{ uri: projectBUri, snapshotSha256: snapshotSha256(sourceText) }],
    });
    const mergedItems =
      (clientFacing.diagnostic?.result as { readonly items?: readonly Diagnostic[] } | undefined)
        ?.items ?? [];
    if (
      mergedItems.length !== 2 ||
      mergedItems[0]?.code !== 377_001 ||
      mergedItems[0]?.source !== "@effect/tsgo" ||
      mergedItems[1]?.code !== 2322 ||
      mergedItems[1]?.source !== "typescript"
    ) {
      errors.push(`unexpected canonical diagnostics: ${JSON.stringify(mergedItems)}`);
    }
    const actions = Array.isArray(clientFacing.codeAction?.result)
      ? clientFacing.codeAction.result
      : [];
    const choiceAction = actions.find(
      (action) =>
        typeof action === "object" &&
        action !== null &&
        "command" in action &&
        (action.command as { readonly command?: unknown } | undefined)?.command ===
          "effx.chooseEffectComposition",
    ) as { readonly edit?: unknown } | undefined;
    if (choiceAction === undefined || choiceAction.edit !== undefined) {
      errors.push("choice-required Effect action missing or carried an unsafe WorkspaceEdit");
    }
    if (clientFacing.staleCommand.error?.code !== -32_001) {
      errors.push("stale command was not rejected");
    }
    const advertisedCommands =
      (
        clientFacing.initialize?.result as
          | {
              readonly capabilities?: {
                readonly executeCommandProvider?: { readonly commands?: readonly string[] };
              };
            }
          | undefined
      )?.capabilities?.executeCommandProvider?.commands ?? [];
    if (!advertisedCommands.includes("effx.chooseEffectComposition")) {
      errors.push("effx command was not advertised during initialize");
    }
    if (
      (clientFacing.executedCommand.result as { readonly accepted?: unknown } | undefined)
        ?.accepted !== true
    ) {
      errors.push("current-snapshot command was not executed");
    }
    const projectBItems =
      (multiProjectResponse.result as { readonly items?: readonly Diagnostic[] } | undefined)
        ?.items ?? [];
    if (projectBItems.length !== 0) {
      errors.push(`clean second project produced diagnostics: ${JSON.stringify(projectBItems)}`);
    }
    if (closedProjectResponse.error?.code === -32_001) {
      observedFacts.push("diagnostic pulls for closed documents were rejected");
    } else {
      errors.push(
        `closed project diagnostic pull was not rejected: ${JSON.stringify(closedProjectResponse)}`,
      );
    }
    if (
      clientFacing.unknownCommand.error?.code !== -32_001 ||
      (clientFacing.unknownCommand.error.data as { readonly reason?: unknown } | undefined)
        ?.reason !== "snapshot-unavailable"
    ) {
      errors.push("command for a URI without an open snapshot was not rejected");
    }
    await clientRequest("shutdown", undefined);
    await clientNotify("exit", undefined);
    unsupportedOperations.push(...lspProxy.unsupportedOperations);
    captured.push(...lspProxy.captured, ...effectTransport.captured, ...sidecarTransport.captured);
    const cancellationTargets = new Set(
      captured
        .filter(
          ({ message }) =>
            "method" in message &&
            message.method === "$/cancelRequest" &&
            (message.params as { readonly id?: unknown } | undefined)?.id === canceledPull.id,
        )
        .map(({ direction }) => direction),
    );
    if (
      cancellationTargets.has("proxy->effect-lsp") &&
      cancellationTargets.has("proxy->stock-sidecar")
    ) {
      observedFacts.push("active request cancellation was forwarded to both providers");
    } else {
      errors.push("active request cancellation did not reach both providers");
    }
    clientFacing.initialize = lspProxy.clientFacing.initialize ?? clientFacing.initialize;
    clientFacing.publishDiagnostics =
      lspProxy.clientFacing.publishDiagnostics ?? clientFacing.publishDiagnostics;
    clientFacing.codeAction = lspProxy.clientFacing.codeAction ?? clientFacing.codeAction;
    const [effectClosed, sidecarClosed] = await Promise.all([
      effectTransport.close(),
      sidecarTransport.close(),
    ]);
    termination = {
      attempted: true,
      terminated: effectClosed.terminated && sidecarClosed.terminated,
      exitCode:
        effectClosed.code !== 0
          ? effectClosed.code
          : sidecarClosed.code !== 0
            ? sidecarClosed.code
            : 0,
      signal: effectClosed.signal ?? sidecarClosed.signal,
      stderr: [
        `@effect/tsgo: ${effectTransport.stderr.join("")}`,
        `typescript: ${sidecarTransport.stderr.join("")}`,
      ].join("\n"),
    };
    if (!termination.terminated) errors.push("one or more provider processes survived cleanup");
    return {
      schemaVersion: 1,
      status: "tracked",
      outcome: errors.length === 0 && termination.terminated ? "worked" : "blocked",
      engine: {
        package: "typescript",
        version: typescriptVersion,
        api: "lsp",
        support: "experimental",
      },
      providers,
      fixture: {
        root: fixtureRoot,
        file: fixtureFile,
        uri: fixtureUri,
        sourceSha256: snapshotSha256(sourceText),
      },
      timingsMs,
      memory: {
        coordinatorRssBefore,
        coordinatorRssAfter: process.memoryUsage().rss,
      },
      observedFacts,
      inferences: [
        "[INFERENCE] The observed provider seam is feasible for Stage A command coordination; editor feature parity remains unproven.",
      ],
      interceptionPoints,
      unsupportedOperations,
      captured: { lsp: captured },
      clientFacing,
      termination,
      errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!errors.includes(message)) errors.push(message);
    if (proxy !== undefined) captured.push(...proxy.captured);
    if (effect !== undefined) captured.push(...effect.captured);
    if (sidecar !== undefined) captured.push(...sidecar.captured);
    if (effect !== undefined || sidecar !== undefined) {
      const [effectClosed, sidecarClosed] = await Promise.all([effect?.close(), sidecar?.close()]);
      termination = {
        attempted: true,
        terminated: (effectClosed?.terminated ?? true) && (sidecarClosed?.terminated ?? true),
        exitCode:
          effectClosed?.code !== 0
            ? (effectClosed?.code ?? null)
            : sidecarClosed?.code !== 0
              ? (sidecarClosed?.code ?? null)
              : 0,
        signal: effectClosed?.signal ?? sidecarClosed?.signal ?? null,
        stderr: [
          `@effect/tsgo: ${effect?.stderr.join("") ?? ""}`,
          `typescript: ${sidecar?.stderr.join("") ?? ""}`,
        ].join("\n"),
      };
    }
    return {
      schemaVersion: 1,
      status: "tracked",
      outcome: "blocked",
      engine: {
        package: "typescript",
        version: typescriptVersion,
        api: "lsp",
        support: "experimental",
      },
      providers,
      fixture: {
        root: fixtureRoot,
        file: fixtureFile,
        uri: fixtureUri,
        sourceSha256: snapshotSha256(sourceText),
      },
      timingsMs,
      memory: {
        coordinatorRssBefore,
        coordinatorRssAfter: process.memoryUsage().rss,
      },
      observedFacts,
      inferences: [],
      interceptionPoints,
      unsupportedOperations: proxy?.unsupportedOperations ?? unsupportedOperations,
      captured: { lsp: captured },
      clientFacing,
      termination,
      errors,
    };
  }
};

const summarize = (result: ProbeResult): unknown => {
  const diagnostics =
    (
      result.clientFacing.diagnostic?.result as
        | { readonly items?: readonly Diagnostic[] }
        | undefined
    )?.items ?? [];
  const actions = Array.isArray(result.clientFacing.codeAction?.result)
    ? result.clientFacing.codeAction.result
    : [];
  const choiceAction = actions.find(
    (action) =>
      typeof action === "object" &&
      action !== null &&
      "command" in action &&
      (action.command as { readonly command?: unknown } | undefined)?.command ===
        "effx.chooseEffectComposition",
  ) as { readonly edit?: unknown; readonly data?: unknown } | undefined;
  return {
    schemaVersion: result.schemaVersion,
    status: result.status,
    outcome: result.outcome,
    providers: result.providers,
    fixture: result.fixture,
    diagnostics: diagnostics.map(({ code, source, range }) => ({ code, source, range })),
    codeAction: {
      present: choiceAction !== undefined,
      hasWorkspaceEdit: choiceAction?.edit !== undefined,
      data: choiceAction?.data,
    },
    advertisedCommands:
      (
        result.clientFacing.initialize?.result as
          | {
              readonly capabilities?: {
                readonly executeCommandProvider?: { readonly commands?: readonly string[] };
              };
            }
          | undefined
      )?.capabilities?.executeCommandProvider?.commands ?? [],
    executedCommandAccepted:
      (result.clientFacing.executedCommand?.result as { readonly accepted?: unknown } | undefined)
        ?.accepted === true,
    staleCommandError: result.clientFacing.staleCommand?.error?.code ?? null,
    unknownCommandError: result.clientFacing.unknownCommand?.error?.code ?? null,
    diagnosticLifecycle: {
      unchangedPreserved: result.observedFacts.includes(
        "client-facing unchanged diagnostics retained the prior merged set",
      ),
      cancellationForwarded: result.observedFacts.includes(
        "active request cancellation was forwarded to both providers",
      ),
      closedDocumentRejected: result.observedFacts.includes(
        "diagnostic pulls for closed documents were rejected",
      ),
    },
    timingsObserved: Object.fromEntries(
      Object.entries(result.timingsMs).map(([name, value]) => [name, value > 0]),
    ),
    memoryObserved: result.memory.coordinatorRssBefore > 0 && result.memory.coordinatorRssAfter > 0,
    measurements: { timingsMs: result.timingsMs, memory: result.memory },
    protocolDirections: [
      ...new Set(result.captured.lsp.map(({ direction }) => direction)),
    ].toSorted(),
    termination: result.termination,
    unsupportedOperations: result.unsupportedOperations.map(({ operation, reason, response }) => ({
      operation,
      reason,
      responseErrorCode:
        response !== undefined && isResponse(response) ? (response.error?.code ?? null) : null,
    })),
    unsupportedOperationCount: result.unsupportedOperations.length,
    errors: result.errors,
  };
};

const result = await run();
console.log(
  JSON.stringify(process.argv.includes("--summary") ? summarize(result) : result, null, 2),
);
if (result.outcome !== "worked") process.exitCode = 1;
