import { getStroke } from "perfect-freehand";
import type { PhotoSourceAsset } from "./drawing-assets.ts";
import type {
  PhotoCleanupSettings,
  PhotoQuad,
  Point as PhotoPoint,
} from "./photo-cleanup.ts";

export type StrokePoint = Readonly<{
  x: number;
  y: number;
  pressure: number;
  time: number;
}>;

export type BrushSettings = Readonly<{
  color: string;
  size: number;
  thinning: number;
  smoothing: number;
  streamline: number;
  simulatePressure: boolean;
}>;

export type StrokeTransform = Readonly<{
  x: number;
  y: number;
  scale: number;
}>;

export type NativeStroke = Readonly<{
  id: string;
  points: readonly StrokePoint[];
  brush: BrushSettings;
  transform: StrokeTransform;
}>;

export const MATERIAL_PRESET_ORDER = [
  "default",
  "blackboard",
  "blueprint",
  "letterpress",
  "paper",
  "pixels",
  "sketch",
  "warhol",
] as const;

export type MaterialPreset = typeof MATERIAL_PRESET_ORDER[number];

export const MATERIAL_PRESET_LABELS: Readonly<Record<MaterialPreset, string>> = {
  default: "默认",
  blackboard: "黑板",
  blueprint: "蓝图",
  letterpress: "正文",
  paper: "纸张",
  pixels: "像素",
  sketch: "素描",
  warhol: "沃霍尔",
};

export type DocumentMaterial = Readonly<{
  preset: MaterialPreset;
  foreground: string;
  background: string;
  textureStrength: number;
  edgeSoftness: number;
  bleed: number;
}>;

export type ImportedInkLayer = Readonly<{
  id: string;
  source: PhotoSourceAsset;
  maskAssetId: string;
  sdfAssetId: string;
  width: number;
  height: number;
  crop: PhotoQuad;
  cleanup: PhotoCleanupSettings;
  transform: StrokeTransform;
}>;

export type LayerContentReference = Readonly<
  | { kind: "stroke"; id: string }
  | { kind: "importedInk"; id: string }
>;

export type DrawingLayer = Readonly<{
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  content: readonly LayerContentReference[];
}>;

export const DEFAULT_DRAWING_LAYER_ID = "layer-default";

function createDefaultDrawingLayer(
  content: readonly LayerContentReference[] = [],
): DrawingLayer {
  return {
    id: DEFAULT_DRAWING_LAYER_ID,
    name: "墨迹",
    visible: true,
    locked: false,
    content,
  };
}

export const DEFAULT_DOCUMENT_MATERIAL: DocumentMaterial = {
  preset: "default",
  foreground: "#18201c",
  background: "#f3f0e7",
  textureStrength: 0,
  edgeSoftness: 0,
  bleed: 0,
};

export const DOCUMENT_MATERIAL_PRESETS: Readonly<
  Record<MaterialPreset, DocumentMaterial>
> = {
  default: DEFAULT_DOCUMENT_MATERIAL,
  blackboard: {
    preset: "blackboard",
    foreground: "#f1edcf",
    background: "#1d2924",
    textureStrength: 0.72,
    edgeSoftness: 0.28,
    bleed: 0.12,
  },
  blueprint: {
    preset: "blueprint",
    foreground: "#e8f4ee",
    background: "#174758",
    textureStrength: 0.28,
    edgeSoftness: 0.18,
    bleed: 0.08,
  },
  letterpress: {
    preset: "letterpress",
    foreground: "#4a271f",
    background: "#efe4ce",
    textureStrength: 0.36,
    edgeSoftness: 0.12,
    bleed: 0.22,
  },
  paper: {
    preset: "paper",
    foreground: "#164a62",
    background: "#f4ead2",
    textureStrength: 0.22,
    edgeSoftness: 0.08,
    bleed: 0.06,
  },
  pixels: {
    preset: "pixels",
    foreground: "#202524",
    background: "#e8e4da",
    textureStrength: 0,
    edgeSoftness: 0,
    bleed: 0,
  },
  sketch: {
    preset: "sketch",
    foreground: "#3b3b38",
    background: "#f0ede5",
    textureStrength: 0.54,
    edgeSoftness: 0.22,
    bleed: 0.03,
  },
  warhol: {
    preset: "warhol",
    foreground: "#11180f",
    background: "#ff4f9a",
    textureStrength: 0.34,
    edgeSoftness: 0.06,
    bleed: 0.1,
  },
};

