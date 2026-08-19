import {
  type ContentSelection,
  type DrawingDocument,
  getStrokeOutline,
  isDrawingContentEditable,
  type NativeStroke,
  type StrokeTransform,
} from "./drawing-document.ts";
import type { InkMask, Point } from "./photo-cleanup.ts";
import { getStrokeBounds, type StrokeBounds } from "./stroke-renderer.ts";

function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; index++) {
    const start = polygon[previous];
    const end = polygon[index];
    if (
      (end.y > point.y) !== (start.y > point.y) &&
      point.x < (start.x - end.x) * (point.y - end.y) / (start.y - end.y) + end.x
    ) {
      inside = !inside;
    }
    previous = index;
  }
  return inside;
}

function orientation(start: Point, end: Point, point: Point): number {
  return (end.x - start.x) * (point.y - start.y) -
    (end.y - start.y) * (point.x - start.x);
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return (abC === 0 || abD === 0 || Math.sign(abC) !== Math.sign(abD)) &&
    (cdA === 0 || cdB === 0 || Math.sign(cdA) !== Math.sign(cdB));
}

function polygonEdgesIntersect(
  first: readonly Point[],
  second: readonly Point[],
): boolean {
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstStart = first[firstIndex];
    const firstEnd = first[(firstIndex + 1) % first.length];
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      const secondStart = second[secondIndex];
      const secondEnd = second[(secondIndex + 1) % second.length];
      if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) return true;
    }
  }
  return false;
}

function transformedOutline(stroke: NativeStroke): readonly Point[] {
  return getStrokeOutline(stroke).map(([x, y]) => ({
    x: stroke.transform.x + x * stroke.transform.scale,
    y: stroke.transform.y + y * stroke.transform.scale,
  }));
}

function polygonsOverlap(first: readonly Point[], second: readonly Point[]): boolean {
  if (first.length < 3 || second.length < 3) return false;
  return first.some((point) => pointInPolygon(point, second)) ||
    second.some((point) => pointInPolygon(point, first)) ||
    polygonEdgesIntersect(first, second);
}

export function findStrokeIdsInLasso(
  document: DrawingDocument,
  lasso: readonly Point[],
): readonly string[] {
  if (lasso.length < 3) return [];
  const selected: string[] = [];
  for (const stroke of document.strokes) {
    if (
      isDrawingContentEditable(document, { kind: "stroke", id: stroke.id }) &&
      polygonsOverlap(transformedOutline(stroke), lasso)
    ) {
      selected.push(stroke.id);
    }
  }
  return selected;
}

export function splitInkMaskByLasso(
  mask: InkMask,
  transform: StrokeTransform,
  lasso: readonly Point[],
): Readonly<{ selected: InkMask; remaining: InkMask }> {
  const selected = new Uint8Array(mask.coverage.length);
  const remaining = mask.coverage.slice();
  if (lasso.length < 3) {
    return {
      selected: { width: mask.width, height: mask.height, coverage: selected },
      remaining: { width: mask.width, height: mask.height, coverage: remaining },
    };
  }
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const index = y * mask.width + x;
      if (mask.coverage[index] === 0) continue;
      const documentPoint = {
        x: transform.x + (x + 0.5) * transform.scale,
        y: transform.y + (y + 0.5) * transform.scale,
      };
      if (!pointInPolygon(documentPoint, lasso)) continue;
      selected[index] = mask.coverage[index];
      remaining[index] = 0;
    }
  }
  return {
    selected: { width: mask.width, height: mask.height, coverage: selected },
    remaining: { width: mask.width, height: mask.height, coverage: remaining },
  };
}

export function getContentSelectionBounds(
  document: DrawingDocument,
  selection: ContentSelection,
): StrokeBounds | null {
  const strokeIds = new Set(selection.strokeIds);
  const layerIds = new Set(selection.layerIds);
  const bounds: StrokeBounds[] = [];
  for (const stroke of document.strokes) {
    if (strokeIds.has(stroke.id)) bounds.push(getStrokeBounds(stroke));
  }
  for (const layer of document.importedInkLayers) {
    if (!layerIds.has(layer.id)) continue;
    bounds.push({
      x: layer.transform.x,
      y: layer.transform.y,
      width: layer.width * layer.transform.scale,
      height: layer.height * layer.transform.scale,
    });
  }
  if (bounds.length === 0) return null;
  const left = Math.min(...bounds.map((bound) => bound.x));
  const top = Math.min(...bounds.map((bound) => bound.y));
  const right = Math.max(...bounds.map((bound) => bound.x + bound.width));
  const bottom = Math.max(...bounds.map((bound) => bound.y + bound.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
