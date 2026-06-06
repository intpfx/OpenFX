import { assertEquals } from "jsr:@std/assert";

import {
  executeGitTimelineOperation,
  type GitTimelineAdapter,
  WorkspaceBoundaryKernel,
  type WorkspacePathResolution,
} from "../../src/mod.ts";

Deno.test("Git timeline uses injected adapter for status, diff, checkpoint, and task branch", async () => {
  const calls: string[] = [];
  const adapter: GitTimelineAdapter = {
    status: (path) => {
      calls.push(`status:${path}`);
      return Promise.resolve({
        branch: "main",
        clean: false,
        files: [{ path: "a.ts", status: "modified" }],
      });
    },
    diffSummary: (path) => {
      calls.push(`diff:${path}`);
      return Promise.resolve({
        filesChanged: 1,
        insertions: 10,
        deletions: 2,
        summary: "1 file changed",
      });
    },
    createCheckpoint: (input) => {
      calls.push(`checkpoint:${input.path}:${input.label}`);
      return Promise.resolve({
        id: "checkpoint-1",
        label: input.label,
        taskId: input.taskId,
        createdAt: 1000,
      });
    },
    createTaskBranch: (input) => {
      calls.push(`branch:${input.path}:${input.taskId}:${input.slug}`);
      return Promise.resolve({
        branch: `codex/${input.slug}`,
        taskId: input.taskId,
        baseBranch: "main",
      });
    },
  };
  const options = {
    adapter,
    boundary: createBoundary(),
    createId: fixedIds("adapter-1", "adapter-2", "adapter-3", "adapter-4"),
    now: fixedNow(1000),
  };

  const status = await executeGitTimelineOperation(options, {
    kind: "status",
    path: ".",
  });
  const diff = await executeGitTimelineOperation(options, {
    kind: "diff",
    path: "./src",
  });
  const checkpoint = await executeGitTimelineOperation(options, {
    kind: "checkpoint",
    path: ".",
    taskId: "task-1",
    label: "before patch",
  });
  const branch = await executeGitTimelineOperation(options, {
    kind: "task_branch",
    path: ".",
    taskId: "task-1",
    slug: "task-graph",
  });

  assertEquals(status.ok, true);
  assertEquals(diff.ok, true);
  assertEquals(checkpoint.ok, true);
  assertEquals(branch.content, {
    branch: "codex/task-graph",
    taskId: "task-1",
    baseBranch: "main",
  });
  assertEquals(calls, [
    "status:.",
    "diff:src",
    "checkpoint:.:before patch",
    "branch:.:task-1:task-graph",
  ]);
});

Deno.test("Git timeline converts outside paths to boundary and captures adapter errors", async () => {
  let statusCalls = 0;
  const boundaryResult = await executeGitTimelineOperation({
    adapter: {
      status: () => {
        statusCalls++;
        return Promise.resolve({ branch: "main", clean: true, files: [] });
      },
      diffSummary: () =>
        Promise.resolve({
          filesChanged: 0,
          insertions: 0,
          deletions: 0,
          summary: "",
        }),
      createCheckpoint: () =>
        Promise.resolve({
          id: "checkpoint-1",
          label: "label",
          createdAt: 1000,
        }),
      createTaskBranch: () =>
        Promise.resolve({ branch: "codex/task", taskId: "task-1" }),
    },
    boundary: createBoundary(),
    createId: fixedIds("adapter-1"),
    now: fixedNow(1000),
  }, { kind: "status", path: "../other" });

  const failed = await executeGitTimelineOperation({
    adapter: {
      status: () => Promise.reject(new Error("git unavailable")),
      diffSummary: () =>
        Promise.resolve({
          filesChanged: 0,
          insertions: 0,
          deletions: 0,
          summary: "",
        }),
      createCheckpoint: () =>
        Promise.resolve({
          id: "checkpoint-1",
          label: "label",
          createdAt: 1000,
        }),
      createTaskBranch: () =>
        Promise.resolve({ branch: "codex/task", taskId: "task-1" }),
    },
    createId: fixedIds("adapter-2"),
    now: fixedNow(1001),
  }, { kind: "status", path: "." });

  assertEquals(boundaryResult.ok, false);
  assertEquals(boundaryResult.adapterRecord.state, "boundary_required");
  assertEquals(boundaryResult.boundaryRequest?.state, "pending");
  assertEquals(statusCalls, 0);
  assertEquals(failed.ok, false);
  assertEquals(failed.error?.code, "git_timeline_adapter_error");
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