const LEGACY_MATERIAL_PRESETS: Readonly<Record<string, MaterialPreset>> = {
  ink: "default",
  pencil: "sketch",
  chalk: "blackboard",
  blueprint: "blueprint",
};

export type DrawingDocument = Readonly<{
  version: 3;
  id: string;
  title: string;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
  strokes: readonly NativeStroke[];
  importedInkLayers: readonly ImportedInkLayer[];
  drawingLayers: readonly DrawingLayer[];
  activeLayerId: string;
  material: DocumentMaterial;
}>;

export type DocumentHistory = Readonly<{
  past: readonly DrawingDocument[];
  present: DrawingDocument;
  future: readonly DrawingDocument[];
}>;

export type ContentSelection = Readonly<{
  strokeIds: readonly string[];
  layerIds: readonly string[];
}>;

type ContentTransform = Readonly<{
  origin: Point;
  translate: Point;
  scale: number;
}>;

type CreateDrawingDocumentOptions = Readonly<{
  id: string;
  now: string;
  width: number;
  height: number;
  title?: string;
}>;

type DuplicateDrawingDocumentOptions = Readonly<{
  id: string;
  now: string;
}>;

export function createDrawingDocument(
  options: CreateDrawingDocumentOptions,
): DrawingDocument {
  return {
    version: 3,
    id: options.id,
    title: options.title ?? "未命名画稿",
    width: options.width,
    height: options.height,
    createdAt: options.now,
    updatedAt: options.now,
    strokes: [],
    importedInkLayers: [],
    drawingLayers: [createDefaultDrawingLayer()],
    activeLayerId: DEFAULT_DRAWING_LAYER_ID,
    material: DEFAULT_DOCUMENT_MATERIAL,
  };
}

export function renameDrawingDocument(
  document: DrawingDocument,
  title: string,
  now: string,
): DrawingDocument {
  const normalized = title.trim();
  if (!normalized) throw new Error("画稿名称不能为空");
  if (normalized === document.title) return document;
  return { ...document, title: normalized, updatedAt: now };
}

export function duplicateDrawingDocument(
  document: DrawingDocument,
  options: DuplicateDrawingDocumentOptions,
): DrawingDocument {
  return {
    ...document,
    id: options.id,
    title: `${document.title} 副本`,
    createdAt: options.now,
    updatedAt: options.now,
  };
}

export function addDrawingLayer(
  document: DrawingDocument,
  layer: Readonly<{ id: string; name: string }>,
  now: string,
): DrawingDocument {
  const name = layer.name.trim();
  if (!name) throw new Error("图层名称不能为空");
  if (document.drawingLayers.some((candidate) => candidate.id === layer.id)) {
    throw new Error("OpenInk 图层标识重复");
  }
  return {
    ...document,
    updatedAt: now,
    activeLayerId: layer.id,
    drawingLayers: [...document.drawingLayers, {
      id: layer.id,
      name,
      visible: true,
      locked: false,
      content: [],
    }],
  };
}

export function renameDrawingLayer(
  document: DrawingDocument,
  layerId: string,
  name: string,
  now: string,
): DrawingDocument {
  const normalized = name.trim();
  if (!normalized) throw new Error("图层名称不能为空");
  const layer = document.drawingLayers.find((candidate) => candidate.id === layerId);
  if (!layer) return document;
  if (layer.name === normalized) return document;
  return {
    ...document,
    updatedAt: now,
    drawingLayers: document.drawingLayers.map((candidate) =>
      candidate.id === layerId ? { ...candidate, name: normalized } : candidate
    ),
  };
}

