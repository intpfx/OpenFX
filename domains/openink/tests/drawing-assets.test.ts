import { expect } from "@std/expect";

import {
  type BinaryStore,
  loadInkMaskAsset,
  loadInkSdfAsset,
  loadPhotoSource,
  storeInkDerivatives,
  storePhotoSource,
} from "../src/drawing-assets.ts";
import { createInkSdf } from "../src/ink-sdf.ts";

function createMemoryBinaryStore(): BinaryStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    readBytes(path) {
      const bytes = files.get(path);
      return Promise.resolve(bytes ? bytes.slice() : null);
    },
    writeBytes(path, contents) {
      files.set(path, contents.slice());
      return Promise.resolve();
    },
  };
}

Deno.test("an imported photo keeps immutable original bytes under one content address", async () => {
  const store = createMemoryBinaryStore();
  const original = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

  const first = await storePhotoSource(store, {
    bytes: original,
    mimeType: "image/png",
    width: 1600,
    height: 1200,
  });
  const second = await storePhotoSource(store, {
    bytes: original,
    mimeType: "image/png",
    width: 1600,
    height: 1200,
  });

  expect(second).toEqual(first);
  expect(first.assetId).toMatch(/^[a-f0-9]{64}$/);
  expect(first.byteLength).toBe(original.byteLength);
  expect(store.files.size).toBe(1);
  expect(await loadPhotoSource(store, first.assetId)).toEqual(original);
});

Deno.test("derived mask and SDF assets round-trip independently from the document", async () => {
  const store = createMemoryBinaryStore();
  const mask = {
    width: 3,
    height: 2,
    coverage: new Uint8Array([0, 255, 0, 255, 255, 0]),
  };
  const sdf = createInkSdf(mask);

  const references = await storeInkDerivatives(store, { mask, sdf });

  expect(references.maskAssetId).toMatch(/^[a-f0-9]{64}$/);
  expect(references.sdfAssetId).toMatch(/^[a-f0-9]{64}$/);
  expect(await loadInkMaskAsset(store, references.maskAssetId)).toEqual(mask);
  expect(await loadInkSdfAsset(store, references.sdfAssetId)).toEqual(sdf);
});
