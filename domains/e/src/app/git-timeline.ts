import type { WorkspaceBoundaryKernel } from "../core/workspace-boundary.ts";
import type {
  BoundaryRequest,
  KernelError,
  ProposedAction,
  RuntimeAdapterRecord,
} from "../core/types.ts";

export interface GitTimelineFileStatus {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked" | "conflicted";
}

export interface GitTimelineStatus {
  branch: string;
  clean: boolean;
  files: GitTimelineFileStatus[];
}

export interface GitDiffSummary {
  filesChanged: number;
  insertions: number;
  deletions: number;
  summary: string;
}

export interface GitCheckpoint {
  id: string;
  label: string;
  taskId?: string;
  ref?: string;
  createdAt: number;
}

export interface GitTaskBranch {
  branch: string;
  baseBranch?: string;
  taskId: string;
}

export interface GitTimelineAdapter {
  status(path: string): Promise<GitTimelineStatus>;
  diffSummary(path: string): Promise<GitDiffSummary>;
  createCheckpoint(input: {
    path: string;
    taskId?: string;
    label: string;
  }): Promise<GitCheckpoint>;
  createTaskBranch(input: {
    path: string;
    taskId: string;
    slug: string;
  }): Promise<GitTaskBranch>;
}

export type GitTimelineOperation =
  | { kind: "status"; path: string }
  | { kind: "diff"; path: string }
  | { kind: "checkpoint"; path: string; taskId?: string; label: string }
  | { kind: "task_branch"; path: string; taskId: string; slug: string };

export interface GitTimelineOptions {
  adapter: GitTimelineAdapter;
  boundary?: WorkspaceBoundaryKernel;
  now?: () => number;
  createId?: () => string;
}

export interface GitTimelineResult {
  ok: boolean;
  content?: unknown;
  proposedAction?: ProposedAction;
  boundaryRequest?: BoundaryRequest;
  adapterRecord: RuntimeAdapterRecord;
  error?: KernelError;
}

export async function executeGitTimelineOperation(
  options: GitTimelineOptions,
  operation: GitTimelineOperation,
): Promise<GitTimelineResult> {
  const context = createContext(options);
  const boundary = options.boundary
    ? await options.boundary.classifyPath(operation.path, {
      title: `${operation.kind} git timeline outside workspace`,
      reason: "Git timeline operations must stay inside the active workspace.",
    })
    : undefined;

  if (boundary && boundary.kind !== "inside_workspace") {
    return {
      ok: false,
      proposedAction: boundary.proposedAction,
      boundaryRequest: boundary.boundaryRequest,
      adapterRecord: createAdapterRecord(
        context,
        operation.kind,
        "boundary_required",
        operation,
        {
          boundaryRequestId: boundary.boundaryRequest.id,
        },
      ),
    };
  }

  const path = boundary?.relativePath ?? operation.path;
  try {
    const content = await runGitOperation(options.adapter, operation, path);
    return {
      ok: true,
      content,
      adapterRecord: createAdapterRecord(
        context,
        operation.kind,
        "succeeded",
        operation,
        {
          result: content,
        },
      ),
    };
  } catch (error) {
    const kernelError = toKernelError(error);
    return {
      ok: false,
      error: kernelError,
      adapterRecord: createAdapterRecord(context, operation.kind, "failed", operation, {
        error: kernelError,
      }),
    };
  }
}

async function runGitOperation(
  adapter: GitTimelineAdapter,
  operation: GitTimelineOperation,
  path: string,
): Promise<unknown> {
  if (operation.kind === "status") {
    return await adapter.status(path);
  }
  if (operation.kind === "diff") {
    return await adapter.diffSummary(path);
  }
  if (operation.kind === "checkpoint") {
    return await adapter.createCheckpoint({
      path,
      taskId: operation.taskId,
      label: operation.label,
    });
  }
  return await adapter.createTaskBranch({
    path,
    taskId: operation.taskId,
    slug: operation.slug,
  });
}

interface GitTimelineContext {
  now: () => number;
  createId: () => string;
}

function createContext(options: GitTimelineOptions): GitTimelineContext {
  return {
    now: options.now ?? Date.now,
    createId: options.createId ?? crypto.randomUUID,
  };
}

function createAdapterRecord(
  context: GitTimelineContext,
  operation: string,
  state: RuntimeAdapterRecord["state"],
  input: unknown,
  extra: Partial<RuntimeAdapterRecord> = {},
): RuntimeAdapterRecord {
  return {
    id: context.createId(),
    kind: "git_timeline",
    operation,
    state,
    input,
    at: context.now(),
    ...extra,
  };
}

function toKernelError(error: unknown): KernelError {
  return {
    code: "git_timeline_adapter_error",
    message: error instanceof Error ? error.message : String(error),
  };
}