export function moveDrawingLayer(
  document: DrawingDocument,
  layerId: string,
  targetIndex: number,
  now: string,
): DrawingDocument {
  const sourceIndex = document.drawingLayers.findIndex((layer) => layer.id === layerId);
  if (sourceIndex < 0) return document;
  const boundedIndex = Math.max(
    0,
    Math.min(document.drawingLayers.length - 1, Math.trunc(targetIndex)),
  );
  if (boundedIndex === sourceIndex) return document;
  const drawingLayers = [...document.drawingLayers];
  const [layer] = drawingLayers.splice(sourceIndex, 1);
  drawingLayers.splice(boundedIndex, 0, layer);
  return { ...document, updatedAt: now, drawingLayers };
}

export function setDrawingLayerVisibility(
  document: DrawingDocument,
  layerId: string,
  visible: boolean,
  now: string,
): DrawingDocument {
  const layer = document.drawingLayers.find((candidate) => candidate.id === layerId);
  if (!layer || layer.visible === visible) return document;
  return {
    ...document,
    updatedAt: now,
    drawingLayers: document.drawingLayers.map((candidate) =>
      candidate.id === layerId ? { ...candidate, visible } : candidate
    ),
  };
}

export function setDrawingLayerLocked(
  document: DrawingDocument,
  layerId: string,
  locked: boolean,
  now: string,
): DrawingDocument {
  const layer = document.drawingLayers.find((candidate) => candidate.id === layerId);
  if (!layer || layer.locked === locked) return document;
  return {
    ...document,
    updatedAt: now,
    drawingLayers: document.drawingLayers.map((candidate) =>
      candidate.id === layerId ? { ...candidate, locked } : candidate
    ),
  };
}

export function setActiveDrawingLayer(
  document: DrawingDocument,
  layerId: string,
): DrawingDocument {
  if (layerId === document.activeLayerId) return document;
  if (!document.drawingLayers.some((layer) => layer.id === layerId)) return document;
  return { ...document, activeLayerId: layerId };
}

export function removeDrawingLayer(
  document: DrawingDocument,
  layerId: string,
  now: string,
): DrawingDocument {
  if (document.drawingLayers.length === 1) {
    throw new Error("OpenInk 至少需要保留一个图层");
  }
  const index = document.drawingLayers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return document;
  const removed = document.drawingLayers[index];
  const strokeIds = new Set<string>();
  const importedInkIds = new Set<string>();
  for (const reference of removed.content) {
    if (reference.kind === "stroke") strokeIds.add(reference.id);
    else importedInkIds.add(reference.id);
  }
  const drawingLayers = document.drawingLayers.filter((layer) => layer.id !== layerId);
  const fallback = drawingLayers[Math.min(index, drawingLayers.length - 1)];
  return {
    ...document,
    updatedAt: now,
    activeLayerId: document.activeLayerId === layerId
      ? fallback.id
      : document.activeLayerId,
    strokes: document.strokes.filter((stroke) => !strokeIds.has(stroke.id)),
    importedInkLayers: document.importedInkLayers.filter((layer) =>
      !importedInkIds.has(layer.id)
    ),
    drawingLayers,
  };
}

export function commitStroke(
  document: DrawingDocument,
  stroke: NativeStroke,
  now: string,
): DrawingDocument {
  const activeLayer = document.drawingLayers.find((layer) =>
    layer.id === document.activeLayerId
  );
  if (!activeLayer) throw new Error("OpenInk 活动图层缺失");
  if (!activeLayer.visible) throw new Error("当前图层已隐藏");
  if (activeLayer.locked) throw new Error("当前图层已锁定");
  return {
    ...document,
    updatedAt: now,
    strokes: [...document.strokes, stroke],
    drawingLayers: document.drawingLayers.map((layer) =>
      layer.id === activeLayer.id
        ? {
          ...layer,
          content: [...layer.content, { kind: "stroke", id: stroke.id }],
        }
        : layer
    ),
  };
}

export function commitImportedInkLayer(
  document: DrawingDocument,
  layer: ImportedInkLayer,
  now: string,
): DrawingDocument {
  if (document.importedInkLayers.some((candidate) => candidate.id === layer.id)) {
    throw new Error("OpenInk 照片墨迹层标识重复");
  }
  const activeLayer = document.drawingLayers.find((candidate) =>
    candidate.id === document.activeLayerId
  );
  if (!activeLayer) throw new Error("OpenInk 活动图层缺失");
  if (!activeLayer.visible) throw new Error("当前图层已隐藏");
  if (activeLayer.locked) throw new Error("当前图层已锁定");
  return {
    ...document,
    updatedAt: now,
    importedInkLayers: [...document.importedInkLayers, layer],
    drawingLayers: document.drawingLayers.map((candidate) =>
      candidate.id === activeLayer.id
        ? {
          ...candidate,
          content: [...candidate.content, { kind: "importedInk", id: layer.id }],
        }
        : candidate
    ),
  };
}

