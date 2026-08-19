import { expect } from "@std/expect";

import {
  type BinaryStore,
  loadInkMaskAsset,
  storeInkDerivatives,
} from "../src/drawing-assets.ts";
import {
  commitImportedInkLayer,
  createDrawingDocument,
  type ImportedInkLayer,
} from "../src/drawing-document.ts";
import { createInkSdf } from "../src/ink-sdf.ts";
import { applyLassoSelection } from "../src/lasso-operation.ts";

function memoryStore(): BinaryStore {
  const files = new Map<string, Uint8Array>();
  return {
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

Deno.test("lasso splitting creates a selected ink fragment without duplicating the source photo", async () => {
  const store = memoryStore();
  const mask = {
    width: 5,
    height: 3,
    coverage: new Uint8Array([
      0,
      0,
      0,
      0,
      0,
      255,
      255,
      255,
      255,
      255,
      0,
      0,
      0,
      0,
      0,
    ]),
  };
  const assets = await storeInkDerivatives(store, { mask, sdf: createInkSdf(mask) });
  const layer: ImportedInkLayer = {
    id: "original-layer",
    source: {
      assetId: "a".repeat(64),
      mimeType: "image/jpeg",
      width: 500,
      height: 300,
      byteLength: 10_000,
    },
    ...assets,
    width: 5,
    height: 3,
    crop: {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 500, y: 0 },
      bottomRight: { x: 500, y: 300 },
      bottomLeft: { x: 0, y: 300 },
    },
    cleanup: {
      threshold: 0.34,
      denoise: 0.2,
      backgroundRemoval: 0.9,
      thickness: 0,
    },
    transform: { x: 0, y: 0, scale: 1 },
  };
  const base = commitImportedInkLayer(
    createDrawingDocument({
      id: "doc",
      now: "2026-08-19T00:00:00.000Z",
      width: 500,
      height: 300,
    }),
    layer,
    "2026-08-19T00:01:00.000Z",
  );

  const result = await applyLassoSelection(
    store,
    base,
    [
      { x: -1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 3 },
      { x: -1, y: 3 },
    ],
    { createLayerId: () => "selected-fragment", now: "2026-08-19T00:02:00.000Z" },
  );

  expect(result.selection.layerIds).toEqual(["selected-fragment"]);
  expect(result.document.importedInkLayers.map((item) => item.id)).toEqual([
    "original-layer",
    "selected-fragment",
  ]);
  expect(result.document.importedInkLayers[0].source).toBe(layer.source);
  expect(result.document.importedInkLayers[1].source).toBe(layer.source);
  expect([
    ...(await loadInkMaskAsset(
      store,
      result.document.importedInkLayers[0].maskAssetId,
    )).coverage,
  ]).toEqual([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    255,
    255,
    255,
    0,
    0,
    0,
    0,
    0,
  ]);
  expect([
    ...(await loadInkMaskAsset(
      store,
      result.document.importedInkLayers[1].maskAssetId,
    )).coverage,
  ]).toEqual([
    0,
    0,
    0,
    0,
    0,
    255,
    255,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
});
