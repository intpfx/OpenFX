import { assertEquals } from "jsr:@std/assert";

import {
  WorkspaceBoundaryKernel,
  type WorkspacePathResolution,
} from "../../src/mod.ts";

Deno.test("WorkspaceBoundaryKernel classifies inside and outside paths via injected resolver", async () => {
  const boundary = createBoundary();

  const inside = await boundary.classifyPath("./src/index.ts");
  assertEquals(inside, {
    kind: "inside_workspace",
    inputPath: "./src/index.ts",
    absolutePath: "/workspace/src/index.ts",
    relativePath: "src/index.ts",
    workspaceId: "workspace-1",
  });

  const outside = await boundary.classifyPath("../secret.txt", {
    reason: "Need explicit import.",
  });
  assertEquals(outside.kind, "outside_workspace");
  if (outside.kind === "outside_workspace") {
    assertEquals(outside.escapedSymlink, false);
    assertEquals(outside.proposedAction.state, "ready");
    assertEquals(outside.boundaryRequest.state, "pending");
    assertEquals(outside.boundaryRequest.reason, "Need explicit import.");
  }
});

Deno.test("WorkspaceBoundaryKernel treats symlink escapes and external imports as boundary requests", async () => {
  const boundary = createBoundary();

  const escape = await boundary.classifyPath("linked/outside.md");
  assertEquals(escape.kind, "outside_workspace");
  if (escape.kind === "outside_workspace") {
    assertEquals(escape.escapedSymlink, true);
    assertEquals(escape.absolutePath, "/outside-via-symlink/linked/outside.md");
  }

  const externalImport = await boundary.createExternalImportDecision(
    "/tmp/source.md",
    "workspace://imports/source.md",
  );
  assertEquals(externalImport.kind, "external_import_required");
  if (externalImport.kind === "external_import_required") {
    assertEquals(externalImport.importTargetUri, "workspace://imports/source.md");
    assertEquals(externalImport.boundaryRequest.state, "pending");
  }
});

function createBoundary(): WorkspaceBoundaryKernel {
  return new WorkspaceBoundaryKernel({
    createId: fixedIds("action-1", "request-1", "action-2", "request-2"),
    now: fixedNow(1000),
    resolver: {
      resolvePath(path: string): WorkspacePathResolution {
        if (path.includes("linked/")) {
          return {
            inputPath: path,
            absolutePath: `/outside-via-symlink/${path}`,
            insideWorkspace: true,
            relativePath: normalizeRelative(path),
            escapedSymlink: true,
            workspaceId: "workspace-1",
          };
        }
        if (path.startsWith("/") || path.startsWith("../")) {
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
  return path.replace(/^\.\//, "");
}

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}
