import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

export type JsonRpcId = number | string | null

export interface JsonRpcRequest {
  readonly jsonrpc: "2.0"
  readonly id: JsonRpcId
  readonly method: string
  readonly params?: unknown
}

export interface JsonRpcNotification {
  readonly jsonrpc: "2.0"
  readonly method: string
  readonly params?: unknown
}

export interface JsonRpcError {
  readonly code: number
  readonly message: string
  readonly data?: unknown
}

export interface JsonRpcResponse {
  readonly jsonrpc: "2.0"
  readonly id: JsonRpcId
  readonly result?: unknown
  readonly error?: JsonRpcError
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse

export interface Position {
  readonly line: number
  readonly character: number
}

export interface Diagnostic {
  readonly range: { readonly start: Position; readonly end: Position }
  readonly severity?: number
  readonly code?: number | string
  readonly source?: string
  readonly message: string
  readonly data?: unknown
}

export interface JsonRpcFrame {
  readonly message: JsonRpcMessage
  readonly contentLength: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isJsonRpcId = (value: unknown): value is JsonRpcId =>
  value === null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value))

const decodeMessage = (value: unknown): JsonRpcMessage => {
  if (!isRecord(value) || value.jsonrpc !== "2.0") throw new Error("invalid JSON-RPC message")
  if (typeof value.method === "string") {
    if ("id" in value && isJsonRpcId(value.id)) {
      return { jsonrpc: "2.0", id: value.id, method: value.method, ...(value.params === undefined ? {} : { params: value.params }) }
    }
    return { jsonrpc: "2.0", method: value.method, ...(value.params === undefined ? {} : { params: value.params }) }
  }
  if (!isJsonRpcId(value.id) || !("result" in value || "error" in value)) throw new Error("invalid JSON-RPC response")
  const error = value.error
  if (error !== undefined && (!isRecord(error) || typeof error.code !== "number" || typeof error.message !== "string")) {
    throw new Error("invalid JSON-RPC error")
  }
  return {
    jsonrpc: "2.0",
    id: value.id,
    ...(value.result === undefined ? {} : { result: value.result }),
    ...(error === undefined ? {} : { error: error as JsonRpcError })
  }
}

export const encodeFrame = (message: JsonRpcMessage): Buffer => {
  const body = Buffer.from(JSON.stringify(message), "utf8")
  return Buffer.concat([Buffer.from(`Content-Length: ${body.byteLength}\r\n\r\n`, "ascii"), body])
}

const headerEnd = (buffer: Buffer): { readonly index: number; readonly size: number } | undefined => {
  const crlf = buffer.indexOf(Buffer.from("\r\n\r\n", "ascii"))
  if (crlf >= 0) return { index: crlf, size: 4 }
  const lf = buffer.indexOf(Buffer.from("\n\n", "ascii"))
  return lf >= 0 ? { index: lf, size: 2 } : undefined
}

export class FrameDecoder {
  private buffer = Buffer.alloc(0)

  push(chunk: Buffer): JsonRpcFrame[] {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const frames: JsonRpcFrame[] = []
    while (true) {
      const end = headerEnd(this.buffer)
      if (end === undefined) break
      const header = this.buffer.subarray(0, end.index).toString("ascii")
      const contentHeader = header.split(/\r?\n/).find((line) => /^content-length\s*:/i.test(line))
      if (contentHeader === undefined) throw new Error(`JSON-RPC frame has no Content-Length header: ${header}`)
      const contentLength = Number.parseInt(contentHeader.slice(contentHeader.indexOf(":") + 1).trim(), 10)
      if (!Number.isSafeInteger(contentLength) || contentLength < 0) throw new Error(`invalid Content-Length: ${contentHeader}`)
      const bodyStart = end.index + end.size
      if (this.buffer.byteLength < bodyStart + contentLength) break
      const body = this.buffer.subarray(bodyStart, bodyStart + contentLength).toString("utf8")
      this.buffer = this.buffer.subarray(bodyStart + contentLength)
      frames.push({ message: decodeMessage(JSON.parse(body) as unknown), contentLength })
    }
    return frames
  }
}

const unrefTimer = (timer: unknown): void => {
  const candidate = timer as { readonly unref?: () => void }
  candidate.unref?.()
}

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => {
  const timer = setTimeout(resolve, milliseconds)
  unrefTimer(timer)
})

interface PendingRequest {
  readonly resolve: (response: JsonRpcResponse) => void
  readonly reject: (error: Error) => void
  readonly timer: ReturnType<typeof setTimeout>
}

export interface ProcessExit {
  readonly terminated: boolean
  readonly code: number | null
  readonly signal: string | null
  readonly forced: boolean
  readonly stderr: string
  readonly pid: number | null
  readonly descendantsBeforeForce: readonly number[]
  readonly descendantsAfterExit: readonly number[]
  readonly processTreeAvailable: boolean
}

