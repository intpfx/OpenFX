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

function materialPatternId(document: DrawingDocument): string | null {
  switch (document.material.preset) {
    case "blackboard":
      return "openink-blackboard-dust";
    case "blueprint":
      return "openink-blueprint-grid";
    case "letterpress":
      return "openink-letterpress-fibers";
    case "paper":
      return "openink-paper-rule";
    case "pixels":
      return "openink-pixels-grid";
    case "sketch":
      return "openink-sketch-hatch";
    case "warhol":
      return "openink-warhol-dots";
    default:
      return null;
  }
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
  const pattern = (() => {
    switch (material.preset) {
      case "blackboard":
        return `<pattern id="openink-blackboard-dust" width="42" height="42" patternUnits="userSpaceOnUse"><circle cx="8" cy="11" r="1.2" fill="${
          escapeXml(material.foreground)
        }" fill-opacity="0.07" /><circle cx="31" cy="28" r="0.8" fill="${
          escapeXml(material.foreground)
        }" fill-opacity="0.05" /></pattern>`;
      case "blueprint":
        return `<pattern id="openink-blueprint-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="${
          escapeXml(material.foreground)
        }" stroke-opacity="0.09" stroke-width="1" /></pattern>`;
      case "letterpress":
        return `<pattern id="openink-letterpress-fibers" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M-4 7L9 -2M3 26L26 3M18 29L29 18" stroke="${
          escapeXml(material.foreground)
        }" stroke-opacity="0.035" stroke-width="1" /></pattern>`;
      case "paper":
        return '<pattern id="openink-paper-rule" width="100" height="36" patternUnits="userSpaceOnUse"><path d="M0 35.5H100" stroke="#6c9aab" stroke-opacity="0.18" stroke-width="1" /></pattern>';
      case "pixels":
        return '<pattern id="openink-pixels-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#202524" stroke-opacity="0.08" stroke-width="1" shape-rendering="crispEdges" /></pattern>';
      case "sketch":
        return '<pattern id="openink-sketch-hatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(18)"><path d="M0 0V18M9 0V18" stroke="#3b3b38" stroke-opacity="0.035" stroke-width="1" /></pattern>';
      case "warhol":
        return '<pattern id="openink-warhol-dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="4.5" fill="#ffe447" fill-opacity="0.78" /><circle cx="21" cy="21" r="4.5" fill="#52e5ca" fill-opacity="0.58" /></pattern>';
      default:
        return "";
    }
  })();
  return texture || pattern ? `<defs>${texture}${pattern}</defs>` : "";
}

export function renderDocumentSvg(
  document: DrawingDocument,
  renderedInkLayers: readonly RenderedInkLayer[] = [],
): string {
  const renderedById = new Map(renderedInkLayers.map((layer) => [layer.id, layer]));
  const importedById = new Map(document.importedInkLayers.map((layer) => [
    layer.id,
    layer,
  ]));
  const strokesById = new Map(document.strokes.map((stroke) => [stroke.id, stroke]));
  const ink = document.drawingLayers.map((layer) => {
    if (!layer.visible) return "";
    const content = layer.content.map((reference) => {
      if (reference.kind === "stroke") {
        const stroke = strokesById.get(reference.id);
        return stroke
          ? renderStrokeSvg(stroke, true, document.material.foreground)
          : "";
      }
      const imported = importedById.get(reference.id);
      const rendered = renderedById.get(reference.id);
      return imported && rendered
        ? `<image href="${
          escapeXml(rendered.dataUrl)
        }" width="${imported.width}" height="${imported.height}" transform="translate(${imported.transform.x} ${imported.transform.y}) scale(${imported.transform.scale})" />`
        : "";
    }).join("");
    return `<g data-openink-layer="${escapeXml(layer.id)}">${content}</g>`;
  }).join("");
  const filteredInk = document.material.textureStrength > 0 ||
      document.material.edgeSoftness > 0 || document.material.bleed > 0
    ? `<g filter="url(#openink-ink-texture)">${ink}</g>`
    : ink;
  const patternId = materialPatternId(document);
  const presetBackdrop = patternId
    ? `<rect width="100%" height="100%" fill="url(#${patternId})" />`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${document.width}" height="${document.height}" viewBox="0 0 ${document.width} ${document.height}" role="img" data-openink-material="${document.material.preset}" aria-label="${
    escapeXml(document.title)
  }">${renderMaterialDefinitions(document)}<rect width="100%" height="100%" fill="${
    escapeXml(document.material.background)
  }" />${presetBackdrop}${filteredInk}</svg>`;
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
