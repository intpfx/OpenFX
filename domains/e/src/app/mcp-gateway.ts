import type { WorkspaceBoundaryKernel } from "../core/workspace-boundary.ts";
import type {
  BoundaryRequest,
  KernelError,
  ProposedAction,
  RuntimeAdapterRecord,
  WorkspaceBoundaryDecision,
} from "../core/types.ts";

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpClientAdapter {
  listTools(): Promise<McpToolDescriptor[]>;
  invokeTool(name: string, args: unknown): Promise<unknown>;
}

export interface McpGatewayOptions {
  client: McpClientAdapter;
  boundary?: WorkspaceBoundaryKernel;
  now?: () => number;
  createId?: () => string;
}

export interface McpGatewayCall {
  name: string;
  args: unknown;
}

export interface McpGatewayResult {
  ok: boolean;
  content?: unknown;
  sanitizedArgs?: unknown;
  proposedAction?: ProposedAction;
  boundaryRequest?: BoundaryRequest;
  adapterRecord: RuntimeAdapterRecord;
  error?: KernelError;
}

export async function listMcpGatewayTools(
  options: McpGatewayOptions,
): Promise<McpToolDescriptor[]> {
  return await options.client.listTools();
}

export async function discoverMcpGatewayTools(
  options: McpGatewayOptions,
): Promise<McpGatewayResult> {
  const context = createContext(options);
  try {
    const content = await options.client.listTools();
    return {
      ok: true,
      content,
      adapterRecord: createAdapterRecord(context, "discover", "succeeded", undefined, {
        result: content,
      }),
    };
  } catch (error) {
    const kernelError = toKernelError(error);
    return {
      ok: false,
      error: kernelError,
      adapterRecord: createAdapterRecord(context, "discover", "failed", undefined, {
        error: kernelError,
      }),
    };
  }
}

export async function executeMcpGatewayCall(
  options: McpGatewayOptions,
  call: McpGatewayCall,
): Promise<McpGatewayResult> {
  const context = createContext(options);
  const sanitized = await sanitizeMcpArgs(options, call.args);
  if (sanitized.boundary && sanitized.boundary.kind !== "inside_workspace") {
    return {
      ok: false,
      sanitizedArgs: sanitized.value,
      proposedAction: sanitized.boundary.proposedAction,
      boundaryRequest: sanitized.boundary.boundaryRequest,
      adapterRecord: createAdapterRecord(
        context,
        `invoke:${call.name}`,
        "boundary_required",
        call,
        {
          boundaryRequestId: sanitized.boundary.boundaryRequest.id,
        },
      ),
    };
  }

  try {
    const content = await options.client.invokeTool(call.name, sanitized.value);
    return {
      ok: true,
      content,
      sanitizedArgs: sanitized.value,
      adapterRecord: createAdapterRecord(
        context,
        `invoke:${call.name}`,
        "succeeded",
        call,
        {
          result: content,
        },
      ),
    };
  } catch (error) {
    const kernelError = toKernelError(error);
    return {
      ok: false,
      sanitizedArgs: sanitized.value,
      error: kernelError,
      adapterRecord: createAdapterRecord(
        context,
        `invoke:${call.name}`,
        "failed",
        call,
        {
          error: kernelError,
        },
      ),
    };
  }
}

interface SanitizedArgs {
  value: unknown;
  boundary?: WorkspaceBoundaryDecision;
}

async function sanitizeMcpArgs(
  options: McpGatewayOptions,
  args: unknown,
): Promise<SanitizedArgs> {
  return await sanitizeValue(options, args);
}

async function sanitizeValue(
  options: McpGatewayOptions,
  value: unknown,
  keyHint = "",
): Promise<SanitizedArgs> {
  if (
    typeof value === "string" && options.boundary && shouldClassifyPath(keyHint, value)
  ) {
    const boundary = await options.boundary.classifyPath(value, {
      title: "MCP tool references a path outside workspace",
      reason: "MCP tool arguments must not implicitly cross workspace boundaries.",
    });
    if (boundary.kind === "inside_workspace") {
      return { value: boundary.relativePath, boundary };
    }
    return { value, boundary };
  }

  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      const sanitized = await sanitizeValue(options, item, keyHint);
      if (sanitized.boundary && sanitized.boundary.kind !== "inside_workspace") {
        return { value, boundary: sanitized.boundary };
      }
      items.push(sanitized.value);
    }
    return { value: items };
  }

  if (isRecord(value)) {
    const record: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const sanitized = await sanitizeValue(options, item, key);
      if (sanitized.boundary && sanitized.boundary.kind !== "inside_workspace") {
        return { value, boundary: sanitized.boundary };
      }
      record[key] = sanitized.value;
    }
    return { value: record };
  }

  return { value };
}

function shouldClassifyPath(keyHint: string, value: string): boolean {
  const lowered = keyHint.toLowerCase();
  if (
    lowered.includes("path") ||
    lowered.includes("file") ||
    lowered.includes("cwd") ||
    lowered.includes("directory") ||
    lowered.endsWith("dir") ||
    lowered.includes("uri")
  ) {
    return true;
  }
  const trimmed = value.trim();
  return /^(\/|\.\/|\.\.\/|~\/|[a-zA-Z]:[\\/])/.test(trimmed);
}

interface GatewayContext {
  now: () => number;
  createId: () => string;
}

function createContext(options: McpGatewayOptions): GatewayContext {
  return {
    now: options.now ?? Date.now,
    createId: options.createId ?? crypto.randomUUID,
  };
}

function createAdapterRecord(
  context: GatewayContext,
  operation: string,
  state: RuntimeAdapterRecord["state"],
  input: unknown,
  extra: Partial<RuntimeAdapterRecord> = {},
): RuntimeAdapterRecord {
  return {
    id: context.createId(),
    kind: "mcp_gateway",
    operation,
    state,
    input,
    at: context.now(),
    ...extra,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toKernelError(error: unknown): KernelError {
  return {
    code: "mcp_gateway_adapter_error",
    message: error instanceof Error ? error.message : String(error),
  };
}
