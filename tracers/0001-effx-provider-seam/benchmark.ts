import { isExpressionStatement, type Node, type SourceFile } from "typescript/unstable/ast"
import { API, type Project } from "typescript/unstable/async"
import { existsSync } from "node:fs"
import { dirname } from "node:path"

export interface PerformanceSample {
  readonly name: "cold" | "warm" | "incremental" | "effect-heavy" | "multi-project"
  readonly time: { readonly bucket: string; readonly upperBoundMilliseconds: number }
  readonly memory: { readonly bucket: string; readonly upperBoundBytes: number }
  readonly projects: number
  readonly files: number
  readonly expressions: number
  readonly typedExpressions: number
}

export interface PerformanceEvidence {
  readonly schemaVersion: 1
  readonly measurementPolicy: {
    readonly timing: "bucketed wall-clock milliseconds"
    readonly memory: "bucketed RSS delta bytes"
    readonly byteStable: true
  }
  readonly samples: readonly PerformanceSample[]
}

const expressionNodes = (sourceFile: SourceFile): Node[] => {
  const nodes: Node[] = []
  const visit = (node: Node): void => {
    if (isExpressionStatement(node)) nodes.push(node.expression)
    node.forEachChild(visit)
  }
  visit(sourceFile)
  return nodes
}

const timeBucket = (milliseconds: number): { readonly bucket: string; readonly upperBoundMilliseconds: number } => {
  if (milliseconds < 250) return { bucket: "0-249ms", upperBoundMilliseconds: 249 }
  if (milliseconds < 1_000) return { bucket: "250-999ms", upperBoundMilliseconds: 999 }
  if (milliseconds < 5_000) return { bucket: "1-4s", upperBoundMilliseconds: 4_999 }
  return { bucket: "5s-or-more", upperBoundMilliseconds: Number.MAX_SAFE_INTEGER }
}

const memoryBucket = (bytes: number): { readonly bucket: string; readonly upperBoundBytes: number } => {
  if (bytes < 16 * 1024 * 1024) return { bucket: "0-15MiB", upperBoundBytes: 16 * 1024 * 1024 - 1 }
  if (bytes < 64 * 1024 * 1024) return { bucket: "16-63MiB", upperBoundBytes: 64 * 1024 * 1024 - 1 }
  if (bytes < 256 * 1024 * 1024) return { bucket: "64-255MiB", upperBoundBytes: 256 * 1024 * 1024 - 1 }
  return { bucket: "256MiB-or-more", upperBoundBytes: Number.MAX_SAFE_INTEGER }
}

interface TraversalStats {
  readonly projects: number
  readonly files: number
  readonly expressions: number
  readonly typedExpressions: number
}

const collectStats = async (projects: readonly Project[]): Promise<TraversalStats> => {
  let files = 0
  let expressions = 0
  let typedExpressions = 0
  for (const project of projects) {
    for (const file of project.rootFiles) {
      const sourceFile = await project.program.getSourceFile(file)
      if (sourceFile === undefined || sourceFile.isDeclarationFile) continue
      files += 1
      const nodes = expressionNodes(sourceFile)
      expressions += nodes.length
      if (nodes.length > 0) {
        const types = await project.checker.getTypeAtLocation(nodes)
        typedExpressions += types.filter((type) => type !== undefined).length
      }
    }
  }
  return { projects: projects.length, files, expressions, typedExpressions }
}

const sample = async (
  name: PerformanceSample["name"],
  update: () => Promise<readonly Project[]>
): Promise<PerformanceSample> => {
  const beforeMemory = process.memoryUsage().rss
  const started = performance.now()
  const projects = await update()
  const stats = await collectStats(projects)
  const elapsed = performance.now() - started
  const memoryDelta = Math.max(0, process.memoryUsage().rss - beforeMemory)
  return {
    name,
    time: timeBucket(elapsed),
    memory: memoryBucket(memoryDelta),
    projects: stats.projects,
    files: stats.files,
    expressions: stats.expressions,
    typedExpressions: stats.typedExpressions
  }
}

export async function runBenchmarks(
  probeConfig: string,
  effectHeavyFile: string,
  multiProjectConfigs: readonly [string, string]
): Promise<PerformanceEvidence> {
  if (!existsSync(probeConfig) || !existsSync(effectHeavyFile)) throw new Error("benchmark fixture/config is missing")
  const cwd = dirname(probeConfig)
  const samples: PerformanceSample[] = []

  const coldApi = new API({ cwd })
  try {
    samples.push(await sample("cold", async () => (await coldApi.updateSnapshot({ openProject: probeConfig })).getProjects()))
  } finally {
    await coldApi.close()
  }

  const warmApi = new API({ cwd })
  try {
    await warmApi.updateSnapshot({ openProject: probeConfig })
    samples.push(await sample("warm", async () => (await warmApi.updateSnapshot({ openProject: probeConfig })).getProjects()))
    samples.push(await sample("incremental", async () => (await warmApi.updateSnapshot({ fileChanges: { changed: [effectHeavyFile] } })).getProjects()))
  } finally {
    await warmApi.close()
  }

  const effectApi = new API({ cwd })
  try {
    samples.push(await sample("effect-heavy", async () => (await effectApi.updateSnapshot({ openFiles: [effectHeavyFile] })).getProjects()))
  } finally {
    await effectApi.close()
  }

  const multiApi = new API({ cwd })
  try {
    samples.push(await sample("multi-project", async () => (await multiApi.updateSnapshot({ openProjects: multiProjectConfigs })).getProjects()))
  } finally {
    await multiApi.close()
  }

  return {
    schemaVersion: 1,
    measurementPolicy: {
      timing: "bucketed wall-clock milliseconds",
      memory: "bucketed RSS delta bytes",
      byteStable: true
    },
    samples
  }
}
