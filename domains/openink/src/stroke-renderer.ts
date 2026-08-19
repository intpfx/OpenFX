import {
  type DrawingDocument,
  getStrokeOutline,
  type NativeStroke,
  type OutlinePoint,
} from "./drawing-document.ts";

function average(a: number, b: number): number {
  return (a + b) / 2;
}

function outlineToSvgPath(points: readonly OutlinePoint[]): string {
  if (points.length < 3) return "";
  const first = points[0];
  const second = points[1];
  const third = points[2];
  let path = `M${first[0].toFixed(2)},${first[1].toFixed(2)} Q${second[0].toFixed(2)},${
    second[1].toFixed(2)
  } ${average(second[0], third[0]).toFixed(2)},${
    average(second[1], third[1]).toFixed(2)
  }`;
  for (let index = 2; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    path += ` T${average(current[0], next[0]).toFixed(2)},${
      average(current[1], next[1]).toFixed(2)
    }`;
  }
  return `${path} Z`;
}

export function strokeToSvgPath(stroke: NativeStroke, complete: boolean): string {
  return outlineToSvgPath(getStrokeOutline(stroke, complete));
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function renderStrokeSvg(stroke: NativeStroke, complete = true): string {
  return `<path d="${strokeToSvgPath(stroke, complete)}" fill="${
    escapeXml(stroke.brush.color)
  }" transform="translate(${stroke.transform.x} ${stroke.transform.y}) scale(${stroke.transform.scale})" />`;
}

export function renderDocumentSvg(document: DrawingDocument): string {
  const strokes = document.strokes.map((stroke) => renderStrokeSvg(stroke)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${document.width}" height="${document.height}" viewBox="0 0 ${document.width} ${document.height}" role="img" aria-label="${
    escapeXml(document.title)
  }"><rect width="100%" height="100%" fill="#f3f0e7" />${strokes}</svg>`;
}

export type StrokeBounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export function getStrokeBounds(stroke: NativeStroke): StrokeBounds {
  if (stroke.points.length === 0) {
    return { x: stroke.transform.x, y: stroke.transform.y, width: 0, height: 0 };
  }
  const xs = stroke.points.map((point) => point.x);
  const ys = stroke.points.map((point) => point.y);
  const radius = stroke.brush.size * 0.65;
  const scale = stroke.transform.scale;
  const minX = Math.min(...xs) - radius;
  const minY = Math.min(...ys) - radius;
  const maxX = Math.max(...xs) + radius;
  const maxY = Math.max(...ys) + radius;
  return {
    x: stroke.transform.x + minX * scale,
    y: stroke.transform.y + minY * scale,
    width: (maxX - minX) * scale,
    height: (maxY - minY) * scale,
  };
}
