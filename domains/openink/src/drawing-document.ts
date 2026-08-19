import { getStroke } from "perfect-freehand";

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

export type DrawingDocument = Readonly<{
  version: 1;
  id: string;
  title: string;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
  strokes: readonly NativeStroke[];
}>;

export type DocumentHistory = Readonly<{
  past: readonly DrawingDocument[];
  present: DrawingDocument;
  future: readonly DrawingDocument[];
}>;

type CreateDrawingDocumentOptions = Readonly<{
  id: string;
  now: string;
  width: number;
  height: number;
  title?: string;
}>;

export function createDrawingDocument(
  options: CreateDrawingDocumentOptions,
): DrawingDocument {
  return {
    version: 1,
    id: options.id,
    title: options.title ?? "未命名画稿",
    width: options.width,
    height: options.height,
    createdAt: options.now,
    updatedAt: options.now,
    strokes: [],
  };
}

export function commitStroke(
  document: DrawingDocument,
  stroke: NativeStroke,
  now: string,
): DrawingDocument {
  return {
    ...document,
    updatedAt: now,
    strokes: [...document.strokes, stroke],
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
  for (let index = document.strokes.length - 1; index >= 0; index -= 1) {
    const stroke = document.strokes[index];
    if (strokeContainsPoint(stroke, point)) return stroke;
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

export function removeStrokes(
  document: DrawingDocument,
  strokeIds: ReadonlySet<string>,
  now: string,
): DrawingDocument {
  if (strokeIds.size === 0) return document;
  const strokes = document.strokes.filter((stroke) => !strokeIds.has(stroke.id));
  if (strokes.length === document.strokes.length) return document;
  return { ...document, updatedAt: now, strokes };
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

export function parseDrawingDocument(source: string): DrawingDocument {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("OpenInk 文档无法解析");
  }
  if (!isRecord(value) || value.version !== 1) {
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
  return {
    version: 1,
    id: value.id,
    title: value.title,
    width: value.width,
    height: value.height,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    strokes: strokes as NativeStroke[],
  };
}
