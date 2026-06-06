import type { ArtifactKernel } from "../core/artifact.ts";
import type { WorkspaceBoundaryKernel } from "../core/workspace-boundary.ts";
import type { ToolDefinition, ToolValidationResult } from "../core/tool-runner.ts";
import type {
  Artifact,
  BoundaryRequest,
  KernelError,
  ProposedAction,
  RuntimeAdapterRecord,
} from "../core/types.ts";

export interface WorkspaceDirectoryEntry {
  name: string;
  isDir: boolean;
}

export interface WorkspaceCommandInput {
  cwd: string;
  program: string;
  args?: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface WorkspaceCommandOutput {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated?: boolean;
}

export interface WorkspaceToolAdapter {
  readText(path: string): Promise<string>;
  writeText(
    path: string,
    content: string,
  ): Promise<{ path: string; bytesWritten: number }>;
  list(path: string): Promise<WorkspaceDirectoryEntry[]>;
  runCommand(input: WorkspaceCommandInput): Promise<WorkspaceCommandOutput>;
}

export type WorkspaceToolCall =
  | { operation: "read_file"; path: string }
  | { operation: "write_file"; path: string; content: string }
  | { operation: "list_dir"; path: string }
  | { operation: "run_command"; command: WorkspaceCommandInput };

export interface WorkspaceToolkitOptions {
  adapter: WorkspaceToolAdapter;
  boundary?: WorkspaceBoundaryKernel;
  artifacts?: ArtifactKernel;
  taskId?: string;
  turnId?: string;
  now?: () => number;
  createId?: () => string;
}

export interface WorkspaceToolkitResult {
  ok: boolean;
  content?: unknown;
  proposedAction?: ProposedAction;
  boundaryRequest?: BoundaryRequest;
  artifact?: Artifact;
  adapterRecord: RuntimeAdapterRecord;
  error?: KernelError;
}

export function createWorkspaceToolkitToolDefinitions(
  options: WorkspaceToolkitOptions,
): ToolDefinition[] {
  return [
    {
      name: "workspace.read_file",
      validateArgs: validatePathArgs,
      run: (args) => {
        const record = args as { path: string };
        return executeWorkspaceToolCall(options, {
          operation: "read_file",
          path: record.path,
        });
      },
    },
    {
      name: "workspace.write_file",
      validateArgs(args) {
        if (
          !isRecord(args) || typeof args.path !== "string" ||
          typeof args.content !== "string"
        ) {
          return invalidArgs("workspace.write_file requires string path and content.");
        }
        return { ok: true, args };
      },
      run: (args) => {
        const record = args as { path: string; content: string };
        return executeWorkspaceToolCall(options, {
          operation: "write_file",
          path: record.path,
          content: record.content,
        });
      },
    },
    {
      name: "workspace.list_dir",
      validateArgs: validatePathArgs,
      run: (args) => {
        const record = args as { path: string };
        return executeWorkspaceToolCall(options, {
          operation: "list_dir",
          path: record.path,
        });
      },
    },
    {
      name: "workspace.run_command",
      validateArgs(args) {
        if (!isRecord(args) || !isWorkspaceCommandInput(args)) {
          return invalidArgs(
            "workspace.run_command requires cwd, program, optional args/env/timeoutMs.",
          );
        }
        return { ok: true, args };
      },
      run: (args) => {
        const command = args as unknown as WorkspaceCommandInput;
        return executeWorkspaceToolCall(options, { operation: "run_command", command });
      },
    },
  ];
}

export async function executeWorkspaceToolCall(
  options: WorkspaceToolkitOptions,
  call: WorkspaceToolCall,
): Promise<WorkspaceToolkitResult> {
  const context = createContext(options);
  const boundary = await resolveCallBoundary(options, call);
  if (boundary && boundary.kind !== "inside_workspace") {
    return {
      ok: false,
      proposedAction: boundary.proposedAction,
      boundaryRequest: boundary.boundaryRequest,
      adapterRecord: createAdapterRecord(
        context,
        call.operation,
        "boundary_required",
        call,
        {
          boundaryRequestId: boundary.boundaryRequest.id,
        },
      ),
    };
  }

  try {
    if (call.operation === "read_file") {
      const path = boundary?.relativePath ?? call.path;
      const content = await options.adapter.readText(path);
      return succeeded(context, call.operation, call, content);
    }

    if (call.operation === "write_file") {
      const path = boundary?.relativePath ?? call.path;
      const content = await options.adapter.writeText(path, call.content);
      return succeeded(context, call.operation, call, content);
    }

    if (call.operation === "list_dir") {
      const path = boundary?.relativePath ?? call.path;
      const content = await options.adapter.list(path);
      return succeeded(context, call.operation, call, content);
    }

    const command = {
      ...call.command,
      cwd: boundary?.relativePath ?? call.command.cwd,
    };
    const content = await options.adapter.runCommand(command);
    const artifact = await recordCommandArtifact(options, call, content);
    return {
      ok: true,
      content,
      artifact,
      adapterRecord: createAdapterRecord(context, call.operation, "succeeded", call, {
        result: content,
      }),
    };
  } catch (error) {
    const kernelError = toKernelError(error);
    return {
      ok: false,
      error: kernelError,
      adapterRecord: createAdapterRecord(context, call.operation, "failed", call, {
        error: kernelError,
      }),
    };
  }
}

async function resolveCallBoundary(
  options: WorkspaceToolkitOptions,
  call: WorkspaceToolCall,
) {
  if (!options.boundary) return undefined;
  const path = call.operation === "run_command" ? call.command.cwd : call.path;
  return await options.boundary.classifyPath(path, {
    title: `${call.operation} outside workspace`,
    reason: "Workspace toolkit operation targets a path outside the workspace.",
  });
}

async function recordCommandArtifact(
  options: WorkspaceToolkitOptions,
  call: Extract<WorkspaceToolCall, { operation: "run_command" }>,
  output: WorkspaceCommandOutput,
): Promise<Artifact | undefined> {
  if (!options.artifacts || !options.taskId) return undefined;
  const renderedCommand = [call.command.program, ...(call.command.args ?? [])].join(
    " ",
  );
  return await options.artifacts.record({
    taskId: options.taskId,
    turnId: options.turnId,
    kind: "verification",
    summary: `Command ${renderedCommand} exited with ${output.exitCode}.`,
    payload: {
      command: call.command,
      output,
    },
  });
}

function succeeded(
  context: ToolkitContext,
  operation: string,
  input: unknown,
  content: unknown,
): WorkspaceToolkitResult {
  return {
    ok: true,
    content,
    adapterRecord: createAdapterRecord(context, operation, "succeeded", input, {
      result: content,
    }),
  };
}

interface ToolkitContext {
  now: () => number;
  createId: () => string;
}

function createContext(options: WorkspaceToolkitOptions): ToolkitContext {
  return {
    now: options.now ?? Date.now,
    createId: options.createId ?? crypto.randomUUID,
  };
}

function createAdapterRecord(
  context: ToolkitContext,
  operation: string,
  state: RuntimeAdapterRecord["state"],
  input: unknown,
  extra: Partial<RuntimeAdapterRecord> = {},
): RuntimeAdapterRecord {
  return {
    id: context.createId(),
    kind: "workspace_tool",
    operation,
    state,
    input,
    at: context.now(),
    ...extra,
  };
}

function validatePathArgs(args: unknown): ToolValidationResult {
  if (!isRecord(args) || typeof args.path !== "string") {
    return invalidArgs("Workspace path must be a string.");
  }
  return { ok: true, args };
}

function invalidArgs(message: string): ToolValidationResult {
  return {
    ok: false,
    error: {
      code: "invalid_tool_args",
      message,
    },
  };
}

function isWorkspaceCommandInput(value: Record<string, unknown>): boolean {
  if (typeof value.cwd !== "string" || typeof value.program !== "string") return false;
  if (value.args !== undefined && !isStringArray(value.args)) return false;
  if (value.env !== undefined && !isStringRecord(value.env)) return false;
  if (value.timeoutMs !== undefined && typeof value.timeoutMs !== "number") {
    return false;
  }
  return true;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toKernelError(error: unknown): KernelError {
  return {
    code: "workspace_tool_adapter_error",
    message: error instanceof Error ? error.message : String(error),
  };
}
