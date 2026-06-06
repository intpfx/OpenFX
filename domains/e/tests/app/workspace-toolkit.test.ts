import { assertEquals } from "jsr:@std/assert";

import {
  ArtifactKernel,
  executeWorkspaceToolCall,
  InMemoryKvStore,
  WorkspaceBoundaryKernel,
  type WorkspacePathResolution,
  type WorkspaceToolAdapter,
} from "../../src/mod.ts";

Deno.test("workspace toolkit delegates safe read, write, and list operations", async () => {
  const calls: string[] = [];
  const adapter: WorkspaceToolAdapter = {
    readText(path) {
      calls.push(`read:${path}`);
      return Promise.resolve(`content:${path}`);
    },
    writeText(path, content) {
      calls.push(`write:${path}:${content}`);
      return Promise.resolve({ path, bytesWritten: content.length });
    },
    list(path) {
      calls.push(`list:${path}`);
      return Promise.resolve([{ name: "file.ts", isDir: false }]);
    },
    runCommand() {
      throw new Error("not used");
    },
  };
  const options = {
    adapter,
    boundary: createBoundary(),
    createId: fixedIds("adapter-1", "adapter-2", "adapter-3"),
    now: fixedNow(1000),
  };

  const read = await executeWorkspaceToolCall(options, {
    operation: "read_file",
    path: "./src/mod.ts",
  });
  const write = await executeWorkspaceToolCall(options, {
    operation: "write_file",
    path: "src/out.ts",
    content: "ok",
  });
  const list = await executeWorkspaceToolCall(options, {
    operation: "list_dir",
    path: ".",
  });

  assertEquals(read.content, "content:src/mod.ts");
  assertEquals(write.content, { path: "src/out.ts", bytesWritten: 2 });
  assertEquals(list.content, [{ name: "file.ts", isDir: false }]);
  assertEquals(calls, ["read:src/mod.ts", "write:src/out.ts:ok", "list:."]);
});

Deno.test("workspace toolkit turns external writes into boundary requests", async () => {
  const adapter: WorkspaceToolAdapter = {
    readText: () => Promise.resolve("not used"),
    writeText: () => Promise.reject(new Error("write should not run")),
    list: () => Promise.resolve([]),
    runCommand: () =>
      Promise.resolve({ exitCode: 0, stdout: "", stderr: "", durationMs: 1 }),
  };

  const result = await executeWorkspaceToolCall({
    adapter,
    boundary: createBoundary(),
    createId: fixedIds("adapter-1"),
    now: fixedNow(1000),
  }, {
    operation: "write_file",
    path: "../outside.txt",
    content: "nope",
  });

  assertEquals(result.ok, false);
  assertEquals(result.adapterRecord.state, "boundary_required");
  assertEquals(result.boundaryRequest?.state, "pending");
});

Deno.test("workspace toolkit records command artifacts and captures adapter errors", async () => {
  const store = new InMemoryKvStore();
  const artifacts = new ArtifactKernel({
    store,
    createId: fixedIds("artifact-1"),
    now: fixedNow(2000),
  });
  const adapter: WorkspaceToolAdapter = {
    readText: () => Promise.reject(new Error("read failed")),
    writeText: (path, content) =>
      Promise.resolve({ path, bytesWritten: content.length }),
    list: () => Promise.resolve([]),
    runCommand: (input) =>
      Promise.resolve({
        exitCode: 0,
        stdout: input.program,
        stderr: "",
        durationMs: 12,
      }),
  };

  const command = await executeWorkspaceToolCall({
    adapter,
    artifacts,
    boundary: createBoundary(),
    taskId: "task-1",
    turnId: "turn-1",
    createId: fixedIds("adapter-1"),
    now: fixedNow(1000),
  }, {
    operation: "run_command",
    command: { cwd: ".", program: "deno", args: ["test"] },
  });
  const failedRead = await executeWorkspaceToolCall({
    adapter,
    createId: fixedIds("adapter-2"),
    now: fixedNow(1001),
  }, {
    operation: "read_file",
    path: "missing.ts",
  });

  assertEquals(command.ok, true);
  assertEquals(command.artifact?.kind, "verification");
  assertEquals((await artifacts.list({ taskId: "task-1" })).map((item) => item.id), [
    "artifact-1",
  ]);
  assertEquals(failedRead.ok, false);
  assertEquals(failedRead.error?.code, "workspace_tool_adapter_error");
  assertEquals(failedRead.adapterRecord.state, "failed");
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