export const processDescendants = (pid: number): { readonly available: boolean; readonly pids: readonly number[] } => {
  const childrenPath = `/proc/${pid}/task/${pid}/children`
  if (!existsSync(childrenPath)) return { available: false, pids: [] }
  const text = readFileSync(childrenPath, "utf8").trim()
  const pids = text.length === 0
    ? []
    : text.split(/\s+/).flatMap((entry) => {
      const value = Number.parseInt(entry, 10)
      return Number.isSafeInteger(value) && value > 0 ? [value] : []
    })
  return { available: true, pids }
}

const stillAlive = (pid: number | undefined): boolean => {
  if (pid === undefined) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export class JsonRpcProcess {
  readonly messages: JsonRpcFrame[] = []
  readonly notifications: JsonRpcNotification[] = []
  readonly stderrChunks: string[] = []
  readonly pid: number | null
  private readonly child: ChildProcessWithoutNullStreams
  private readonly decoder = new FrameDecoder()
  private readonly pending = new Map<string, PendingRequest>()
  private readonly notificationWaiters: Array<{
    readonly method: string
    readonly predicate: (message: JsonRpcNotification) => boolean
    readonly resolve: (message: JsonRpcNotification) => void
    readonly reject: (error: Error) => void
    readonly timer: ReturnType<typeof setTimeout>
  }> = []
  private readonly exitPromise: Promise<{ readonly code: number | null; readonly signal: string | null }>
  private exitResult: { readonly code: number | null; readonly signal: string | null } | undefined
  private nextId = 1

  constructor(executable: string, cwd: string, args: readonly string[]) {
    this.child = spawn(executable, [...args], { cwd, stdio: ["pipe", "pipe", "pipe"] })
    this.pid = this.child.pid ?? null
    this.exitPromise = new Promise((resolve, reject) => {
      this.child.once("error", reject)
      this.child.once("exit", (code, signal) => {
        this.exitResult = { code, signal }
        resolve({ code, signal })
        for (const [key, pending] of this.pending) {
          clearTimeout(pending.timer)
          pending.reject(new Error(`provider exited before JSON-RPC response: ${key}`))
        }
        this.pending.clear()
        for (const waiter of this.notificationWaiters.splice(0)) {
          clearTimeout(waiter.timer)
          waiter.reject(new Error(`provider exited before ${waiter.method} notification`))
        }
      })
    })
    this.child.stdout.on("data", (chunk: Buffer) => {
      for (const frame of this.decoder.push(Buffer.from(chunk))) {
        this.messages.push(frame)
        if (this.isResponse(frame.message)) {
          const key = this.idKey(frame.message.id)
          const pending = this.pending.get(key)
          if (pending === undefined) continue
          this.pending.delete(key)
          clearTimeout(pending.timer)
          pending.resolve(frame.message)
        } else if (this.isRequest(frame.message)) {
          // The provider may ask for optional editor state. Returning null is a
          // protocol response, never a diagnostic fallback.
          this.respond(frame.message.id, null)
        } else {
          this.notifications.push(frame.message)
          for (const waiter of [...this.notificationWaiters]) {
            if (waiter.method !== frame.message.method || !waiter.predicate(frame.message)) continue
            this.notificationWaiters.splice(this.notificationWaiters.indexOf(waiter), 1)
            clearTimeout(waiter.timer)
            waiter.resolve(frame.message)
            break
          }
        }
      }
    })
    this.child.stderr.on("data", (chunk: Buffer) => this.stderrChunks.push(Buffer.from(chunk).toString("utf8")))
  }

  private readonly isResponse = (message: JsonRpcMessage): message is JsonRpcResponse =>
    "id" in message && !("method" in message)

  private readonly isRequest = (message: JsonRpcMessage): message is JsonRpcRequest =>
    "id" in message && "method" in message

  private readonly idKey = (id: JsonRpcId): string => `${typeof id}:${String(id)}`

  private write(message: JsonRpcMessage): void {
    if (this.child.stdin.destroyed || !this.child.stdin.writable) throw new Error("provider stdin is not writable")
    this.child.stdin.write(encodeFrame(message))
  }

  request(method: string, params: unknown, timeoutMs = 10_000): Promise<JsonRpcResponse> {
    if (this.exitResult !== undefined) return Promise.reject(new Error(`provider already exited before ${method}`))
    const id = this.nextId++
    const key = this.idKey(id)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key)
        reject(new Error(`timed out waiting for provider request ${method}`))
      }, timeoutMs)
      unrefTimer(timer)
      this.pending.set(key, { resolve, reject, timer })
      try {
        this.write({ jsonrpc: "2.0", id, method, params })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(key)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  respond(id: JsonRpcId, result: unknown): void {
    this.write({ jsonrpc: "2.0", id, result })
  }

  notify(method: string, params?: unknown): void {
    this.write({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) })
  }

  async waitForNotification(
    method: string,
    predicate: (message: JsonRpcNotification) => boolean = () => true,
    timeoutMs = 10_000
  ): Promise<JsonRpcNotification> {
    const existing = this.notifications.find((candidate) => candidate.method === method && predicate(candidate))
    if (existing !== undefined) return existing
    return new Promise((resolve, reject) => {
      const waiter = {
        method,
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.notificationWaiters.indexOf(waiter)
          if (index >= 0) this.notificationWaiters.splice(index, 1)
          reject(new Error(`timed out waiting for provider notification ${method}`))
        }, timeoutMs)
      }
      unrefTimer(waiter.timer)
      this.notificationWaiters.push(waiter)
    })
  }

  async waitForExit(timeoutMs: number): Promise<{ readonly code: number | null; readonly signal: string | null } | undefined> {
    if (this.exitResult !== undefined) return this.exitResult
    return await Promise.race([
      this.exitPromise,
      delay(timeoutMs).then(() => undefined)
    ])
  }

  async terminate(): Promise<ProcessExit> {
    const pid = this.pid
    const before = pid === null ? { available: false, pids: [] as readonly number[] } : processDescendants(pid)
    let forced = false
    if (this.exitResult === undefined && this.child.stdin.writable && !this.child.stdin.destroyed) this.child.stdin.end()
    let result = await this.waitForExit(2_000)
    if (result === undefined && this.exitResult === undefined) {
      forced = true
      this.child.kill("SIGTERM")
      result = await this.waitForExit(1_000)
    }
    if (result === undefined && this.exitResult === undefined) {
      forced = true
      this.child.kill("SIGKILL")
      result = await this.waitForExit(1_000)
    }
    const after = pid === null ? { available: false, pids: [] as readonly number[] } : processDescendants(pid)
    return {
      terminated: result !== undefined || this.exitResult !== undefined,
      code: result?.code ?? this.exitResult?.code ?? null,
      signal: result?.signal ?? this.exitResult?.signal ?? null,
      forced,
      stderr: this.stderrChunks.join(""),
      pid,
      descendantsBeforeForce: before.pids,
      descendantsAfterExit: after.pids,
      processTreeAvailable: before.available && after.available
    }
  }

  isAlive(): boolean {
    return stillAlive(this.pid ?? undefined)
  }
}

