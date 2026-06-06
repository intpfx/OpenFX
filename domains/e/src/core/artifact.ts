import type { KvStore } from "../interfaces/kv-store.ts";
import type { Artifact, ArtifactKind } from "./types.ts";

export interface ArtifactKernelOptions {
  store: KvStore;
  now?: () => number;
  createId?: () => string;
}

export interface RecordArtifactInput {
  id?: string;
  taskId: string;
  turnId?: string;
  kind: ArtifactKind;
  path?: string;
  summary: string;
  payload?: unknown;
}

export interface ArtifactFilter {
  taskId?: string;
  turnId?: string;
  kind?: ArtifactKind;
  limit?: number;
}

export interface CompletionSummary {
  summary: string;
  changedFiles: string[];
  tests: string[];
  artifactIds: string[];
}

export class ArtifactKernel {
  readonly #store: KvStore;
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: ArtifactKernelOptions) {
    this.#store = options.store;
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
  }

  async record(input: RecordArtifactInput): Promise<Artifact> {
    const now = this.#now();
    const artifact: Artifact = {
      id: input.id ?? this.#createId(),
      taskId: requiredText(input.taskId, "taskId"),
      turnId: input.turnId,
      kind: input.kind,
      path: input.path,
      summary: requiredText(input.summary, "summary"),
      payload: input.payload,
      createdAt: now,
      updatedAt: now,
    };

    await this.upsert(artifact);
    return artifact;
  }

  async upsert(artifact: Artifact): Promise<Artifact> {
    const updated: Artifact = {
      ...artifact,
      taskId: requiredText(artifact.taskId, "taskId"),
      summary: requiredText(artifact.summary, "summary"),
      updatedAt: artifact.updatedAt ?? this.#now(),
    };
    await this.#store.set(artifactKey(updated.id), updated);
    return updated;
  }

  async get(artifactId: string): Promise<Artifact | null> {
    return await this.#store.get<Artifact>(artifactKey(artifactId));
  }

  async list(filter: ArtifactFilter = {}): Promise<Artifact[]> {
    const artifacts: Artifact[] = [];
    for await (const entry of this.#store.list<Artifact>(artifactPrefix())) {
      const artifact = entry.value;
      if (filter.taskId && artifact.taskId !== filter.taskId) continue;
      if (filter.turnId && artifact.turnId !== filter.turnId) continue;
      if (filter.kind && artifact.kind !== filter.kind) continue;
      artifacts.push(artifact);
    }

    artifacts.sort((left, right) => {
      return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
    });
    return typeof filter.limit === "number"
      ? artifacts.slice(0, filter.limit)
      : artifacts;
  }

  async summarizeCompletion(
    taskId: string,
    fallbackSummary = "Task completed.",
  ): Promise<CompletionSummary> {
    const artifacts = await this.list({ taskId });
    const patchArtifacts = artifacts.filter((artifact) =>
      artifact.kind === "patch_summary"
    );
    const verificationArtifacts = artifacts.filter((artifact) =>
      artifact.kind === "verification"
    );
    const summaryArtifact = patchArtifacts[0] ?? artifacts[0];

    return {
      summary: summaryArtifact?.summary ?? fallbackSummary,
      changedFiles: uniqueStrings([
        ...artifacts.flatMap((artifact) =>
          payloadStringArray(artifact.payload, "changedFiles")
        ),
        ...artifacts.flatMap((artifact) => artifact.path ? [artifact.path] : []),
      ]),
      tests: uniqueStrings(verificationArtifacts.map((artifact) => artifact.summary)),
      artifactIds: artifacts.map((artifact) => artifact.id),
    };
  }
}

export function artifactPrefix(): string {
  return "agent:artifact:record:";
}

export function artifactKey(artifactId: string): string {
  return `${artifactPrefix()}${artifactId}`;
}

function requiredText(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${field} must not be empty.`);
  return trimmed;
}

function payloadStringArray(payload: unknown, field: string): string[] {
  if (!isRecord(payload)) return [];
  const value = payload[field];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
