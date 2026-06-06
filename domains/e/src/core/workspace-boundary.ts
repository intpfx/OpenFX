import type {
  BoundaryRequest,
  ProposedAction,
  WorkspaceBoundaryDecision,
  WorkspacePathResolution,
} from "./types.ts";

export interface WorkspacePathResolver {
  resolvePath(path: string): WorkspacePathResolution | Promise<WorkspacePathResolution>;
}

export interface WorkspaceBoundaryKernelOptions {
  resolver: WorkspacePathResolver;
  now?: () => number;
  createId?: () => string;
}

export interface WorkspaceBoundaryClassifyOptions {
  reason?: string;
  title?: string;
  preview?: string;
}

export interface WorkspaceExternalBoundaryRecord {
  proposedAction: ProposedAction;
  boundaryRequest: BoundaryRequest;
}

export class WorkspaceBoundaryKernel {
  readonly #resolver: WorkspacePathResolver;
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: WorkspaceBoundaryKernelOptions) {
    this.#resolver = options.resolver;
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
  }

  async classifyPath(
    path: string,
    options: WorkspaceBoundaryClassifyOptions = {},
  ): Promise<WorkspaceBoundaryDecision> {
    const resolution = await this.#resolver.resolvePath(path);
    if (resolution.insideWorkspace && !resolution.escapedSymlink) {
      return {
        kind: "inside_workspace",
        inputPath: resolution.inputPath,
        absolutePath: resolution.absolutePath,
        relativePath: resolution.relativePath ?? normalizeRelativeFallback(path),
        workspaceId: resolution.workspaceId,
      };
    }

    const proposedAction = this.#createProposedAction({
      title: options.title ?? `Use path outside workspace: ${path}`,
      target: resolution.absolutePath,
      preview: options.preview,
    });
    const boundaryRequest = this.#createBoundaryRequest(
      options.reason ?? "Path resolves outside the current workspace boundary.",
      proposedAction,
    );

    return {
      kind: "outside_workspace",
      inputPath: resolution.inputPath,
      absolutePath: resolution.absolutePath,
      escapedSymlink: resolution.escapedSymlink === true,
      proposedAction,
      boundaryRequest,
    };
  }

  async createExternalImportDecision(
    path: string,
    importTargetUri: string,
    options: WorkspaceBoundaryClassifyOptions = {},
  ): Promise<WorkspaceBoundaryDecision> {
    const resolution = await this.#resolver.resolvePath(path);
    const proposedAction = this.#createProposedAction({
      title: options.title ?? `Import external resource: ${path}`,
      target: importTargetUri,
      preview: options.preview ?? resolution.absolutePath,
    });
    const boundaryRequest = this.#createBoundaryRequest(
      options.reason ??
        "External resources must be imported through an explicit boundary.",
      proposedAction,
    );

    return {
      kind: "external_import_required",
      inputPath: resolution.inputPath,
      absolutePath: resolution.absolutePath,
      importTargetUri,
      proposedAction,
      boundaryRequest,
    };
  }

  createExternalEffectBoundary(
    title: string,
    target: string,
    reason = "Remote or cross-workspace side effects require an explicit boundary.",
    preview?: string,
  ): WorkspaceExternalBoundaryRecord {
    const proposedAction = this.#createProposedAction({ title, target, preview });
    return {
      proposedAction,
      boundaryRequest: this.#createBoundaryRequest(reason, proposedAction),
    };
  }

  #createProposedAction(input: {
    title: string;
    target: string;
    preview?: string;
  }): ProposedAction {
    return {
      id: this.#createId(),
      kind: "external_effect",
      title: input.title,
      target: input.target,
      preview: input.preview,
      state: "ready",
    };
  }

  #createBoundaryRequest(reason: string, action: ProposedAction): BoundaryRequest {
    return {
      id: this.#createId(),
      reason,
      action,
      state: "pending",
      createdAt: this.#now(),
    };
  }
}

function normalizeRelativeFallback(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0 || trimmed === ".") return ".";
  return trimmed.replace(/^[./\\]+/, "");
}
