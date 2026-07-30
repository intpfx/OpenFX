import { execFile } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

export type FileLibraryKind =
  | "package"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "archive"
  | "code"
  | "other";

export interface FileLibraryItem {
  name: string;
  path: string;
  extension: string;
  kind: FileLibraryKind;
  managed: true;
  sizeBytes: number;
  modifiedAtMs: number;
}

export interface FileLibrarySnapshot {
  libraryDirectory: string;
  items: FileLibraryItem[];
}

export type QuickLookRunner = (
  sourcePath: string,
  outputDirectory: string,
) => Promise<boolean>;

export type ImageCropRunner = (
  sourcePath: string,
  destinationPath: string,
  width: number,
  height: number,
) => Promise<boolean>;

export interface FileThumbnailResolver {
  resolve(
    item: FileLibraryItem,
    pixelWidth: number,
    pixelHeight: number,
  ): Promise<string | null>;
}

export interface FileThumbnailResolverOptions {
  cacheDirectory: string;
  runQuickLook?: QuickLookRunner;
  runImageCrop?: ImageCropRunner;
  maxConcurrentQuickLook?: number;
  maxConcurrentImageCrop?: number;
}

export type FileOpenRunner = (path: string) => Promise<boolean>;
export type FileCopyRunner = (
  sourcePath: string,
  destinationPath: string,
) => Promise<boolean>;

export interface ManagedFileLibrary {
  snapshot(): FileLibrarySnapshot;
  refresh(): FileLibrarySnapshot;
  importPath(sourcePath: string): Promise<FileLibrarySnapshot>;
  open(item: FileLibraryItem): Promise<void>;
  reveal(item: FileLibraryItem): Promise<void>;
  openLibraryDirectory(): Promise<void>;
}

export interface ManagedFileLibraryOptions {
  libraryDirectory: string;
  copyPath?: FileCopyRunner;
  openPath?: FileOpenRunner;
  revealPath?: FileOpenRunner;
}

const EXTENSION_KINDS: Readonly<Record<string, FileLibraryKind>> = {
  ".7z": "archive",
  ".aac": "audio",
  ".ai": "document",
  ".avi": "video",
  ".avif": "image",
  ".bmp": "image",
  ".bz2": "archive",
  ".c": "code",
  ".cpp": "code",
  ".css": "code",
  ".csv": "document",
  ".doc": "document",
  ".docx": "document",
  ".flac": "audio",
  ".gif": "image",
  ".gz": "archive",
  ".heic": "image",
  ".heif": "image",
  ".html": "code",
  ".jpeg": "image",
  ".jpg": "image",
  ".js": "code",
  ".json": "code",
  ".livp": "image",
  ".m4a": "audio",
  ".md": "document",
  ".mkv": "video",
  ".mov": "video",
  ".mp3": "audio",
  ".mp4": "video",
  ".numbers": "document",
  ".pages": "document",
  ".pdf": "document",
  ".png": "image",
  ".ppt": "document",
  ".pptx": "document",
  ".psd": "image",
  ".rar": "archive",
  ".rtf": "document",
  ".svg": "image",
  ".swift": "code",
  ".tar": "archive",
  ".tif": "image",
  ".tiff": "image",
  ".toml": "code",
  ".ts": "code",
  ".tsx": "code",
  ".txt": "document",
  ".wav": "audio",
  ".webm": "video",
  ".webp": "image",
  ".xls": "document",
  ".xlsx": "document",
  ".xml": "code",
  ".yaml": "code",
  ".yml": "code",
  ".zip": "archive",
};

const PACKAGE_EXTENSIONS = new Set([
  ".app",
  ".bundle",
  ".framework",
  ".kext",
  ".pkg",
  ".plugin",
]);

let importSequence = 0;

