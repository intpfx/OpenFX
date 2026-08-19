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

export function renderStrokeSvg(
  stroke: NativeStroke,
  complete = true,
  fill = stroke.brush.color,
): string {
  return `<path d="${strokeToSvgPath(stroke, complete)}" fill="${
    escapeXml(fill)
  }" transform="translate(${stroke.transform.x} ${stroke.transform.y}) scale(${stroke.transform.scale})" />`;
}

export type RenderedInkLayer = Readonly<{
  id: string;
  dataUrl: string;
}>;

function renderMaterialDefinitions(document: DrawingDocument): string {
  const material = document.material;
  const displacement = (material.bleed * 8).toFixed(2);
  const softness = (material.edgeSoftness * 1.25).toFixed(2);
  const textureStrength = Math.max(0, Math.min(1, material.textureStrength))
    .toFixed(2);
  const texture = material.textureStrength > 0 || material.edgeSoftness > 0 ||
      material.bleed > 0
    ? `<filter id="openink-ink-texture" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" seed="23" result="openink-noise" /><feDisplacementMap in="SourceGraphic" in2="openink-noise" scale="${displacement}" xChannelSelector="R" yChannelSelector="G" result="openink-displaced" /><feGaussianBlur in="openink-displaced" stdDeviation="${softness}" result="openink-softened" /><feComposite in="openink-noise" in2="openink-softened" operator="in" result="openink-grain" /><feComponentTransfer in="openink-grain" result="openink-grain-strength"><feFuncA type="linear" slope="${textureStrength}" /></feComponentTransfer><feBlend in="openink-softened" in2="openink-grain-strength" mode="multiply" /></filter>`
    : "";
  const blueprintGrid = material.preset === "blueprint"
    ? `<pattern id="openink-blueprint-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="${
      escapeXml(material.foreground)
    }" stroke-opacity="0.09" stroke-width="1" /></pattern>`
    : "";
  return texture || blueprintGrid ? `<defs>${texture}${blueprintGrid}</defs>` : "";
}

export function renderDocumentSvg(
  document: DrawingDocument,
  renderedInkLayers: readonly RenderedInkLayer[] = [],
): string {
  const renderedById = new Map(renderedInkLayers.map((layer) => [layer.id, layer]));
  const importedInk = document.importedInkLayers.map((layer) => {
    const rendered = renderedById.get(layer.id);
    return rendered
      ? `<image href="${
        escapeXml(rendered.dataUrl)
      }" width="${layer.width}" height="${layer.height}" transform="translate(${layer.transform.x} ${layer.transform.y}) scale(${layer.transform.scale})" />`
      : "";
  }).join("");
  const strokes = document.strokes.map((stroke) =>
    renderStrokeSvg(stroke, true, document.material.foreground)
  ).join("");
  const ink = `${importedInk}${strokes}`;
  const filteredInk = document.material.textureStrength > 0 ||
      document.material.edgeSoftness > 0 || document.material.bleed > 0
    ? `<g filter="url(#openink-ink-texture)">${ink}</g>`
    : ink;
  const grid = document.material.preset === "blueprint"
    ? `<rect width="100%" height="100%" fill="url(#openink-blueprint-grid)" />`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${document.width}" height="${document.height}" viewBox="0 0 ${document.width} ${document.height}" role="img" data-openink-material="${document.material.preset}" aria-label="${
    escapeXml(document.title)
  }">${renderMaterialDefinitions(document)}<rect width="100%" height="100%" fill="${
    escapeXml(document.material.background)
  }" />${grid}${filteredInk}</svg>`;
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
