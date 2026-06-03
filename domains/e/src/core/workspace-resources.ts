import type { KvStore } from "../interfaces/kv-store.ts";
import type { ResourceAnchor, WorkspaceResource } from "./types.ts";

export interface WorkspaceResourcesOptions {
  agentId: string;
  sessionId?: string;
  store: KvStore;
  fileReader?: FileResourceReader;
}

export interface FileResourceReader {
  readText(path: string): Promise<string>;
}

export interface ResolveOptions {
  mediaType?: string;
  anchorText?: string;
  limit?: number;
}

export class WorkspaceResources {
  readonly #agentId: string;
  readonly #sessionId?: string;
  readonly #store: KvStore;
  readonly #fileReader: FileResourceReader;

  constructor(options: WorkspaceResourcesOptions) {
    this.#agentId = options.agentId;
    this.#sessionId = options.sessionId;
    this.#store = options.store;
    this.#fileReader = options.fileReader ?? new MissingFileResourceReader();
  }

  async resolve(uri: string, options: ResolveOptions = {}): Promise<WorkspaceResource> {
    const parsed = parseResourceUri(uri);

    switch (parsed.scheme) {
      case "file":
        return await this.#resolveFile(uri, parsed.path, options);
      case "memory":
        return await this.#resolveStorePrefix(
          uri,
          `agent:${this.#agentId}:memory:${parsed.path}`,
          "application/x-ndjson",
          options,
        );
      case "session":
        return await this.#resolveSession(uri, parsed.path, options);
      case "artifact":
        return await this.#resolveStorePrefix(
          uri,
          `artifact:${parsed.path}`,
          "application/json",
          options,
        );
      default:
        throw new Error(`Unsupported resource scheme: ${parsed.scheme}`);
    }
  }

  async #resolveFile(
    uri: string,
    path: string,
    options: ResolveOptions,
  ): Promise<WorkspaceResource> {
    const content = await this.#fileReader.readText(path);
    return {
      uri,
      mediaType: options.mediaType ?? inferMediaType(path),
      digest: await digestText(content),
      content,
      summary: summarizeText(content),
      anchors: options.anchorText ? findAnchors(content, options.anchorText) : [],
      redaction: "none",
      metadata: { path },
    };
  }

  async #resolveSession(
    uri: string,
    path: string,
    options: ResolveOptions,
  ): Promise<WorkspaceResource> {
    const sessionId = path || this.#sessionId;
    if (!sessionId) {
      throw new Error("session:// requires a session id.");
    }

    return await this.#resolveStorePrefix(
      uri,
      `agent:${this.#agentId}:session:${sessionId}:message:`,
      "application/x-ndjson",
      options,
    );
  }

  async #resolveStorePrefix(
    uri: string,
    prefix: string,
    mediaType: string,
    options: ResolveOptions,
  ): Promise<WorkspaceResource> {
    const lines: string[] = [];
    for await (const entry of this.#store.list(prefix, { limit: options.limit })) {
      lines.push(JSON.stringify({ key: entry.key, value: entry.value }));
    }

    const content = lines.join("\n");
    return {
      uri,
      mediaType,
      digest: await digestText(content),
      content,
      summary: summarizeText(content),
      anchors: options.anchorText ? findAnchors(content, options.anchorText) : [],
      redaction: "none",
      metadata: { prefix, count: lines.length },
    };
  }
}

export class MissingFileResourceReader implements FileResourceReader {
  readText(path: string): Promise<string> {
    return Promise.reject(
      new Error(`No FileResourceReader was provided for file resource: ${path}`),
    );
  }
}

export class InMemoryFileResourceReader implements FileResourceReader {
  readonly #files = new Map<string, string>();

  constructor(files: Record<string, string>) {
    for (const [path, content] of Object.entries(files)) {
      this.#files.set(path, content);
    }
  }

  readText(path: string): Promise<string> {
    const content = this.#files.get(path);
    if (content === undefined) {
      return Promise.reject(new Error(`File not found: ${path}`));
    }

    return Promise.resolve(content);
  }
}

export function findAnchors(content: string, needle: string): ResourceAnchor[] {
  if (needle.length === 0) {
    return [];
  }

  const anchors: ResourceAnchor[] = [];
  let searchFrom = 0;

  while (true) {
    const index = content.indexOf(needle, searchFrom);
    if (index === -1) {
      return anchors;
    }

    const before = content.slice(0, index);
    const line = before.split("\n").length;
    const lastNewline = before.lastIndexOf("\n");
    const column = index - lastNewline;
    anchors.push({
      id: `anchor:${line}:${column}`,
      line,
      column,
      length: needle.length,
      text: needle,
    });
    searchFrom = index + needle.length;
  }
}

function parseResourceUri(uri: string): { scheme: string; path: string } {
  const match = /^([a-z]+):\/\/(.*)$/.exec(uri);
  if (!match) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  return { scheme: match[1], path: decodeURIComponent(match[2]) };
}

function inferMediaType(path: string): string {
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".md")) return "text/markdown";
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "text/typescript";
  return "text/plain";
}

function summarizeText(content: string): string {
  const firstLine = content.split("\n").find((line) => line.trim().length > 0) ?? "";
  return firstLine.slice(0, 160);
}

async function digestText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