export function applyMaterialPreset(
  document: DrawingDocument,
  preset: MaterialPreset,
  now: string,
): DrawingDocument {
  return {
    ...document,
    updatedAt: now,
    material: DOCUMENT_MATERIAL_PRESETS[preset],
  };
}

type MaterialAdjustment = Readonly<
  Partial<
    Pick<
      DocumentMaterial,
      "foreground" | "background" | "textureStrength" | "edgeSoftness" | "bleed"
    >
  >
>;

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function updateDocumentMaterial(
  document: DrawingDocument,
  adjustment: MaterialAdjustment,
  now: string,
): DrawingDocument {
  return {
    ...document,
    updatedAt: now,
    material: {
      ...document.material,
      ...adjustment,
      textureStrength: adjustment.textureStrength === undefined
        ? document.material.textureStrength
        : clampUnit(adjustment.textureStrength),
      edgeSoftness: adjustment.edgeSoftness === undefined
        ? document.material.edgeSoftness
        : clampUnit(adjustment.edgeSoftness),
      bleed: adjustment.bleed === undefined
        ? document.material.bleed
        : clampUnit(adjustment.bleed),
    },
  };
}

export function createHistory(document: DrawingDocument): DocumentHistory {
  return { past: [], present: document, future: [] };
}

export function commitHistory(
  history: DocumentHistory,
  document: DrawingDocument,
): DocumentHistory {
  return {
    past: [...history.past, history.present],
    present: document,
    future: [],
  };
}

export function undoHistory(history: DocumentHistory): DocumentHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory(history: DocumentHistory): DocumentHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

type Point = Readonly<{ x: number; y: number }>;
export type OutlinePoint = readonly [number, number];

export function getStrokeOutline(
  stroke: NativeStroke,
  complete = true,
): readonly OutlinePoint[] {
  return getStroke(
    stroke.points.map((point) => [point.x, point.y, point.pressure]),
    {
      size: stroke.brush.size,
      thinning: stroke.brush.thinning,
      smoothing: stroke.brush.smoothing,
      streamline: stroke.brush.streamline,
      simulatePressure: stroke.brush.simulatePressure,
      last: complete,
      start: { cap: true, taper: 0 },
      end: { cap: true, taper: 0 },
    },
  );
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const progress = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (start.x + progress * dx),
    point.y - (start.y + progress * dy),
  );
}

function outlineContainsPoint(
  outline: readonly OutlinePoint[],
  point: Point,
  edgeRadius: number,
): boolean {
  if (outline.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = outline.length - 1; index < outline.length; index++) {
    const start = outline[previous];
    const end = outline[index];
    if (
      distanceToSegment(
        point,
        { x: start[0], y: start[1] },
        { x: end[0], y: end[1] },
      ) <= edgeRadius
    ) {
      return true;
    }
    if (
      (end[1] > point.y) !== (start[1] > point.y) &&
      point.x <
        (start[0] - end[0]) * (point.y - end[1]) / (start[1] - end[1]) + end[0]
    ) {
      inside = !inside;
    }
    previous = index;
  }
  return inside;
}

function strokeContainsPoint(stroke: NativeStroke, point: Point): boolean {
  const scale = Math.max(0.01, stroke.transform.scale);
  const localPoint = {
    x: (point.x - stroke.transform.x) / scale,
    y: (point.y - stroke.transform.y) / scale,
  };
  if (outlineContainsPoint(getStrokeOutline(stroke), localPoint, 6 / scale)) {
    return true;
  }
  const hitRadius = Math.max(10 / scale, stroke.brush.size * 0.75);
  if (stroke.points.length === 1) {
    return distanceToSegment(localPoint, stroke.points[0], stroke.points[0]) <=
      hitRadius;
  }
  for (let index = 1; index < stroke.points.length; index += 1) {
    if (
      distanceToSegment(localPoint, stroke.points[index - 1], stroke.points[index]) <=
        hitRadius
    ) {
      return true;
    }
  }
  return false;
}

