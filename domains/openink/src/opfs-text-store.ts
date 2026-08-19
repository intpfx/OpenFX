import type { TextStore } from "./drawing-library.ts";
import type { BinaryStore } from "./drawing-assets.ts";

const ROOT_DIRECTORY = "openink-documents";

function pathParts(path: string): readonly string[] {
  const parts = path.split("/");
  if (
    parts.length === 0 ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("OpenInk 存储路径无效");
  }
  return parts;
}

async function resolveParent(
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<Readonly<{ directory: FileSystemDirectoryHandle; fileName: string }>> {
  const parts = pathParts(path);
  let directory = root;
  for (const part of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(part, { create });
  }
  return { directory, fileName: parts.at(-1) as string };
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

export function createOpfsTextStore(): TextStore & BinaryStore {
  let rootPromise: Promise<FileSystemDirectoryHandle> | null = null;
  function root(): Promise<FileSystemDirectoryHandle> {
    if (!navigator.storage?.getDirectory) {
      return Promise.reject(new Error("此浏览器不支持 OPFS 本机画稿存储"));
    }
    rootPromise ??= navigator.storage.getDirectory().then((bucket) =>
      bucket.getDirectoryHandle(ROOT_DIRECTORY, { create: true })
    );
    return rootPromise;
  }

  return {
    async readText(path) {
      try {
        const parent = await resolveParent(await root(), path, false);
        const handle = await parent.directory.getFileHandle(parent.fileName);
        return await (await handle.getFile()).text();
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async writeText(path, contents) {
      const parent = await resolveParent(await root(), path, true);
      const handle = await parent.directory.getFileHandle(parent.fileName, {
        create: true,
      });
      const writable = await handle.createWritable();
      try {
        await writable.write(contents);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
      }
    },
    async readBytes(path) {
      try {
        const parent = await resolveParent(await root(), path, false);
        const handle = await parent.directory.getFileHandle(parent.fileName);
        return new Uint8Array(await (await handle.getFile()).arrayBuffer());
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async writeBytes(path, contents) {
      const parent = await resolveParent(await root(), path, true);
      const handle = await parent.directory.getFileHandle(parent.fileName, {
        create: true,
      });
      const writable = await handle.createWritable();
      try {
        await writable.write(contents.slice().buffer);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
      }
    },
  };
}