export interface BaseLspSnapshot {
  readonly rootUri: string
  readonly fileUri: string
  readonly text: string
  readonly version: number
}

export class EffectTsgoBaseLsp {
  readonly process: JsonRpcProcess
  readonly snapshot: BaseLspSnapshot
  private initialized = false

  constructor(executable: string, cwd: string, rootUri: string, fileUri: string, text: string) {
    this.process = new JsonRpcProcess(executable, cwd, ["--lsp", "--stdio"])
    this.snapshot = { rootUri, fileUri, text, version: 1 }
  }

  async initialize(): Promise<JsonRpcResponse> {
    const response = await this.process.request("initialize", {
      processId: null,
      rootUri: this.snapshot.rootUri,
      workspaceFolders: [{ uri: this.snapshot.rootUri, name: "effx-provider-seam" }],
      capabilities: {
        textDocument: {
          publishDiagnostics: { relatedInformation: true },
          diagnostic: { dynamicRegistration: false },
          codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ["quickfix"] } } }
        }
      }
    })
    if (response.error !== undefined) throw new Error(`Effect TSGO initialize failed: ${response.error.message}`)
    this.process.notify("initialized", {})
    this.initialized = true
    return response
  }

  async open(): Promise<void> {
    if (!this.initialized) throw new Error("base LSP must initialize before open")
    this.process.notify("textDocument/didOpen", {
      textDocument: { uri: this.snapshot.fileUri, languageId: "typescript", version: this.snapshot.version, text: this.snapshot.text }
    })
  }

  async change(text: string, version: number): Promise<void> {
    if (!this.initialized) throw new Error("base LSP must initialize before change")
    this.process.notify("textDocument/didChange", {
      textDocument: { uri: this.snapshot.fileUri, version },
      contentChanges: [{ text }]
    })
  }

  async closeFile(): Promise<void> {
    if (!this.initialized) return
    this.process.notify("textDocument/didClose", { textDocument: { uri: this.snapshot.fileUri } })
  }

  async pullDiagnostics(): Promise<JsonRpcResponse> {
    return await this.process.request("textDocument/diagnostic", {
      textDocument: { uri: this.snapshot.fileUri },
      identifier: "typescript"
    })
  }

  async gracefulShutdown(): Promise<ProcessExit> {
    if (this.initialized && this.process.isAlive()) {
      const response = await this.process.request("shutdown", null)
      if (response.error !== undefined) throw new Error(`Effect TSGO shutdown failed: ${response.error.message}`)
      this.process.notify("exit")
    }
    return await this.process.terminate()
  }

  async forcedCleanup(): Promise<ProcessExit> {
    return await this.process.terminate()
  }
}
