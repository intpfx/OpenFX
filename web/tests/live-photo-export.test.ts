import { expect } from "@std/expect";

import {
  decodeLivpArchive,
  decodeStoredZipArchive,
} from "../../domains/_shared/livp-codec.ts";
import { createLivePhotoExport } from "../src/file-library/live-photo-export.ts";

Deno.test("Live Photo original-pair export preserves HEIC and MOV bytes in one ZIP", async () => {
  const still = new File([new Uint8Array([1, 2, 3])], "IMG_2026.HEIC", {
    type: "image/heic",
  });
  const jpeg = new File([new Uint8Array([4, 5])], "IMG_2026.jpg", {
    type: "image/jpeg",
  });
  const motion = new File([new Uint8Array([6, 7, 8, 9])], "IMG_2026.MOV", {
    type: "video/quicktime",
  });

  const exported = await createLivePhotoExport({
    name: "Tokyo Live.HEIC",
    createdAt: "2026-08-14T00:00:00.000Z",
    still,
    jpeg,
    motion,
  }, "original-pair");
  const entries = await decodeStoredZipArchive(
    new Uint8Array(await exported.arrayBuffer()),
  );

  expect(exported.name).toBe("Tokyo Live.original.zip");
  expect(entries.map((entry) => entry.name)).toEqual([
    "Tokyo Live.HEIC",
    "Tokyo Live.MOV",
  ]);
  expect(entries[0]?.content).toEqual(new Uint8Array([1, 2, 3]));
  expect(entries[1]?.content).toEqual(new Uint8Array([6, 7, 8, 9]));
});

Deno.test("Live Photo compatible-pair export replaces only the still with JPEG", async () => {
  const exported = await createLivePhotoExport({
    name: "IMG_2026.HEIC",
    createdAt: "2026-08-14T00:00:00.000Z",
    still: new File([new Uint8Array([1])], "IMG_2026.HEIC", {
      type: "image/heic",
    }),
    jpeg: new File([new Uint8Array([2, 3])], "IMG_2026.jpg", {
      type: "image/jpeg",
    }),
    motion: new File([new Uint8Array([4, 5, 6])], "IMG_2026.MOV", {
      type: "video/quicktime",
    }),
  }, "jpeg-pair");
  const entries = await decodeStoredZipArchive(
    new Uint8Array(await exported.arrayBuffer()),
  );

  expect(exported.name).toBe("IMG_2026.compatible.zip");
  expect(entries.map((entry) => entry.name)).toEqual([
    "IMG_2026.jpg",
    "IMG_2026.MOV",
  ]);
  expect(entries[0]?.content).toEqual(new Uint8Array([2, 3]));
  expect(entries[1]?.content).toEqual(new Uint8Array([4, 5, 6]));
});

Deno.test("Live Photo LIVP export keeps original formats in its canonical container", async () => {
  const exported = await createLivePhotoExport({
    name: "IMG_2026.HEIC",
    createdAt: "2026-08-14T00:00:00.000Z",
    still: new File([new Uint8Array([1, 2])], "IMG_2026.HEIC", {
      type: "image/heic",
    }),
    jpeg: new File([new Uint8Array([3])], "IMG_2026.jpg", {
      type: "image/jpeg",
    }),
    motion: new File([new Uint8Array([4, 5])], "IMG_2026.MOV", {
      type: "video/quicktime",
    }),
  }, "livp");
  const decoded = await decodeLivpArchive(
    new Uint8Array(await exported.arrayBuffer()),
  );

  expect(exported.name).toBe("IMG_2026.livp");
  expect(decoded.metadata).toMatchObject({
    imageFormat: "heic",
    videoFormat: "mov",
  });
  expect(decoded.image).toEqual(new Uint8Array([1, 2]));
  expect(decoded.video).toEqual(new Uint8Array([4, 5]));
});
