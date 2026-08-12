/**
 * Pure, syntax-local import planning for safe Oxlint fixes.
 *
 * The planner never parses or resolves a module graph. Callers provide the
 * source text, the import declarations visible in that text, and the names
 * already bound at program scope. A refusal is represented by `null` when a
 * requested edit would need non-local or type-aware proof.
 */

import type { ImportDeclaration, ImportSpecifierNode, Node } from "./ast.js";

export interface TextEdit {
  readonly range: readonly [number, number];
  readonly text: string;
}

export interface ImportRequest {
  readonly module: string;
  readonly symbol: string;
  readonly preferredLocal: string;
}

export interface ImportPlannerInput {
  readonly sourceText: string;
  /** Program-body import declarations, in source order where possible. */
  readonly importDeclarations?: readonly ImportDeclaration[];
  /** Alias for callers that call these simply `imports`. */
  readonly imports?: readonly ImportDeclaration[];
  readonly topLevelBindings: readonly string[] | ReadonlySet<string>;
  readonly request: ImportRequest;
}

export interface ImportPlan {
  readonly local: string;
  readonly edits: readonly TextEdit[];
}

type ParsedSpecifier = {
  readonly kind: "named" | "namespace" | "default";
  readonly imported: string;
  readonly local: string;
  readonly typeOnly: boolean;
};

type ParsedImport = {
  readonly declaration: ImportDeclaration;
  readonly source: string;
  readonly sourceText: string;
  readonly specifiers: readonly ParsedSpecifier[];
  readonly declarationTypeOnly: boolean;
  readonly namedOpen: number | null;
  readonly namedClose: number | null;
  readonly fromOffset: number | null;
  readonly unsafe: boolean;
  readonly sideEffectOnly: boolean;
};

const IMPORT_TYPE_WORD = /^\s*import\s+type\b/;

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "type" in value;
}

function sourceValue(declaration: ImportDeclaration): string | null {
  const value = declaration.source.value;
  return typeof value === "string" ? value : null;
}

function declarationRange(
  declaration: ImportDeclaration,
  sourceText: string,
): readonly [number, number] | null {
  const range = declaration.range;
  if (range === undefined) return null;
  const [start, end] = range;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end > sourceText.length
  ) {
    return null;
  }
  return [start, end];
}

