import { expect } from "@std/expect";

import {
  applyMaterialPreset,
  commitHistory,
  commitImportedInkLayer,
  commitStroke,
  createDrawingDocument,
  createHistory,
  duplicateDrawingDocument,
  findStrokeAtPoint,
  type ImportedInkLayer,
  type NativeStroke,
  parseDrawingDocument,
  redoHistory,
  removeStrokes,
  renameDrawingDocument,
  serializeDrawingDocument,
  undoHistory,
  updateDocumentMaterial,
  updateStrokeTransform,
} from "../src/drawing-document.ts";

Deno.test("renaming a drawing changes only its title and update time", () => {
  const document = createDrawingDocument({
    id: "doc-1",
    title: "旧名字",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });

  const renamed = renameDrawingDocument(
    document,
    "  夏末速写  ",
    "2026-08-19T00:01:00.000Z",
  );

  expect(renamed).toEqual({
    ...document,
    title: "夏末速写",
    updatedAt: "2026-08-19T00:01:00.000Z",
  });
  expect(() => renameDrawingDocument(document, "   ", document.updatedAt)).toThrow(
    "画稿名称不能为空",
  );
});

Deno.test("duplicating a drawing preserves content under a new identity", () => {
  const document = createDrawingDocument({
    id: "doc-1",
    title: "夏末速写",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });

  const duplicated = duplicateDrawingDocument(document, {
    id: "doc-2",
    now: "2026-08-19T00:02:00.000Z",
  });

  expect(duplicated).toEqual({
    ...document,
    id: "doc-2",
    title: "夏末速写 副本",
    createdAt: "2026-08-19T00:02:00.000Z",
    updatedAt: "2026-08-19T00:02:00.000Z",
  });
});

