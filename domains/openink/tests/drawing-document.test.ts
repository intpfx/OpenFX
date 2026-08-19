import { expect } from "@std/expect";

import {
  addDrawingLayer,
  applyMaterialPreset,
  commitHistory,
  commitImportedInkLayer,
  commitStroke,
  createDrawingDocument,
  createHistory,
  duplicateDrawingDocument,
  findContentAtPoint,
  findStrokeAtPoint,
  type ImportedInkLayer,
  MATERIAL_PRESET_LABELS,
  MATERIAL_PRESET_ORDER,
  moveDrawingLayer,
  type NativeStroke,
  parseDrawingDocument,
  redoHistory,
  removeContentSelection,
  removeDrawingLayer,
  removeStrokes,
  renameDrawingDocument,
  renameDrawingLayer,
  serializeDrawingDocument,
  setActiveDrawingLayer,
  setDrawingLayerLocked,
  setDrawingLayerVisibility,
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

Deno.test("a new drawing starts with one active editable layer", () => {
  const document = createDrawingDocument({
    id: "doc-layers",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });

  expect(document.version).toBe(3);
  expect(document.drawingLayers).toEqual([{
    id: "layer-default",
    name: "墨迹",
    visible: true,
    locked: false,
    content: [],
  }]);
  expect(document.activeLayerId).toBe("layer-default");
});

Deno.test("adding a drawing layer makes it the active destination", () => {
  const document = createDrawingDocument({
    id: "doc-layers",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });

  const layered = addDrawingLayer(
    document,
    { id: "layer-notes", name: "批注" },
    "2026-08-19T00:01:00.000Z",
  );

  expect(layered.drawingLayers.at(-1)).toEqual({
    id: "layer-notes",
    name: "批注",
    visible: true,
    locked: false,
    content: [],
  });
  expect(layered.activeLayerId).toBe("layer-notes");
});

Deno.test("renaming a drawing layer preserves its content and flags", () => {
  const base = createDrawingDocument({
    id: "doc-layers",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });

  const renamed = renameDrawingLayer(
    base,
    "layer-default",
    "  线稿  ",
    "2026-08-19T00:01:00.000Z",
  );

  expect(renamed.drawingLayers[0]).toEqual({
    ...base.drawingLayers[0],
    name: "线稿",
  });
});

Deno.test("moving a drawing layer changes bottom-to-top render order", () => {
  const base = createDrawingDocument({
    id: "doc-layers",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const withNotes = addDrawingLayer(
    base,
    { id: "layer-notes", name: "批注" },
    base.updatedAt,
  );
  const withMarks = addDrawingLayer(
    withNotes,
    { id: "layer-marks", name: "标记" },
    withNotes.updatedAt,
  );

  const reordered = moveDrawingLayer(
    withMarks,
    "layer-default",
    2,
    "2026-08-19T00:01:00.000Z",
  );

  expect(reordered.drawingLayers.map((layer) => layer.id)).toEqual([
    "layer-notes",
    "layer-marks",
    "layer-default",
  ]);
});

Deno.test("a drawing layer can be hidden without deleting its content", () => {
  const base = createDrawingDocument({
    id: "doc-layers",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });

  const hidden = setDrawingLayerVisibility(
    base,
    "layer-default",
    false,
    "2026-08-19T00:01:00.000Z",
  );

  expect(hidden.drawingLayers[0].visible).toBe(false);
  expect(hidden.drawingLayers[0].content).toBe(base.drawingLayers[0].content);
  expect(() =>
    commitStroke(hidden, {
      id: "stroke-hidden",
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
    }, hidden.updatedAt)
  ).toThrow("当前图层已隐藏");
});

Deno.test("a locked active layer rejects new strokes", () => {
  const base = createDrawingDocument({
    id: "doc-layers",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const locked = setDrawingLayerLocked(
    base,
    "layer-default",
    true,
    "2026-08-19T00:01:00.000Z",
  );
  const stroke: NativeStroke = {
    id: "stroke-locked",
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

  expect(locked.drawingLayers[0].locked).toBe(true);
  expect(() => commitStroke(locked, stroke, locked.updatedAt)).toThrow(
    "当前图层已锁定",
  );
});

Deno.test("locked layer content cannot be deleted through a stale selection", () => {
  const base = createDrawingDocument({
    id: "doc-layers",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const stroke: NativeStroke = {
    id: "stroke-locked",
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
  const withStroke = commitStroke(base, stroke, base.updatedAt);
  const locked = setDrawingLayerLocked(
    withStroke,
    "layer-default",
    true,
    withStroke.updatedAt,
  );

  const unchanged = removeContentSelection(
    locked,
    { strokeIds: [stroke.id], layerIds: [] },
    "2026-08-19T00:01:00.000Z",
  );

  expect(unchanged).toBe(locked);
  expect(
    removeStrokes(locked, new Set([stroke.id]), "2026-08-19T00:01:00.000Z"),
  ).toBe(locked);
});

Deno.test("activating a layer changes only the drawing destination", () => {
  const base = createDrawingDocument({
    id: "doc-layers",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const layered = addDrawingLayer(
    base,
    { id: "layer-notes", name: "批注" },
    "2026-08-19T00:01:00.000Z",
  );

  const activated = setActiveDrawingLayer(layered, "layer-default");

  expect(activated.activeLayerId).toBe("layer-default");
  expect(activated.updatedAt).toBe(layered.updatedAt);
  expect(activated.drawingLayers).toBe(layered.drawingLayers);
});

Deno.test("deleting a nonempty drawing layer removes its owned content", () => {
  const base = addDrawingLayer(
    createDrawingDocument({
      id: "doc-layers",
      now: "2026-08-19T00:00:00.000Z",
      width: 1200,
      height: 800,
    }),
    { id: "layer-notes", name: "批注" },
    "2026-08-19T00:01:00.000Z",
  );
  const stroke: NativeStroke = {
    id: "stroke-notes",
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
  const withStroke = commitStroke(base, stroke, base.updatedAt);

  const removed = removeDrawingLayer(
    withStroke,
    "layer-notes",
    "2026-08-19T00:02:00.000Z",
  );

  expect(removed.strokes).toEqual([]);
  expect(removed.drawingLayers.map((layer) => layer.id)).toEqual([
    "layer-default",
  ]);
  expect(removed.activeLayerId).toBe("layer-default");
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
  expect(next.drawingLayers[0].content).toEqual([{
    kind: "stroke",
    id: stroke.id,
  }]);
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

Deno.test("point selection follows topmost visible unlocked drawing content", () => {
  const makeStroke = (id: string): NativeStroke => ({
    id,
    points: [
      { x: 20, y: 20, pressure: 0.5, time: 0 },
      { x: 120, y: 20, pressure: 0.5, time: 16 },
    ],
    brush: {
      color: "#151515",
      size: 14,
      thinning: 0.5,
      smoothing: 0.7,
      streamline: 0.6,
      simulatePressure: true,
    },
    transform: { x: 0, y: 0, scale: 1 },
  });
  const base = createDrawingDocument({
    id: "doc-hit-layers",
    now: "2026-08-19T00:00:00.000Z",
    width: 500,
    height: 300,
  });
  const lower = commitStroke(base, makeStroke("lower"), base.updatedAt);
  const layered = addDrawingLayer(
    lower,
    { id: "layer-upper", name: "上层" },
    lower.updatedAt,
  );
  const upper = commitStroke(layered, makeStroke("upper"), layered.updatedAt);

  expect(findContentAtPoint(upper, { x: 60, y: 20 })).toEqual({
    kind: "stroke",
    id: "upper",
  });
  const hidden = setDrawingLayerVisibility(
    upper,
    "layer-upper",
    false,
    upper.updatedAt,
  );
  expect(findContentAtPoint(hidden, { x: 60, y: 20 })).toEqual({
    kind: "stroke",
    id: "lower",
  });
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
  expect(erased.drawingLayers[0].content).toEqual([{
    kind: "stroke",
    id: "b",
  }]);
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
  expect(() => parseDrawingDocument('{"version":4}')).toThrow(
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

  expect(migrated.version).toBe(3);
  expect(migrated.strokes[0].points).toEqual([
    { x: 12, y: 18, pressure: 0.72, time: 4 },
  ]);
  expect(migrated.importedInkLayers).toEqual([]);
  expect(migrated.material).toEqual({
    preset: "default",
    foreground: "#18201c",
    background: "#f3f0e7",
    textureStrength: 0,
    edgeSoftness: 0,
    bleed: 0,
  });
  expect(migrated.drawingLayers[0].content).toEqual([{
    kind: "stroke",
    id: "stroke-1",
  }]);
});

Deno.test("a v2 material migrates into the matching advanced preset", () => {
  const migrated = parseDrawingDocument(JSON.stringify({
    version: 2,
    id: "legacy-material",
    title: "旧粉笔稿",
    width: 1200,
    height: 800,
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:01:00.000Z",
    strokes: [],
    importedInkLayers: [],
    material: {
      preset: "chalk",
      foreground: "#edf0d7",
      background: "#202722",
      textureStrength: 0.68,
      edgeSoftness: 0.34,
      bleed: 0.16,
    },
  }));

  expect(migrated.material.preset).toBe("blackboard");
  expect(migrated.drawingLayers).toEqual([{
    id: "layer-default",
    name: "墨迹",
    visible: true,
    locked: false,
    content: [],
  }]);
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
  expect(restored.drawingLayers[0].content).toEqual([{
    kind: "importedInk",
    id: layer.id,
  }]);
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

Deno.test("OpenInk exposes the eight advanced material presets", () => {
  expect(MATERIAL_PRESET_ORDER).toEqual([
    "default",
    "blackboard",
    "blueprint",
    "letterpress",
    "paper",
    "pixels",
    "sketch",
    "warhol",
  ]);
  expect(MATERIAL_PRESET_LABELS).toEqual({
    default: "默认",
    blackboard: "黑板",
    blueprint: "蓝图",
    letterpress: "正文",
    paper: "纸张",
    pixels: "像素",
    sketch: "素描",
    warhol: "沃霍尔",
  });
});

Deno.test("advanced material controls stay bounded and preserve the selected preset", () => {
  const base = applyMaterialPreset(
    createDrawingDocument({
      id: "doc-material-controls",
      now: "2026-08-19T00:00:00.000Z",
      width: 1200,
      height: 800,
    }),
    "blackboard",
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