export function findStrokeAtPoint(
  document: DrawingDocument,
  point: Point,
): NativeStroke | null {
  const strokesById = new Map(document.strokes.map((stroke) => [stroke.id, stroke]));
  for (
    let layerIndex = document.drawingLayers.length - 1;
    layerIndex >= 0;
    layerIndex--
  ) {
    const layer = document.drawingLayers[layerIndex];
    if (!layer.visible || layer.locked) continue;
    for (let index = layer.content.length - 1; index >= 0; index--) {
      const reference = layer.content[index];
      if (reference.kind !== "stroke") continue;
      const stroke = strokesById.get(reference.id);
      if (stroke && strokeContainsPoint(stroke, point)) return stroke;
    }
  }
  return null;
}

export function findContentAtPoint(
  document: DrawingDocument,
  point: Point,
): LayerContentReference | null {
  const strokesById = new Map(document.strokes.map((stroke) => [stroke.id, stroke]));
  const importedById = new Map(
    document.importedInkLayers.map((layer) => [layer.id, layer]),
  );
  for (
    let layerIndex = document.drawingLayers.length - 1;
    layerIndex >= 0;
    layerIndex--
  ) {
    const layer = document.drawingLayers[layerIndex];
    if (!layer.visible || layer.locked) continue;
    for (let index = layer.content.length - 1; index >= 0; index--) {
      const reference = layer.content[index];
      if (reference.kind === "stroke") {
        const stroke = strokesById.get(reference.id);
        if (stroke && strokeContainsPoint(stroke, point)) return reference;
        continue;
      }
      const imported = importedById.get(reference.id);
      if (!imported) continue;
      const right = imported.transform.x + imported.width * imported.transform.scale;
      const bottom = imported.transform.y + imported.height * imported.transform.scale;
      if (
        point.x >= imported.transform.x && point.x <= right &&
        point.y >= imported.transform.y && point.y <= bottom
      ) {
        return reference;
      }
    }
  }
  return null;
}

export function updateStrokeTransform(
  document: DrawingDocument,
  strokeId: string,
  transform: StrokeTransform,
  now: string,
): DrawingDocument {
  if (!document.strokes.some((stroke) => stroke.id === strokeId)) return document;
  return {
    ...document,
    updatedAt: now,
    strokes: document.strokes.map((stroke) =>
      stroke.id === strokeId
        ? {
          ...stroke,
          transform: {
            x: transform.x,
            y: transform.y,
            scale: Math.max(0.2, Math.min(8, transform.scale)),
          },
        }
        : stroke
    ),
  };
}

function applyContentTransform(
  transform: StrokeTransform,
  change: ContentTransform,
): StrokeTransform {
  return {
    x: change.origin.x + (transform.x - change.origin.x) * change.scale +
      change.translate.x,
    y: change.origin.y + (transform.y - change.origin.y) * change.scale +
      change.translate.y,
    scale: Math.max(0.2, Math.min(8, transform.scale * change.scale)),
  };
}

function editableContentIds(document: DrawingDocument): Readonly<{
  strokeIds: ReadonlySet<string>;
  importedInkIds: ReadonlySet<string>;
}> {
  const strokeIds = new Set<string>();
  const importedInkIds = new Set<string>();
  for (const layer of document.drawingLayers) {
    if (!layer.visible || layer.locked) continue;
    for (const reference of layer.content) {
      if (reference.kind === "stroke") strokeIds.add(reference.id);
      else importedInkIds.add(reference.id);
    }
  }
  return { strokeIds, importedInkIds };
}

export function isDrawingContentEditable(
  document: DrawingDocument,
  reference: LayerContentReference,
): boolean {
  return document.drawingLayers.some((layer) =>
    layer.visible && !layer.locked &&
    layer.content.some((candidate) =>
      candidate.kind === reference.kind && candidate.id === reference.id
    )
  );
}