export function scanManagedFileLibrary(
  libraryDirectory: string,
): FileLibrarySnapshot {
  const absoluteDirectory = resolve(libraryDirectory);
  mkdirSync(absoluteDirectory, { recursive: true });
  const items = readdirSync(absoluteDirectory, { withFileTypes: true })
    .filter((entry) => {
      if (entry.name.startsWith(".")) return false;
      if (!entry.isDirectory()) return true;
      return PACKAGE_EXTENSIONS.has(extname(entry.name).toLowerCase());
    })
    .map((entry): FileLibraryItem => {
      const path = join(absoluteDirectory, entry.name);
      const extension = extname(entry.name).toLowerCase();
      const stats = lstatSync(path);
      const packageDirectory = entry.isDirectory() &&
        PACKAGE_EXTENSIONS.has(extension);
      return {
        name: entry.name,
        path,
        extension,
        kind: packageDirectory ? "package" : EXTENSION_KINDS[extension] ?? "other",
        managed: true,
        sizeBytes: stats.size,
        modifiedAtMs: stats.mtimeMs,
      };
    })
    .sort(compareLibraryItems);

  return { libraryDirectory: absoluteDirectory, items };
}

export function createManagedFileLibrary(
  options: ManagedFileLibraryOptions,
): ManagedFileLibrary {
  const libraryDirectory = resolve(options.libraryDirectory);
  const copyPath = options.copyPath ?? copyPathWithSystem;
  const openPath = options.openPath ?? openPathWithSystem;
  const revealPath = options.revealPath ?? revealPathWithSystem;
  let current = scanManagedFileLibrary(libraryDirectory);

  const refresh = (): FileLibrarySnapshot => {
    current = scanManagedFileLibrary(libraryDirectory);
    return current;
  };

  return {
    snapshot: () => current,
    refresh,
    async importPath(sourcePath) {
      const source = resolve(sourcePath);
      const sourceName = basename(source);
      if (!sourceName || sourceName.startsWith(".")) {
        throw new Error("file_import_invalid_name");
      }
      const sourceStats = lstatSync(source);
      const sourceExtension = extname(sourceName).toLowerCase();
      if (
        sourceStats.isDirectory() &&
        !PACKAGE_EXTENSIONS.has(sourceExtension)
      ) {
        throw new Error("file_import_directory_not_supported");
      }
      if (dirname(source) === libraryDirectory) return refresh();

      mkdirSync(libraryDirectory, { recursive: true });
      const destination = uniqueDestinationPath(libraryDirectory, sourceName);
      importSequence += 1;
      const temporary = join(
        libraryDirectory,
        `.openfx-import-${process.pid}-${Date.now()}-${importSequence}-${sourceName}`,
      );
      try {
        if (!(await copyPath(source, temporary))) {
          throw new Error("file_import_copy_failed");
        }
        renameSync(temporary, destination);
      } catch (error) {
        rmSync(temporary, { force: true, recursive: true });
        throw error;
      }
      return refresh();
    },
    async open(item) {
      assertManagedItem(libraryDirectory, item);
      if (!(await openPath(item.path))) throw new Error("file_open_failed");
    },
    async reveal(item) {
      assertManagedItem(libraryDirectory, item);
      if (!(await revealPath(item.path))) throw new Error("file_reveal_failed");
    },
    async openLibraryDirectory() {
      if (!(await openPath(libraryDirectory))) {
        throw new Error("file_library_open_failed");
      }
    },
  };
}

export function createFileThumbnailResolver(
  options: FileThumbnailResolverOptions,
): FileThumbnailResolver {
  const cacheDirectory = resolve(options.cacheDirectory);
  const runQuickLook = createBoundedQuickLookRunner(
    options.runQuickLook ?? runSystemQuickLook,
    options.maxConcurrentQuickLook ?? 2,
  );
  const runImageCrop = createBoundedImageCropRunner(
    options.runImageCrop ?? runSystemImageCrop,
    options.maxConcurrentImageCrop ?? 2,
  );
  const resolutions = new Map<string, Promise<string | null>>();

  return {
    resolve(item, requestedPixelWidth, requestedPixelHeight) {
      const pixelWidth = safeThumbnailDimension(requestedPixelWidth);
      const pixelHeight = safeThumbnailDimension(requestedPixelHeight);
      const itemCacheKey = thumbnailCacheKey(item);
      const resolutionKey = `${itemCacheKey}-${pixelWidth}x${pixelHeight}`;
      const existing = resolutions.get(resolutionKey);
      if (existing) return existing;

      const resolution = resolveCoverThumbnail(
        item,
        join(cacheDirectory, itemCacheKey),
        pixelWidth,
        pixelHeight,
        runQuickLook,
        runImageCrop,
      );
      resolutions.set(resolutionKey, resolution);
      return resolution;
    },
  };
}

