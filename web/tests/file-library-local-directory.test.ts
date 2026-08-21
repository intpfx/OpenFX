import { expect } from "@std/expect";

import {
  createLocalDirectorySource,
  type LocalDirectoryHandle,
  supportsLocalDirectorySource,
} from "../src/file-library/local-directory-source.ts";
import {
  resolveBloubControlState,
  resolveNebulaSearchState,
} from "../src/file-library/source-control-state.ts";

Deno.test("Bloub routes to directory switching only in a secure File System Access context", () => {
  expect(
    supportsLocalDirectorySource({
      isSecureContext: true,
      showDirectoryPicker: () => Promise.resolve({}),
    }),
  ).toBe(true);
  expect(
    supportsLocalDirectorySource({
      isSecureContext: false,
      showDirectoryPicker: () => Promise.resolve({}),
    }),
  ).toBe(false);
  expect(
    supportsLocalDirectorySource({
      isSecureContext: true,
      showDirectoryPicker: undefined,
    }),
  ).toBe(false);
});

function fileHandle(file: File): LocalDirectoryHandle {
  return {
    kind: "file",
    name: file.name,
    getFile: () => Promise.resolve(file),
  };
}

function directoryHandle(
  name: string,
  children: readonly LocalDirectoryHandle[],
): LocalDirectoryHandle {
  return {
    kind: "directory",
    name,
    queryPermission: () => Promise.resolve("granted"),
    requestPermission: () => Promise.resolve("granted"),
    async *values() {
      for (const child of children) yield child;
    },
  };
}

Deno.test("a selected directory becomes a recursive, stable, read-only grid source", async () => {
  const source = createLocalDirectorySource({
    runtime: {
      isSecureContext: true,
      showDirectoryPicker: () =>
        Promise.resolve(
          directoryHandle("Pictures", [
            fileHandle(
              new File(["cover"], "cover.jpg", {
                type: "image/jpeg",
                lastModified: 12,
              }),
            ),
            directoryHandle("Trips", [
              fileHandle(
                new File(["notes"], "notes.txt", {
                  type: "text/plain",
                  lastModified: 13,
                }),
              ),
            ]),
          ]),
        ),
    },
    store: {
      load: () => Promise.resolve(null),
      save: () => Promise.resolve(),
    },
  });

  expect(await source.connect()).toBe(true);
  expect(source.getSnapshot()).toMatchObject({
    supported: true,
    status: "ready",
    directoryName: "Pictures",
    entries: [
      {
        id: "cover.jpg",
        kind: "image",
        relativePath: "cover.jpg",
        importState: "available",
      },
      {
        id: "Trips/notes.txt",
        kind: "text",
        relativePath: "Trips/notes.txt",
        importState: "available",
      },
    ],
  });
  expect((await source.getFile("Trips/notes.txt")).name).toBe("notes.txt");
});

Deno.test("semantic search and source states select stable Nebula and Bloub shapes", () => {
  expect(
    resolveBloubControlState({
      busy: false,
      sourceMode: "opfs",
      localDirectoryStatus: "unsupported",
    }),
  ).toEqual({ action: "import", glyph: "idle", label: "导入照片或文件" });
  expect(
    resolveBloubControlState({
      busy: false,
      sourceMode: "opfs",
      localDirectoryStatus: "scanning",
    }),
  ).toEqual({ action: "wait", glyph: "thinking", label: "正在读取本地文件夹" });
  expect(
    resolveBloubControlState({
      busy: false,
      sourceMode: "directory",
      localDirectoryStatus: "ready",
    }),
  ).toEqual({ action: "show-opfs", glyph: "orbit", label: "切换到 OPFS" });
  expect(
    resolveBloubControlState({
      busy: false,
      sourceMode: "opfs",
      localDirectoryStatus: "error",
    }),
  ).toEqual({ action: "connect", glyph: "alert", label: "重新连接本地文件夹" });

  expect(resolveNebulaSearchState({ focused: false, query: "", resultCount: 8 }))
    .toBe("breathing");
  expect(resolveNebulaSearchState({ focused: true, query: "", resultCount: 8 }))
    .toBe("listening");
  expect(resolveNebulaSearchState({ focused: true, query: "cat", resultCount: 2 }))
    .toBe("sweep");
  expect(resolveNebulaSearchState({ focused: true, query: "cat", resultCount: 0 }))
    .toBe("shake");
});