export function transformContentSelection(
  document: DrawingDocument,
  selection: ContentSelection,
  change: ContentTransform,
  now: string,
): DrawingDocument {
  const editable = editableContentIds(document);
  const strokeIds = new Set(
    selection.strokeIds.filter((id) => editable.strokeIds.has(id)),
  );
  const layerIds = new Set(
    selection.layerIds.filter((id) => editable.importedInkIds.has(id)),
  );
  if (strokeIds.size === 0 && layerIds.size === 0) return document;
  return {
    ...document,
    updatedAt: now,
    strokes: document.strokes.map((stroke) =>
      strokeIds.has(stroke.id)
        ? { ...stroke, transform: applyContentTransform(stroke.transform, change) }
        : stroke
    ),
    importedInkLayers: document.importedInkLayers.map((layer) =>
      layerIds.has(layer.id)
        ? { ...layer, transform: applyContentTransform(layer.transform, change) }
        : layer
    ),
  };
}

export function removeStrokes(
  document: DrawingDocument,
  strokeIds: ReadonlySet<string>,
  now: string,
): DrawingDocument {
  if (strokeIds.size === 0) return document;
  const editable = editableContentIds(document);
  const removableIds = new Set<string>();
  for (const strokeId of strokeIds) {
    if (editable.strokeIds.has(strokeId)) removableIds.add(strokeId);
  }
  if (removableIds.size === 0) return document;
  const strokes = document.strokes.filter((stroke) => !removableIds.has(stroke.id));
  if (strokes.length === document.strokes.length) return document;
  return {
    ...document,
    updatedAt: now,
    strokes,
    drawingLayers: document.drawingLayers.map((layer) => ({
      ...layer,
      content: layer.content.filter((reference) =>
        reference.kind !== "stroke" || !removableIds.has(reference.id)
      ),
    })),
  };
}

export function removeContentSelection(
  document: DrawingDocument,
  selection: ContentSelection,
  now: string,
): DrawingDocument {
  const editable = editableContentIds(document);
  const strokeIds = new Set(
    selection.strokeIds.filter((id) => editable.strokeIds.has(id)),
  );
  const layerIds = new Set(
    selection.layerIds.filter((id) => editable.importedInkIds.has(id)),
  );
  if (strokeIds.size === 0 && layerIds.size === 0) return document;
  const strokes = document.strokes.filter((stroke) => !strokeIds.has(stroke.id));
  const importedInkLayers = document.importedInkLayers.filter((layer) =>
    !layerIds.has(layer.id)
  );
  if (
    strokes.length === document.strokes.length &&
    importedInkLayers.length === document.importedInkLayers.length
  ) return document;
  return {
    ...document,
    updatedAt: now,
    strokes,
    importedInkLayers,
    drawingLayers: document.drawingLayers.map((layer) => ({
      ...layer,
      content: layer.content.filter((reference) =>
        reference.kind === "stroke"
          ? !strokeIds.has(reference.id)
          : !layerIds.has(reference.id)
      ),
    })),
  };
}

export function serializeDrawingDocument(document: DrawingDocument): string {
  return JSON.stringify(document);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isAssetId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function parsePoint(value: unknown): PhotoPoint | null {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    return null;
  }
  return { x: value.x, y: value.y };
}