function createBoundedQuickLookRunner(
  runner: QuickLookRunner,
  requestedLimit: number,
): QuickLookRunner {
  const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, requestedLimit) : 2;
  let active = 0;
  const queue: Array<{
    sourcePath: string;
    outputDirectory: string;
    resolve(result: boolean): void;
  }> = [];

  const drain = (): void => {
    while (active < limit && queue.length > 0) {
      const task = queue.shift()!;
      active += 1;
      void runner(task.sourcePath, task.outputDirectory)
        .then((result) => task.resolve(result))
        .catch(() => task.resolve(false))
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  };

  return (sourcePath, outputDirectory) =>
    new Promise((resolveRun) => {
      queue.push({ sourcePath, outputDirectory, resolve: resolveRun });
      drain();
    });
}

function createBoundedImageCropRunner(
  runner: ImageCropRunner,
  requestedLimit: number,
): ImageCropRunner {
  const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, requestedLimit) : 2;
  let active = 0;
  const queue: Array<{
    sourcePath: string;
    destinationPath: string;
    width: number;
    height: number;
    resolve(result: boolean): void;
  }> = [];

  const drain = (): void => {
    while (active < limit && queue.length > 0) {
      const task = queue.shift()!;
      active += 1;
      void runner(
        task.sourcePath,
        task.destinationPath,
        task.width,
        task.height,
      )
        .then((result) => task.resolve(result))
        .catch(() => task.resolve(false))
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  };

  return (sourcePath, destinationPath, width, height) =>
    new Promise((resolveRun) => {
      queue.push({
        sourcePath,
        destinationPath,
        width,
        height,
        resolve: resolveRun,
      });
      drain();
    });
}

