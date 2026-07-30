import { assert, assertEquals } from "@std/assert";
import { cpSync } from "node:fs";
import { dirname } from "node:path";

import {
  createFileThumbnailResolver,
  createManagedFileLibrary,
  scanManagedFileLibrary,
} from "../src/native/file-library.ts";

Deno.test("managed file library starts empty and never browses the source directory", () => {
  const root = Deno.makeTempDirSync({ prefix: "openfx-managed-library-" });
  const source = `${root}/source`;
  const libraryDirectory = `${root}/library`;
  try {
    Deno.mkdirSync(source);
    Deno.writeTextFileSync(`${source}/outside.txt`, "outside");

    const library = createManagedFileLibrary({ libraryDirectory });

    assertEquals(library.snapshot().libraryDirectory, libraryDirectory);
    assertEquals(library.snapshot().items, []);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("managed file library copies imported files into application-owned storage", async () => {
  const root = Deno.makeTempDirSync({ prefix: "openfx-managed-import-" });
  const source = `${root}/outside.txt`;
  const libraryDirectory = `${root}/library`;
  Deno.writeTextFileSync(source, "owned copy");
  const copies: Array<[string, string]> = [];
  const library = createManagedFileLibrary({
    libraryDirectory,
    copyPath(from, to) {
      copies.push([from, to]);
      Deno.copyFileSync(from, to);
      return Promise.resolve(true);
    },
  });

  try {
    const snapshot = await library.importPath(source);
    const imported = snapshot.items[0]!;

    assertEquals(imported.name, "outside.txt");
    assertEquals(imported.path, `${libraryDirectory}/outside.txt`);
    assertEquals(Deno.readTextFileSync(imported.path), "owned copy");
    assertEquals(copies.length, 1);
    assertEquals(copies[0]![0], source);
    assert(copies[0]![1].startsWith(`${libraryDirectory}/.openfx-import-`));

    Deno.removeSync(source);
    assertEquals(library.refresh().items.map((item) => item.name), ["outside.txt"]);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("managed file library preserves duplicate imports with unique names", async () => {
  const root = Deno.makeTempDirSync({ prefix: "openfx-managed-duplicate-" });
  const firstSource = `${root}/first/report.pdf`;
  const secondSource = `${root}/second/report.pdf`;
  const libraryDirectory = `${root}/library`;
  Deno.mkdirSync(`${root}/first`);
  Deno.mkdirSync(`${root}/second`);
  Deno.writeTextFileSync(firstSource, "first");
  Deno.writeTextFileSync(secondSource, "second");
  const library = createManagedFileLibrary({
    libraryDirectory,
    copyPath(from, to) {
      Deno.copyFileSync(from, to);
      return Promise.resolve(true);
    },
  });

  try {
    await library.importPath(firstSource);
    const snapshot = await library.importPath(secondSource);

    assertEquals(
      snapshot.items.map((item) => item.name).sort(),
      ["report (2).pdf", "report.pdf"],
    );
    assertEquals(Deno.readTextFileSync(`${libraryDirectory}/report.pdf`), "first");
    assertEquals(
      Deno.readTextFileSync(`${libraryDirectory}/report (2).pdf`),
      "second",
    );
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("managed file library includes every imported file type and app bundles", async () => {
  const root = Deno.makeTempDirSync({ prefix: "openfx-managed-types-" });
  const libraryDirectory = `${root}/library`;
  const sourceDirectory = `${root}/source`;
  Deno.mkdirSync(sourceDirectory);
  Deno.mkdirSync(`${sourceDirectory}/Demo.app`);
  Deno.writeTextFileSync(`${sourceDirectory}/Demo.app/Info.plist`, "app");
  for (
    const name of [
      "photo.png",
      "movie.mov",
      "notes.txt",
      "archive.zip",
      "source.ts",
      "mystery.custom",
    ]
  ) {
    Deno.writeTextFileSync(`${sourceDirectory}/${name}`, name);
  }
  const library = createManagedFileLibrary({
    libraryDirectory,
    copyPath(from, to) {
      cpSync(from, to, { recursive: true });
      return Promise.resolve(true);
    },
  });

  try {
    for (const entry of Deno.readDirSync(sourceDirectory)) {
      await library.importPath(`${sourceDirectory}/${entry.name}`);
    }
    const snapshot = scanManagedFileLibrary(libraryDirectory);
    assertEquals(
      snapshot.items
        .map((item) => [item.name, item.kind])
        .sort((left, right) => left[0]!.localeCompare(right[0]!)),
      [
        ["archive.zip", "archive"],
        ["Demo.app", "package"],
        ["movie.mov", "video"],
        ["mystery.custom", "other"],
        ["notes.txt", "document"],
        ["photo.png", "image"],
        ["source.ts", "code"],
      ],
    );
    assert(snapshot.items.every((item) => item.managed));
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("managed file library opens and reveals only its managed copies", async () => {
  const root = Deno.makeTempDirSync({ prefix: "openfx-managed-open-" });
  const libraryDirectory = `${root}/library`;
  const source = `${root}/outside.txt`;
  Deno.writeTextFileSync(source, "outside");
  const opened: string[] = [];
  const revealed: string[] = [];
  const library = createManagedFileLibrary({
    libraryDirectory,
    copyPath(from, to) {
      Deno.copyFileSync(from, to);
      return Promise.resolve(true);
    },
    openPath(path) {
      opened.push(path);
      return Promise.resolve(true);
    },
    revealPath(path) {
      revealed.push(path);
      return Promise.resolve(true);
    },
  });

  try {
    const item = (await library.importPath(source)).items[0]!;
    await library.open(item);
    await library.reveal(item);

    assertEquals(opened, [`${libraryDirectory}/outside.txt`]);
    assertEquals(revealed, [`${libraryDirectory}/outside.txt`]);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("managed file library can open its own root from the cover wall", async () => {
  const root = Deno.makeTempDirSync({ prefix: "openfx-managed-root-" });
  const libraryDirectory = `${root}/library`;
  const opened: string[] = [];
  const library = createManagedFileLibrary({
    libraryDirectory,
    openPath(path) {
      opened.push(path);
      return Promise.resolve(true);
    },
  });

  try {
    await library.openLibraryDirectory();
    assertEquals(opened, [libraryDirectory]);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("file library crops direct images and Quick Look previews to the requested cover size", async () => {
  const root = Deno.makeTempDirSync({ prefix: "openfx-thumbnail-" });
  const cache = `${root}/cache`;
  const libraryDirectory = `${root}/library`;
  Deno.mkdirSync(libraryDirectory);
  const image = `${libraryDirectory}/photo.png`;
  const document = `${libraryDirectory}/notes.txt`;
  const unknown = `${libraryDirectory}/mystery.custom`;
  Deno.writeTextFileSync(image, "image");
  Deno.writeTextFileSync(document, "document");
  Deno.writeTextFileSync(unknown, "unknown");

  const snapshot = scanManagedFileLibrary(libraryDirectory);
  const calls: string[] = [];
  const crops: Array<[string, string, number, number]> = [];
  const resolver = createFileThumbnailResolver({
    cacheDirectory: cache,
    runQuickLook(sourcePath, outputDirectory) {
      calls.push(sourcePath);
      if (sourcePath === unknown) return Promise.resolve(false);
      Deno.mkdirSync(outputDirectory, { recursive: true });
      Deno.writeTextFileSync(`${outputDirectory}/preview.png`, "thumbnail");
      return Promise.resolve(true);
    },
    runImageCrop(sourcePath, destinationPath, width, height) {
      crops.push([sourcePath, destinationPath, width, height]);
      Deno.mkdirSync(dirname(destinationPath), { recursive: true });
      Deno.writeTextFileSync(destinationPath, "cropped");
      return Promise.resolve(true);
    },
  });

  try {
    const imageItem = snapshot.items.find((item) => item.path === image)!;
    const documentItem = snapshot.items.find((item) => item.path === document)!;
    const unknownItem = snapshot.items.find((item) => item.path === unknown)!;

    const imageThumbnail = await resolver.resolve(imageItem, 320, 180);
    assert(imageThumbnail !== null);
    assert(imageThumbnail.startsWith(`${cache}/`));
    assert(imageThumbnail.endsWith("/cover.png"));
    const documentThumbnail = await resolver.resolve(documentItem, 320, 180);
    assert(documentThumbnail !== null);
    assert(documentThumbnail.startsWith(`${cache}/`));
    assert(documentThumbnail.endsWith("/cover.png"));
    assertEquals(
      await resolver.resolve(documentItem, 320, 180),
      documentThumbnail,
    );
    assertEquals(await resolver.resolve(unknownItem, 320, 180), null);
    assertEquals(await resolver.resolve(unknownItem, 320, 180), null);
    assertEquals(calls, [document, unknown]);
    assertEquals(crops.length, 2);
    assertEquals(crops[0]![0], image);
    assert(crops[1]![0].endsWith("/source/preview.png"));
    assertEquals(
      crops.map(([_source, _destination, width, height]) => [width, height]),
      [[320, 180], [320, 180]],
    );
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("file library bounds concurrent Quick Look work", async () => {
  const root = Deno.makeTempDirSync({ prefix: "openfx-thumbnail-queue-" });
  const cache = `${root}/cache`;
  const libraryDirectory = `${root}/library`;
  Deno.mkdirSync(libraryDirectory);
  for (let index = 0; index < 5; index += 1) {
    Deno.writeTextFileSync(`${libraryDirectory}/document-${index}.txt`, `${index}`);
  }
  let active = 0;
  let peak = 0;
  const releases: Array<() => void> = [];
  const resolver = createFileThumbnailResolver({
    cacheDirectory: cache,
    async runQuickLook(_sourcePath, outputDirectory) {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      Deno.mkdirSync(outputDirectory, { recursive: true });
      Deno.writeTextFileSync(`${outputDirectory}/preview.png`, "thumbnail");
      active -= 1;
      return true;
    },
    runImageCrop(_sourcePath, destinationPath) {
      Deno.mkdirSync(dirname(destinationPath), { recursive: true });
      Deno.writeTextFileSync(destinationPath, "cropped");
      return Promise.resolve(true);
    },
  });

  try {
    const pending = scanManagedFileLibrary(libraryDirectory).items.map((item) =>
      resolver.resolve(item, 320, 180)
    );
    await Promise.resolve();
    assertEquals(active, 2);
    while (releases.length > 0) {
      releases.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    }
    await Promise.all(pending);
    assertEquals(peak, 2);
    assertEquals(pending.length, 5);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});