Deno.test("a completed stroke preserves its raw pointer samples", () => {
  const document = createDrawingDocument({
    id: "doc-1",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const stroke: NativeStroke = {
    id: "stroke-1",
    points: [
      { x: 12, y: 18, pressure: 0.21, time: 4 },
      { x: 38, y: 44, pressure: 0.76, time: 21 },
    ],
    brush: {
      color: "#151515",
      size: 14,
      thinning: 0.58,
      smoothing: 0.72,
      streamline: 0.62,
      simulatePressure: false,
    },
    transform: { x: 0, y: 0, scale: 1 },
  };

  const next = commitStroke(document, stroke, "2026-08-19T00:00:01.000Z");

  expect(next.strokes).toEqual([stroke]);
  expect(next.updatedAt).toBe("2026-08-19T00:00:01.000Z");
  expect(document.strokes).toEqual([]);
});

Deno.test("a committed document can be undone and redone", () => {
  const document = createDrawingDocument({
    id: "doc-1",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const changed = {
    ...document,
    title: "雨夜手稿",
    updatedAt: "2026-08-19T00:00:01.000Z",
  };

  const committed = commitHistory(createHistory(document), changed);
  const undone = undoHistory(committed);
  const redone = redoHistory(undone);

  expect(undone.present).toEqual(document);
  expect(redone.present).toEqual(changed);
  expect(redone.future).toEqual([]);
});

Deno.test("selection hit testing respects the stroke transform", () => {
  const base = createDrawingDocument({
    id: "doc-1",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const stroke: NativeStroke = {
    id: "stroke-1",
    points: [
      { x: 20, y: 20, pressure: 0.5, time: 0 },
      { x: 120, y: 20, pressure: 0.5, time: 16 },
    ],
    brush: {
      color: "#151515",
      size: 12,
      thinning: 0.5,
      smoothing: 0.7,
      streamline: 0.6,
      simulatePressure: true,
    },
    transform: { x: 180, y: 90, scale: 1.5 },
  };
  const document = commitStroke(base, stroke, "2026-08-19T00:00:01.000Z");

  expect(findStrokeAtPoint(document, { x: 260, y: 120 })?.id).toBe("stroke-1");
  expect(findStrokeAtPoint(document, { x: 40, y: 20 })).toBeNull();
});

Deno.test("selection follows the visible streamlined outline", () => {
  const document = createDrawingDocument({
    id: "doc-1",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const stroke: NativeStroke = {
    id: "stroke-1",
    points: [
      { x: 244, y: 375, pressure: 0.5, time: 0 },
      { x: 313, y: 279, pressure: 0.5, time: 16 },
      { x: 396, y: 224, pressure: 0.5, time: 32 },
      { x: 492, y: 252, pressure: 0.5, time: 48 },
      { x: 588, y: 356, pressure: 0.5, time: 64 },
      { x: 698, y: 425, pressure: 0.5, time: 80 },
      { x: 821, y: 334, pressure: 0.5, time: 96 },
    ],
    brush: {
      color: "#151515",
      size: 14,
      thinning: 0.58,
      smoothing: 0.72,
      streamline: 0.62,
      simulatePressure: true,
    },
    transform: { x: 0, y: 0, scale: 1 },
  };
  const withStroke = commitStroke(
    document,
    stroke,
    "2026-08-19T00:00:01.000Z",
  );

  expect(findStrokeAtPoint(withStroke, { x: 408.44, y: 270.03 })?.id).toBe(
    stroke.id,
  );
});

Deno.test("moving and scaling a stroke leaves its raw samples untouched", () => {
  const original: NativeStroke = {
    id: "stroke-1",
    points: [{ x: 10, y: 20, pressure: 0.5, time: 0 }],
    brush: {
      color: "#151515",
      size: 12,
      thinning: 0.5,
      smoothing: 0.7,
      streamline: 0.6,
      simulatePressure: true,
    },
    transform: { x: 0, y: 0, scale: 1 },
  };
  const document = commitStroke(
    createDrawingDocument({
      id: "doc-1",
      now: "2026-08-19T00:00:00.000Z",
      width: 1200,
      height: 800,
    }),
    original,
    "2026-08-19T00:00:01.000Z",
  );

  const moved = updateStrokeTransform(
    document,
    original.id,
    { x: 45, y: -12, scale: 1.8 },
    "2026-08-19T00:00:02.000Z",
  );

  expect(moved.strokes[0].transform).toEqual({ x: 45, y: -12, scale: 1.8 });
  expect(moved.strokes[0].points).toBe(original.points);
});

Deno.test("an eraser gesture removes only the strokes it crossed", () => {
  const document = createDrawingDocument({
    id: "doc-1",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const makeStroke = (id: string): NativeStroke => ({
    id,
    points: [{ x: 10, y: 20, pressure: 0.5, time: 0 }],
    brush: {
      color: "#151515",
      size: 12,
      thinning: 0.5,
      smoothing: 0.7,
      streamline: 0.6,
      simulatePressure: true,
    },
    transform: { x: 0, y: 0, scale: 1 },
  });
  const withThree = ["a", "b", "c"].reduce(
    (current, id) => commitStroke(current, makeStroke(id), current.updatedAt),
    document,
  );

  const erased = removeStrokes(
    withThree,
    new Set(["a", "c"]),
    "2026-08-19T00:00:02.000Z",
  );

  expect(erased.strokes.map((stroke) => stroke.id)).toEqual(["b"]);
});

Deno.test("a versioned document round-trips through local persistence", () => {
  const document = createDrawingDocument({
    id: "doc-1",
    title: "雨夜手稿",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });

  expect(parseDrawingDocument(serializeDrawingDocument(document))).toEqual(document);
  expect(() => parseDrawingDocument('{"version":3}')).toThrow(
    "OpenInk 文档版本不受支持",
  );
});

Deno.test("a v1 drawing migrates into the mixed document without changing strokes", () => {
  const legacySource = JSON.stringify({
    version: 1,
    id: "legacy-doc",
    title: "纸上手稿",
    width: 1200,
    height: 800,
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:01:00.000Z",
    strokes: [{
      id: "stroke-1",
      points: [{ x: 12, y: 18, pressure: 0.72, time: 4 }],
      brush: {
        color: "#18201c",
        size: 14,
        thinning: 0.58,
        smoothing: 0.72,
        streamline: 0.62,
        simulatePressure: false,
      },
      transform: { x: 0, y: 0, scale: 1 },
    }],
  });

  const migrated = parseDrawingDocument(legacySource);

  expect(migrated.version).toBe(2);
  expect(migrated.strokes[0].points).toEqual([
    { x: 12, y: 18, pressure: 0.72, time: 4 },
  ]);
  expect(migrated.importedInkLayers).toEqual([]);
  expect(migrated.material).toEqual({
    preset: "ink",
    foreground: "#18201c",
    background: "#f3f0e7",
    textureStrength: 0,
    edgeSoftness: 0,
    bleed: 0,
  });
});

Deno.test("an imported photo ink layer round-trips with non-destructive settings", () => {
  const document = createDrawingDocument({
    id: "doc-photo",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const layer: ImportedInkLayer = {
    id: "layer-1",
    source: {
      assetId: "a".repeat(64),
      mimeType: "image/jpeg",
      width: 1600,
      height: 1200,
      byteLength: 48_000,
    },
    maskAssetId: "b".repeat(64),
    sdfAssetId: "c".repeat(64),
    width: 1000,
    height: 700,
    crop: {
      topLeft: { x: 90, y: 70 },
      topRight: { x: 1510, y: 80 },
      bottomRight: { x: 1540, y: 1130 },
      bottomLeft: { x: 60, y: 1120 },
    },
    cleanup: {
      threshold: 0.36,
      denoise: 0.4,
      backgroundRemoval: 0.9,
      thickness: 1.2,
    },
    transform: { x: 80, y: 50, scale: 0.8 },
  };

  const withPhoto = commitImportedInkLayer(
    document,
    layer,
    "2026-08-19T00:02:00.000Z",
  );
  const restored = parseDrawingDocument(serializeDrawingDocument(withPhoto));

  expect(restored.importedInkLayers).toEqual([layer]);
  expect(restored.strokes).toEqual([]);
});

Deno.test("a document material preset changes presentation without rewriting content", () => {
  const original = createDrawingDocument({
    id: "doc-material",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const stroke: NativeStroke = {
    id: "stroke-material",
    points: [{ x: 10, y: 20, pressure: 0.7, time: 0 }],
    brush: {
      color: "#18201c",
      size: 14,
      thinning: 0.58,
      smoothing: 0.72,
      streamline: 0.62,
      simulatePressure: false,
    },
    transform: { x: 0, y: 0, scale: 1 },
  };
  const withStroke = commitStroke(original, stroke, original.updatedAt);

  const blueprint = applyMaterialPreset(
    withStroke,
    "blueprint",
    "2026-08-19T00:03:00.000Z",
  );

  expect(blueprint.material).toEqual({
    preset: "blueprint",
    foreground: "#e8f4ee",
    background: "#174758",
    textureStrength: 0.28,
    edgeSoftness: 0.18,
    bleed: 0.08,
  });
  expect(blueprint.strokes[0].points).toBe(withStroke.strokes[0].points);
});

Deno.test("advanced material controls stay bounded and preserve the selected preset", () => {
  const base = applyMaterialPreset(
    createDrawingDocument({
      id: "doc-material-controls",
      now: "2026-08-19T00:00:00.000Z",
      width: 1200,
      height: 800,
    }),
    "chalk",
    "2026-08-19T00:01:00.000Z",
  );

  const adjusted = updateDocumentMaterial(
    base,
    { textureStrength: 1.4, edgeSoftness: 0.41, bleed: -0.2 },
    "2026-08-19T00:02:00.000Z",
  );

  expect(adjusted.material).toEqual({
    ...base.material,
    textureStrength: 1,
    edgeSoftness: 0.41,
    bleed: 0,
  });
  expect(adjusted.updatedAt).toBe("2026-08-19T00:02:00.000Z");
});