async function resolveCoverThumbnail(
  item: FileLibraryItem,
  itemCacheDirectory: string,
  pixelWidth: number,
  pixelHeight: number,
  runQuickLook: QuickLookRunner,
  runImageCrop: ImageCropRunner,
): Promise<string | null> {
  const sourcePath = item.kind === "image"
    ? item.path
    : await resolveQuickLookThumbnail(
      item,
      join(itemCacheDirectory, "source"),
      runQuickLook,
    );
  if (!sourcePath) return null;

  const coverDirectory = join(
    itemCacheDirectory,
    `${pixelWidth}x${pixelHeight}`,
  );
  const destinationPath = join(coverDirectory, "cover.png");
  if (existsSync(destinationPath)) return destinationPath;

  mkdirSync(coverDirectory, { recursive: true });
  const temporaryPath = join(
    coverDirectory,
    `.cover-${process.pid}-${Date.now()}.png`,
  );
  try {
    if (
      await runImageCrop(
        sourcePath,
        temporaryPath,
        pixelWidth,
        pixelHeight,
      ) &&
      existsSync(temporaryPath)
    ) {
      renameSync(temporaryPath, destinationPath);
      return destinationPath;
    }
    return sourcePath;
  } catch {
    return sourcePath;
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

async function resolveQuickLookThumbnail(
  item: FileLibraryItem,
  outputDirectory: string,
  runQuickLook: QuickLookRunner,
): Promise<string | null> {
  try {
    mkdirSync(outputDirectory, { recursive: true });
    const cached = firstPng(outputDirectory);
    if (cached) return cached;
    if (!(await runQuickLook(item.path, outputDirectory))) return null;
    return firstPng(outputDirectory);
  } catch {
    return null;
  }
}

const firstPng = (directory: string): string | null => {
  const file = readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith(".png"))
    .sort((left, right) => left.localeCompare(right))[0];
  return file ? join(directory, file) : null;
};

const thumbnailCacheKey = (item: FileLibraryItem): string => {
  const input = `${item.path}\u0000${item.sizeBytes}\u0000${item.modifiedAtMs}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const safeThumbnailDimension = (requested: number): number =>
  Number.isFinite(requested) ? Math.max(1, Math.round(requested)) : 640;

const uniqueDestinationPath = (
  libraryDirectory: string,
  requestedName: string,
): string => {
  const extension = extname(requestedName);
  const stem = extension
    ? requestedName.slice(0, requestedName.length - extension.length)
    : requestedName;
  let candidate = join(libraryDirectory, requestedName);
  let suffix = 2;
  while (existsSync(candidate)) {
    candidate = join(libraryDirectory, `${stem} (${suffix})${extension}`);
    suffix += 1;
  }
  return candidate;
};

const assertManagedItem = (
  libraryDirectory: string,
  item: FileLibraryItem,
): void => {
  const itemPath = resolve(item.path);
  if (
    item.managed !== true ||
    dirname(itemPath) !== libraryDirectory ||
    !existsSync(itemPath)
  ) {
    throw new Error("file_not_managed");
  }
};

const copyPathWithSystem: FileCopyRunner = (
  sourcePath,
  destinationPath,
) =>
  new Promise((resolveCopy) => {
    execFile(
      "/bin/cp",
      ["-R", resolve(sourcePath), resolve(destinationPath)],
      { shell: false, timeout: 120_000 },
      (error) => resolveCopy(error === null),
    );
  });

const runSystemQuickLook: QuickLookRunner = (
  sourcePath,
  outputDirectory,
) =>
  new Promise((resolveQuickLook) => {
    execFile(
      "/usr/bin/qlmanage",
      ["-t", "-s", "640", "-o", outputDirectory, sourcePath],
      { shell: false, timeout: 20_000 },
      (error) => resolveQuickLook(error === null),
    );
  });

const runSystemImageCrop: ImageCropRunner = async (
  sourcePath,
  destinationPath,
  pixelWidth,
  pixelHeight,
) => {
  const dimensions = await readImageDimensions(sourcePath);
  if (!dimensions) return false;

  const scale = Math.max(
    pixelWidth / dimensions.width,
    pixelHeight / dimensions.height,
  );
  const resampledWidth = Math.max(
    pixelWidth,
    Math.ceil(dimensions.width * scale),
  );
  const resampledHeight = Math.max(
    pixelHeight,
    Math.ceil(dimensions.height * scale),
  );
  const resampledPath = `${destinationPath}.resampled.png`;
  try {
    if (
      !(await runSystemCommand("/usr/bin/sips", [
        "-s",
        "format",
        "png",
        "-z",
        String(resampledHeight),
        String(resampledWidth),
        sourcePath,
        "--out",
        resampledPath,
      ]))
    ) {
      return false;
    }
    return await runSystemCommand("/usr/bin/sips", [
      "-c",
      String(pixelHeight),
      String(pixelWidth),
      resampledPath,
      "--out",
      destinationPath,
    ]);
  } finally {
    rmSync(resampledPath, { force: true });
  }
};

const readImageDimensions = (
  sourcePath: string,
): Promise<{ width: number; height: number } | null> =>
  new Promise((resolveDimensions) => {
    execFile(
      "/usr/bin/sips",
      ["-g", "pixelWidth", "-g", "pixelHeight", sourcePath],
      { encoding: "utf8", shell: false, timeout: 20_000 },
      (error, stdout) => {
        if (error) {
          resolveDimensions(null);
          return;
        }
        const width = Number(/pixelWidth:\s*(\d+)/.exec(stdout)?.[1]);
        const height = Number(/pixelHeight:\s*(\d+)/.exec(stdout)?.[1]);
        resolveDimensions(
          width > 0 && height > 0 ? { width, height } : null,
        );
      },
    );
  });

const runSystemCommand = (
  command: string,
  args: string[],
): Promise<boolean> =>
  new Promise((resolveRun) => {
    execFile(
      command,
      args,
      { shell: false, timeout: 20_000 },
      (error) => resolveRun(error === null),
    );
  });

const openPathWithSystem: FileOpenRunner = (path) =>
  new Promise((resolveOpen) => {
    execFile(
      "/usr/bin/open",
      [resolve(path)],
      { shell: false, timeout: 20_000 },
      (error) => resolveOpen(error === null),
    );
  });

const revealPathWithSystem: FileOpenRunner = (path) =>
  new Promise((resolveReveal) => {
    execFile(
      "/usr/bin/open",
      ["-R", resolve(path)],
      { shell: false, timeout: 20_000 },
      (error) => resolveReveal(error === null),
    );
  });

const compareLibraryItems = (
  left: FileLibraryItem,
  right: FileLibraryItem,
): number =>
  left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