function matchingBrace(text: string, open: number): number | null {
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  for (let index = open; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return index;
  }
  return null;
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{" || character === "(" || character === "[") depth += 1;
    else if (character === "}" || character === ")" || character === "]") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function unquote(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 2) return null;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first !== "'" && first !== '"') || last !== first) return null;
  return trimmed.slice(1, -1);
}

function identifierName(value: unknown): string | null {
  if (!isNode(value)) return null;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" ? name : null;
}

function importedName(specifier: ImportSpecifierNode): string | null {
  if (specifier.type === "ImportNamespaceSpecifier") return "*";
  if (specifier.type === "ImportDefaultSpecifier") return "default";
  return identifierName(specifier.imported) ?? identifierName(specifier.local);
}

function astSpecifiers(declaration: ImportDeclaration): ParsedSpecifier[] {
  const parsed: ParsedSpecifier[] = [];
  const declarationTypeOnly = declaration.importKind === "type";
  for (const raw of declaration.specifiers) {
    if (!isNode(raw)) continue;
    const specifier = raw as ImportSpecifierNode;
    if (
      specifier.type !== "ImportSpecifier" &&
      specifier.type !== "ImportNamespaceSpecifier" &&
      specifier.type !== "ImportDefaultSpecifier"
    ) {
      continue;
    }
    const local = identifierName(specifier.local);
    const imported = importedName(specifier);
    if (local === null || imported === null) continue;
    parsed.push({
      kind:
        specifier.type === "ImportSpecifier"
          ? "named"
          : specifier.type === "ImportNamespaceSpecifier"
            ? "namespace"
            : "default",
      imported,
      local,
      typeOnly: declarationTypeOnly || specifier.importKind === "type",
    });
  }
  return parsed;
}

function parsedSpecifiers(
  declaration: ImportDeclaration,
  declarationSource: string,
  namedOpen: number | null,
  namedClose: number | null,
  fromOffset: number | null,
): ParsedSpecifier[] {
  if (namedOpen !== null && namedClose !== null) {
    const body = declarationSource.slice(namedOpen + 1, namedClose);
    const declarationTypeOnly = IMPORT_TYPE_WORD.test(declarationSource);
    const result: ParsedSpecifier[] = [];
    for (const part of splitTopLevel(body)) {
      const trimmed = part.trim().replace(/,$/u, "").trim();
      if (trimmed.length === 0) continue;
      const tokens = trimmed.split(/\s+/u);
      let typeOnly = declarationTypeOnly;
      if (tokens[0] === "type") {
        typeOnly = true;
        tokens.shift();
      }
      if (tokens.length === 0) continue;
      const asIndex = tokens.indexOf("as");
      const importedToken = asIndex === -1 ? tokens[0] : tokens.slice(0, asIndex).join(" ");
      const localToken = asIndex === -1 ? tokens[0] : tokens[asIndex + 1];
      if (importedToken === undefined || localToken === undefined) continue;
      const imported = unquote(importedToken) ?? importedToken;
      const local = unquote(localToken) ?? localToken;
      if (imported.length === 0 || local.length === 0) continue;
      result.push({ kind: "named", imported, local, typeOnly });
    }
    const prefix = declarationSource.slice(0, namedOpen);
    const defaultMatch = /\bimport\s+(?!type\b)([^\s,{]+)\s*,?\s*$/u.exec(prefix);
    if (defaultMatch !== null) {
      result.unshift({
        kind: "default",
        imported: "default",
        local: defaultMatch[1] ?? "",
        typeOnly: declarationTypeOnly,
      });
    }
    return result;
  }

  const trimmed = declarationSource.trim();
  if (/^import\s*["']/u.test(trimmed)) return [];
  const body = fromOffset === null ? trimmed : declarationSource.slice(0, fromOffset);
  const afterImport = body.replace(/^\s*import\s+/u, "").trim();
  if (afterImport.startsWith("*")) {
    const match = /^\*\s+as\s+([A-Za-z_$][\w$]*)/u.exec(afterImport);
    return match === null
      ? astSpecifiers(declaration)
      : [
          {
            kind: "namespace",
            imported: "*",
            local: match[1] ?? "",
            typeOnly: IMPORT_TYPE_WORD.test(declarationSource),
          },
        ];
  }
  const defaultName = /^([A-Za-z_$][\w$]*)/u.exec(afterImport)?.[1];
  return defaultName === undefined
    ? astSpecifiers(declaration)
    : [
        {
          kind: "default",
          imported: "default",
          local: defaultName,
          typeOnly: IMPORT_TYPE_WORD.test(declarationSource),
        },
      ];
}

function parseImport(declaration: ImportDeclaration, sourceText: string): ParsedImport | null {
  const source = sourceValue(declaration);
  if (source === null) return null;
  const range = declarationRange(declaration, sourceText);
  if (range === null) {
    const specifiers = astSpecifiers(declaration);
    return {
      declaration,
      source,
      declarationTypeOnly:
        declaration.importKind === "type" ||
        (specifiers.length > 0 && specifiers.every((specifier) => specifier.typeOnly)),
      sourceText: "",
      specifiers,
      namedOpen: null,
      namedClose: null,
      fromOffset: null,
      unsafe:
        (declaration.attributes?.length ?? 0) > 0 || (declaration.assertions?.length ?? 0) > 0,
      sideEffectOnly: specifiers.length === 0,
    };
  }
  const declarationSource = sourceText.slice(range[0], range[1]);
  const sourceMatch = /\bfrom\s*(["'])([^"']+)\1/u.exec(declarationSource);
  const sideEffectMatch = /^\s*import\s*(["'])([^"']+)\1/u.exec(declarationSource);
  const sideEffect = sideEffectMatch !== null;
  const sourceTextValue = sourceMatch?.[2] ?? sideEffectMatch?.[2] ?? null;
  if (sourceTextValue === null) return null;
  const fromOffset = sourceMatch === null ? null : sourceMatch.index;
  const namedOpen = declarationSource.indexOf("{");
  const namedClose = namedOpen === -1 ? null : matchingBrace(declarationSource, namedOpen);
  const trailingDeclarationText = sourceText.slice(range[1]).match(/^[^\r\n;]*/u)?.[0] ?? "";
  const unsafe =
    (declaration.attributes?.length ?? 0) > 0 ||
    (declaration.assertions?.length ?? 0) > 0 ||
    /\b(?:with|assert)\s*\{/u.test(
      `${declarationSource.slice((sourceMatch?.index ?? 0) + (sourceMatch?.[0].length ?? 0))}${trailingDeclarationText}`,
    );
  return {
    declaration,
    source: sourceTextValue,
    sourceText: declarationSource,
    specifiers: parsedSpecifiers(
      declaration,
      declarationSource,
      namedOpen === -1 ? null : namedOpen,
      namedClose,
      fromOffset,
    ),
    declarationTypeOnly: IMPORT_TYPE_WORD.test(declarationSource),
    namedOpen: namedOpen === -1 ? null : namedOpen,
    namedClose,
    fromOffset,
    unsafe,
    sideEffectOnly: sideEffect,
  };
}

function lineBreakOf(sourceText: string): string {
  return sourceText.includes("\r\n") ? "\r\n" : "\n";
}

function skipTrivia(sourceText: string, start: number): number {
  let offset = start;
  while (offset < sourceText.length) {
    while (/\s/u.test(sourceText[offset] ?? "")) offset += 1;
    if (sourceText.startsWith("//", offset)) {
      const end = sourceText.indexOf("\n", offset + 2);
      offset = end === -1 ? sourceText.length : end + 1;
      continue;
    }
    if (sourceText.startsWith("/*", offset)) {
      const end = sourceText.indexOf("*/", offset + 2);
      offset = end === -1 ? sourceText.length : end + 2;
      continue;
    }
    break;
  }
  return offset;
}

function directiveEnd(sourceText: string, start: number): number | null {
  const quote = sourceText[start];
  if (quote !== "'" && quote !== '"') return null;
  let offset = start + 1;
  let escaped = false;
  while (offset < sourceText.length) {
    const character = sourceText[offset];
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === quote) {
      offset += 1;
      while (sourceText[offset] === " " || sourceText[offset] === "\t") offset += 1;
      if (sourceText[offset] === ";") offset += 1;
      return offset;
    }
    if (character === "\n" || character === "\r") return null;
    offset += 1;
  }
  return null;
}

function importSeam(sourceText: string, parsedImports: readonly ParsedImport[]): number | null {
  const ranges = parsedImports
    .map((entry) => entry.declaration.range)
    .filter((range): range is readonly [number, number] => range !== undefined)
    .toSorted((left, right) => left[0] - right[0]);
  if (ranges.length > 0) return ranges[ranges.length - 1]?.[1] ?? null;

  let offset = 0;
  if (sourceText.startsWith("#!")) {
    const lineEnd = sourceText.indexOf("\n");
    offset = lineEnd === -1 ? sourceText.length : lineEnd + 1;
  }
  while (offset < sourceText.length) {
    offset = skipTrivia(sourceText, offset);
    const end = directiveEnd(sourceText, offset);
    if (end === null) break;
    offset = end;
  }
  return offset;
}

function insertionAfter(
  sourceText: string,
  offset: number,
  text: string,
  newline: string,
): TextEdit {
  const before = offset > 0 && !sourceText.slice(0, offset).endsWith("\n") ? newline : "";
  const after =
    offset < sourceText.length && !sourceText.slice(offset).startsWith("\n") ? newline : "";
  return { range: [offset, offset], text: `${before}${text}${after}` };
}

function chooseLocal(preferredLocal: string, bindings: ReadonlySet<string>): string {
  if (!bindings.has(preferredLocal)) return preferredLocal;
  if (!bindings.has("EffectConsole")) return "EffectConsole";
  let suffix = 2;
  while (bindings.has(`EffectConsole${suffix}`)) suffix += 1;
  return `EffectConsole${suffix}`;
}

function namedImportText(symbol: string, local: string): string {
  return local === symbol ? symbol : `${symbol} as ${local}`;
}

function mergeNamedImport(parsed: ParsedImport, symbol: string, local: string): TextEdit | null {
  const open = parsed.namedOpen;
  const close = parsed.namedClose;
  const range = parsed.declaration.range;
  if (open === null || close === null || range === undefined) return null;
  const body = parsed.sourceText.slice(open + 1, close);
  const specifier = namedImportText(symbol, local);
  if (body.trim().length === 0) {
    return { range: [range[0] + close, range[0] + close], text: specifier };
  }
  if (body.includes("\n")) {
    const trailingNewline = /\r?\n\s*$/u.test(body);
    const indentMatch = /\r?\n([ \t]*)\S[^\r\n]*\r?\n\s*$/u.exec(body);
    const indent = indentMatch?.[1] ?? "  ";
    const text = trailingNewline ? `${indent}${specifier},\n` : `,\n${indent}${specifier}`;
    return { range: [range[0] + close, range[0] + close], text };
  }
  const trailingWhitespace = /\s*$/u.exec(body)?.[0] ?? "";
  const insertion = range[0] + close - trailingWhitespace.length;
  const withoutTrailingWhitespace = body.slice(0, body.length - trailingWhitespace.length);
  const separator = /,\s*$/u.test(withoutTrailingWhitespace) ? " " : ", ";
  return {
    range: [insertion, range[0] + close],
    text: `${separator}${specifier}${trailingWhitespace}`,
  };
}

function mergeDefaultImport(parsed: ParsedImport, symbol: string, local: string): TextEdit | null {
  const range = parsed.declaration.range;
  const fromOffset = parsed.fromOffset;
  if (range === undefined || fromOffset === null) return null;
  const prefix = parsed.sourceText.slice(0, fromOffset);
  const tokenEnd = prefix.search(/\s*$/u);
  const insertionOffset = tokenEnd === -1 ? fromOffset : tokenEnd;
  const specifier = `{ ${namedImportText(symbol, local)} }`;
  return {
    range: [range[0] + insertionOffset, range[0] + insertionOffset],
    text: `, ${specifier}`,
  };
}

function normalizeInput(
  inputOrSource: ImportPlannerInput | string,
  imports?: readonly ImportDeclaration[],
  topLevelBindings?: readonly string[] | ReadonlySet<string>,
  request?: ImportRequest,
): ImportPlannerInput | null {
  if (typeof inputOrSource !== "string") return inputOrSource;
  if (imports === undefined || topLevelBindings === undefined || request === undefined) return null;
  return {
    sourceText: inputOrSource,
    importDeclarations: imports,
    topLevelBindings,
    request,
  };
}

export function planImport(input: ImportPlannerInput): ImportPlan | null;
export function planImport(
  sourceText: string,
  importDeclarations: readonly ImportDeclaration[],
  topLevelBindings: readonly string[] | ReadonlySet<string>,
  request: ImportRequest,
): ImportPlan | null;
export function planImport(
  inputOrSource: ImportPlannerInput | string,
  imports?: readonly ImportDeclaration[],
  topLevelBindings?: readonly string[] | ReadonlySet<string>,
  request?: ImportRequest,
): ImportPlan | null {
  const input = normalizeInput(inputOrSource, imports, topLevelBindings, request);
  if (input === null) return null;
  const { sourceText, request: importRequest } = input;
  if (
    importRequest.module.length === 0 ||
    importRequest.symbol.length === 0 ||
    importRequest.preferredLocal.length === 0
  ) {
    return null;
  }
  const declarations = input.importDeclarations ?? input.imports ?? [];
  const parsedImports: ParsedImport[] = [];
  const allParsedImports: ParsedImport[] = [];
  for (const declaration of declarations) {
    const parsed = parseImport(declaration, sourceText);
    if (parsed === null) {
      if (sourceValue(declaration) === importRequest.module) return null;
      continue;
    }
    allParsedImports.push(parsed);
    if (parsed.source !== importRequest.module) continue;
    if (parsed.unsafe || parsed.sideEffectOnly) return null;
    if (parsed.specifiers.some((specifier) => specifier.kind === "namespace")) return null;
    parsedImports.push(parsed);
  }
  const bindings = new Set<string>(input.topLevelBindings);
  for (const parsed of allParsedImports) {
    for (const specifier of parsed.specifiers) bindings.add(specifier.local);
  }
  for (const parsed of parsedImports) {
    const existing = parsed.specifiers.find(
      (specifier) =>
        specifier.kind === "named" &&
        specifier.imported === importRequest.symbol &&
        !specifier.typeOnly &&
        !parsed.declarationTypeOnly,
    );
    if (existing !== undefined) return { local: existing.local, edits: [] };
  }

  const local = chooseLocal(importRequest.preferredLocal, bindings);
  for (const parsed of parsedImports) {
    if (parsed.declarationTypeOnly) continue;
    const hasNamed = parsed.namedOpen !== null && parsed.namedClose !== null;
    const hasDefault = parsed.specifiers.some((specifier) => specifier.kind === "default");
    const edit = hasNamed
      ? mergeNamedImport(parsed, importRequest.symbol, local)
      : hasDefault
        ? mergeDefaultImport(parsed, importRequest.symbol, local)
        : null;
    if (edit === null) return null;
    return { local, edits: [edit] };
  }

  const seam = importSeam(sourceText, allParsedImports);
  if (seam === null) return null;
  const newline = lineBreakOf(sourceText);
  const importText = `import { ${namedImportText(importRequest.symbol, local)} } from ${JSON.stringify(importRequest.module)};`;
  return { local, edits: [insertionAfter(sourceText, seam, importText, newline)] };
}
