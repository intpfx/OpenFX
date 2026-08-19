import { expect } from "@std/expect";

import {
  commitImportedInkLayer,
  commitStroke,
  createDrawingDocument,
  type ImportedInkLayer,
  type NativeStroke,
  removeContentSelection,
  transformContentSelection,
} from "../src/drawing-document.ts";
import {
  findStrokeIdsInLasso,
  getContentSelectionBounds,
  splitInkMaskByLasso,
} from "../src/lasso-selection.ts";

function stroke(id: string, x: number, y: number): NativeStroke {
  return {
    id,
    points: [
      { x, y, pressure: 0.5, time: 0 },
      { x: x + 80, y, pressure: 0.5, time: 16 },
    ],
    brush: {
      color: "#18201c",
      size: 14,
      thinning: 0.58,
      smoothing: 0.72,
      streamline: 0.62,
      simulatePressure: true,
    },
    transform: { x: 0, y: 0, scale: 1 },
  };
}

Deno.test("a closed lasso selects whole native strokes whose outline it crosses", () => {
  const empty = createDrawingDocument({
    id: "doc-1",
    now: "2026-08-19T00:00:00.000Z",
    width: 500,
    height: 400,
  });
  const first = commitStroke(empty, stroke("first", 80, 100), empty.updatedAt);
  const document = commitStroke(first, stroke("second", 300, 250), first.updatedAt);

  const selected = findStrokeIdsInLasso(document, [
    { x: 60, y: 70 },
    { x: 180, y: 70 },
    { x: 180, y: 130 },
    { x: 60, y: 130 },
  ]);

  expect(selected).toEqual(["first"]);
});

Deno.test("a closed lasso cuts only enclosed imported ink into a new fragment", () => {
  const source = new Uint8Array([
    0,
    0,
    0,
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
    0,
    0,
  ]);

  const split = splitInkMaskByLasso(
    { width: 5, height: 5, coverage: source },
    { x: 10, y: 20, scale: 2 },
    [
      { x: 9, y: 23 },
      { x: 14, y: 23 },
      { x: 14, y: 27 },
      { x: 9, y: 27 },
    ],
  );

  expect([...split.selected.coverage]).toEqual([
    0,
    0,
    0,
    0,
    0,
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
    0,
    0,
    0,
    0,
    0,
  ]);
  expect([...split.remaining.coverage]).toEqual([
    0,
    0,
    0,
    0,
    0,
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
    0,
    0,
    0,
    0,
    0,
  ]);
  expect(source[2 * 5]).toBe(255);
});

Deno.test("one group transform moves and scales native strokes with photo ink", () => {
  const originalStroke = stroke("native", 20, 30);
  const layer: ImportedInkLayer = {
    id: "photo-layer",
    source: {
      assetId: "a".repeat(64),
      mimeType: "image/jpeg",
      width: 1000,
      height: 800,
      byteLength: 20_000,
    },
    maskAssetId: "b".repeat(64),
    sdfAssetId: "c".repeat(64),
    width: 500,
    height: 400,
    crop: {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 1000, y: 0 },
      bottomRight: { x: 1000, y: 800 },
      bottomLeft: { x: 0, y: 800 },
    },
    cleanup: {
      threshold: 0.34,
      denoise: 0.3,
      backgroundRemoval: 0.8,
      thickness: 0,
    },
    transform: { x: 100, y: 50, scale: 1 },
  };
  const empty = createDrawingDocument({
    id: "mixed",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const mixed = commitImportedInkLayer(
    commitStroke(empty, originalStroke, empty.updatedAt),
    layer,
    empty.updatedAt,
  );

  const transformed = transformContentSelection(
    mixed,
    { strokeIds: [originalStroke.id], layerIds: [layer.id] },
    { origin: { x: 0, y: 0 }, translate: { x: 10, y: 20 }, scale: 2 },
    "2026-08-19T00:02:00.000Z",
  );

  expect(transformed.strokes[0].transform).toEqual({ x: 10, y: 20, scale: 2 });
  expect(transformed.importedInkLayers[0].transform).toEqual({
    x: 210,
    y: 120,
    scale: 2,
  });
  expect(transformed.strokes[0].points).toBe(mixed.strokes[0].points);
  expect(transformed.importedInkLayers[0].maskAssetId).toBe(layer.maskAssetId);
});

Deno.test("photo ink contributes its visible rectangle to selection bounds", () => {
  const document = createDrawingDocument({
    id: "bounds",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const layer: ImportedInkLayer = {
    id: "photo-bounds",
    source: {
      assetId: "a".repeat(64),
      mimeType: "image/png",
      width: 100,
      height: 80,
      byteLength: 400,
    },
    maskAssetId: "b".repeat(64),
    sdfAssetId: "c".repeat(64),
    width: 100,
    height: 80,
    crop: {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 0 },
      bottomRight: { x: 100, y: 80 },
      bottomLeft: { x: 0, y: 80 },
    },
    cleanup: {
      threshold: 0.3,
      denoise: 0,
      backgroundRemoval: 1,
      thickness: 0,
    },
    transform: { x: 25, y: 40, scale: 1.5 },
  };
  const mixed = commitImportedInkLayer(document, layer, document.updatedAt);

  expect(getContentSelectionBounds(mixed, { strokeIds: [], layerIds: [layer.id] }))
    .toEqual({ x: 25, y: 40, width: 150, height: 120 });
});

Deno.test("one delete removes the selected native strokes and photo fragments", () => {
  const empty = createDrawingDocument({
    id: "delete-mixed",
    now: "2026-08-19T00:00:00.000Z",
    width: 400,
    height: 300,
  });
  const native = stroke("native-delete", 30, 40);
  const layer: ImportedInkLayer = {
    id: "photo-delete",
    source: {
      assetId: "a".repeat(64),
      mimeType: "image/png",
      width: 100,
      height: 80,
      byteLength: 400,
    },
    maskAssetId: "b".repeat(64),
    sdfAssetId: "c".repeat(64),
    width: 100,
    height: 80,
    crop: {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 0 },
      bottomRight: { x: 100, y: 80 },
      bottomLeft: { x: 0, y: 80 },
    },
    cleanup: {
      threshold: 0.3,
      denoise: 0,
      backgroundRemoval: 1,
      thickness: 0,
    },
    transform: { x: 25, y: 40, scale: 1 },
  };
  const mixed = commitImportedInkLayer(
    commitStroke(empty, native, empty.updatedAt),
    layer,
    empty.updatedAt,
  );

  const removed = removeContentSelection(
    mixed,
    { strokeIds: [native.id], layerIds: [layer.id] },
    "2026-08-19T00:01:00.000Z",
  );

  expect(removed.strokes).toEqual([]);
  expect(removed.importedInkLayers).toEqual([]);
  expect(removed.updatedAt).toBe("2026-08-19T00:01:00.000Z");
});