function parseImportedInkLayer(value: unknown): ImportedInkLayer | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.source)) {
    return null;
  }
  const source = value.source;
  const crop = isRecord(value.crop) ? value.crop : null;
  const cleanup = isRecord(value.cleanup) ? value.cleanup : null;
  const transform = isRecord(value.transform) ? value.transform : null;
  const topLeft = parsePoint(crop?.topLeft);
  const topRight = parsePoint(crop?.topRight);
  const bottomRight = parsePoint(crop?.bottomRight);
  const bottomLeft = parsePoint(crop?.bottomLeft);
  if (
    !isAssetId(source.assetId) || typeof source.mimeType !== "string" ||
    !source.mimeType.startsWith("image/") || !isPositiveInteger(source.width) ||
    !isPositiveInteger(source.height) || !isPositiveInteger(source.byteLength) ||
    !isAssetId(value.maskAssetId) || !isAssetId(value.sdfAssetId) ||
    !isPositiveInteger(value.width) || !isPositiveInteger(value.height) ||
    !topLeft || !topRight || !bottomRight || !bottomLeft || !cleanup || !transform ||
    !isFiniteNumber(cleanup.threshold) || !isFiniteNumber(cleanup.denoise) ||
    !isFiniteNumber(cleanup.backgroundRemoval) || !isFiniteNumber(cleanup.thickness) ||
    !isFiniteNumber(transform.x) || !isFiniteNumber(transform.y) ||
    !isFiniteNumber(transform.scale)
  ) {
    return null;
  }
  return {
    id: value.id,
    source: {
      assetId: source.assetId,
      mimeType: source.mimeType,
      width: source.width,
      height: source.height,
      byteLength: source.byteLength,
    },
    maskAssetId: value.maskAssetId,
    sdfAssetId: value.sdfAssetId,
    width: value.width,
    height: value.height,
    crop: { topLeft, topRight, bottomRight, bottomLeft },
    cleanup: {
      threshold: cleanup.threshold,
      denoise: cleanup.denoise,
      backgroundRemoval: cleanup.backgroundRemoval,
      thickness: cleanup.thickness,
    },
    transform: {
      x: transform.x,
      y: transform.y,
      scale: transform.scale,
    },
  };
}

function parseStroke(value: unknown): NativeStroke | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  if (
    !Array.isArray(value.points) || !isRecord(value.brush) || !isRecord(value.transform)
  ) {
    return null;
  }
  const points = value.points.flatMap((point) => {
    if (
      !isRecord(point) || !isFiniteNumber(point.x) || !isFiniteNumber(point.y) ||
      !isFiniteNumber(point.pressure) || !isFiniteNumber(point.time)
    ) {
      return [];
    }
    return [{ x: point.x, y: point.y, pressure: point.pressure, time: point.time }];
  });
  const brush = value.brush;
  const transform = value.transform;
  if (
    points.length !== value.points.length || typeof brush.color !== "string" ||
    !isFiniteNumber(brush.size) || !isFiniteNumber(brush.thinning) ||
    !isFiniteNumber(brush.smoothing) || !isFiniteNumber(brush.streamline) ||
    typeof brush.simulatePressure !== "boolean" || !isFiniteNumber(transform.x) ||
    !isFiniteNumber(transform.y) || !isFiniteNumber(transform.scale)
  ) {
    return null;
  }
  return {
    id: value.id,
    points,
    brush: {
      color: brush.color,
      size: brush.size,
      thinning: brush.thinning,
      smoothing: brush.smoothing,
      streamline: brush.streamline,
      simulatePressure: brush.simulatePressure,
    },
    transform: { x: transform.x, y: transform.y, scale: transform.scale },
  };
}

function parseDrawingLayer(value: unknown): DrawingLayer | null {
  if (
    !isRecord(value) || typeof value.id !== "string" ||
    typeof value.name !== "string" || !value.name.trim() ||
    typeof value.visible !== "boolean" || typeof value.locked !== "boolean" ||
    !Array.isArray(value.content)
  ) {
    return null;
  }
  const content = value.content.flatMap((reference) => {
    if (
      !isRecord(reference) || typeof reference.id !== "string" ||
      (reference.kind !== "stroke" && reference.kind !== "importedInk")
    ) {
      return [];
    }
    return [{ kind: reference.kind, id: reference.id } as LayerContentReference];
  });
  if (content.length !== value.content.length) return null;
  return {
    id: value.id,
    name: value.name.trim(),
    visible: value.visible,
    locked: value.locked,
    content,
  };
}

function migratedDrawingLayer(
  strokes: readonly NativeStroke[],
  importedInkLayers: readonly ImportedInkLayer[],
): DrawingLayer {
  return createDefaultDrawingLayer([
    ...importedInkLayers.map((layer) => ({
      kind: "importedInk" as const,
      id: layer.id,
    })),
    ...strokes.map((stroke) => ({ kind: "stroke" as const, id: stroke.id })),
  ]);
}

