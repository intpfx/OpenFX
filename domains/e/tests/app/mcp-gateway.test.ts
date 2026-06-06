import { assertEquals } from "jsr:@std/assert";

import {
  discoverMcpGatewayTools,
  executeMcpGatewayCall,
  listMcpGatewayTools,
  type McpClientAdapter,
  WorkspaceBoundaryKernel,
  type WorkspacePathResolution,
} from "../../src/mod.ts";

Deno.test("MCP gateway discovers tools and sanitizes inside path arguments", async () => {
  let invokedArgs: unknown;
  const client: McpClientAdapter = {
    listTools: () =>
      Promise.resolve([{
        name: "read_doc",
        description: "Read a workspace document.",
        inputSchema: { type: "object" },
      }]),
    invokeTool: (_name, args) => {
      invokedArgs = args;
      return Promise.resolve({ ok: true, args });
    },
  };
  const options = {
    client,
    boundary: createBoundary(),
    createId: fixedIds("adapter-1", "adapter-2"),
    now: fixedNow(1000),
  };

  const listed = await listMcpGatewayTools(options);
  const discovery = await discoverMcpGatewayTools(options);
  const invoked = await executeMcpGatewayCall(options, {
    name: "read_doc",
    args: { filePath: "./docs/brief.md", options: { cwd: "." } },
  });

  assertEquals(listed.map((tool) => tool.name), ["read_doc"]);
  assertEquals(discovery.ok, true);
  assertEquals(invoked.ok, true);
  assertEquals(invoked.sanitizedArgs, {
    filePath: "docs/brief.md",
    options: { cwd: "." },
  });
  assertEquals(invokedArgs, invoked.sanitizedArgs);
});

Deno.test("MCP gateway returns boundary results for external paths and captures invoke errors", async () => {
  let invokeCount = 0;
  const boundaryClient: McpClientAdapter = {
    listTools: () => Promise.resolve([]),
    invokeTool: () => {
      invokeCount++;
      return Promise.resolve({ ok: true });
    },
  };
  const boundaryResult = await executeMcpGatewayCall({
    client: boundaryClient,
    boundary: createBoundary(),
    createId: fixedIds("adapter-1"),
    now: fixedNow(1000),
  }, {
    name: "read_doc",
    args: { path: "../secret.md" },
  });

  const failed = await executeMcpGatewayCall({
    client: {
      listTools: () => Promise.resolve([]),
      invokeTool: () => Promise.reject(new Error("MCP unavailable")),
    },
    createId: fixedIds("adapter-2"),
    now: fixedNow(1001),
  }, {
    name: "read_doc",
    args: { path: "docs/brief.md" },
  });

  assertEquals(boundaryResult.ok, false);
  assertEquals(boundaryResult.adapterRecord.state, "boundary_required");
  assertEquals(boundaryResult.boundaryRequest?.state, "pending");
  assertEquals(invokeCount, 0);
  assertEquals(failed.ok, false);
  assertEquals(failed.error?.code, "mcp_gateway_adapter_error");
  assertEquals(failed.adapterRecord.state, "failed");
});

function createBoundary(): WorkspaceBoundaryKernel {
  return new WorkspaceBoundaryKernel({
    createId: fixedIds("action-1", "request-1"),
    now: fixedNow(1000),
    resolver: {
      resolvePath(path: string): WorkspacePathResolution {
        if (path.startsWith("../") || path.startsWith("/")) {
          return {
            inputPath: path,
            absolutePath: path.startsWith("/") ? path : `/workspace/${path}`,
            insideWorkspace: false,
            escapedSymlink: false,
          };
        }
        return {
          inputPath: path,
          absolutePath: `/workspace/${normalizeRelative(path)}`,
          insideWorkspace: true,
          relativePath: normalizeRelative(path),
          workspaceId: "workspace-1",
        };
      },
    },
  });
}

function normalizeRelative(path: string): string {
  if (path === ".") return ".";
  return path.replace(/^\.\//, "");
}

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}