function validateDrawingLayers(
  layers: readonly DrawingLayer[],
  activeLayerId: string,
  strokes: readonly NativeStroke[],
  importedInkLayers: readonly ImportedInkLayer[],
): boolean {
  if (
    layers.length === 0 ||
    new Set(layers.map((layer) => layer.id)).size !== layers.length ||
    !layers.some((layer) => layer.id === activeLayerId)
  ) {
    return false;
  }
  const expected = new Set([
    ...strokes.map((stroke) => `stroke:${stroke.id}`),
    ...importedInkLayers.map((layer) => `importedInk:${layer.id}`),
  ]);
  const actual = layers.flatMap((layer) =>
    layer.content.map((reference) => `${reference.kind}:${reference.id}`)
  );
  return actual.length === expected.size && new Set(actual).size === actual.length &&
    actual.every((reference) => expected.has(reference));
}

export function parseDrawingDocument(source: string): DrawingDocument {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("OpenInk 文档无法解析");
  }
  if (
    !isRecord(value) ||
    (value.version !== 1 && value.version !== 2 && value.version !== 3)
  ) {
    throw new Error("OpenInk 文档版本不受支持");
  }
  const strokes = Array.isArray(value.strokes) ? value.strokes.map(parseStroke) : [];
  if (
    typeof value.id !== "string" || typeof value.title !== "string" ||
    !isFiniteNumber(value.width) || !isFiniteNumber(value.height) ||
    typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" ||
    !Array.isArray(value.strokes) || strokes.some((stroke) => stroke === null)
  ) {
    throw new Error("OpenInk 文档内容损坏");
  }
  let material = DEFAULT_DOCUMENT_MATERIAL;
  let importedInkLayers: readonly ImportedInkLayer[] = [];
  if (value.version === 2 || value.version === 3) {
    if (!isRecord(value.material) || !Array.isArray(value.importedInkLayers)) {
      throw new Error("OpenInk 文档内容损坏");
    }
    const candidate = value.material;
    const preset = value.version === 2
      ? LEGACY_MATERIAL_PRESETS[String(candidate.preset)]
      : MATERIAL_PRESET_ORDER.find((value) => value === candidate.preset);
    if (
      !preset ||
      typeof candidate.foreground !== "string" ||
      typeof candidate.background !== "string" ||
      !isFiniteNumber(candidate.textureStrength) ||
      !isFiniteNumber(candidate.edgeSoftness) || !isFiniteNumber(candidate.bleed)
    ) {
      throw new Error("OpenInk 文档内容损坏");
    }
    const parsedLayers = value.importedInkLayers.map(parseImportedInkLayer);
    if (
      parsedLayers.some((layer) => layer === null) ||
      new Set(parsedLayers.map((layer) => layer?.id)).size !== parsedLayers.length
    ) {
      throw new Error("OpenInk 文档内容损坏");
    }
    material = {
      preset,
      foreground: candidate.foreground,
      background: candidate.background,
      textureStrength: candidate.textureStrength,
      edgeSoftness: candidate.edgeSoftness,
      bleed: candidate.bleed,
    };
    importedInkLayers = parsedLayers as ImportedInkLayer[];
  }
  const parsedStrokes = strokes as NativeStroke[];
  let drawingLayers: readonly DrawingLayer[] = [
    migratedDrawingLayer(parsedStrokes, importedInkLayers),
  ];
  let activeLayerId = DEFAULT_DRAWING_LAYER_ID;
  if (value.version === 3) {
    if (
      !Array.isArray(value.drawingLayers) || typeof value.activeLayerId !== "string"
    ) {
      throw new Error("OpenInk 文档内容损坏");
    }
    const parsedLayers = value.drawingLayers.map(parseDrawingLayer);
    if (parsedLayers.some((layer) => layer === null)) {
      throw new Error("OpenInk 文档内容损坏");
    }
    drawingLayers = parsedLayers as DrawingLayer[];
    activeLayerId = value.activeLayerId;
    if (
      !validateDrawingLayers(
        drawingLayers,
        activeLayerId,
        parsedStrokes,
        importedInkLayers,
      )
    ) {
      throw new Error("OpenInk 文档内容损坏");
    }
  }
  return {
    version: 3,
    id: value.id,
    title: value.title,
    width: value.width,
    height: value.height,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    strokes: parsedStrokes,
    importedInkLayers,
    drawingLayers,
    activeLayerId,
    material,
  };
}
