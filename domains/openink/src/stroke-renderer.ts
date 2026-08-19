import {
  type DrawingDocument,
  getStrokeOutline,
  type MaterialPreset,
  type NativeStroke,
  type OutlinePoint,
} from "./drawing-document.ts";

export const PIXEL_CONTENT_CELL_SIZE = 12;
export const PIXEL_CONTENT_FILL_SIZE = 10;

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

function outlineToPixelSvgPath(
  points: readonly OutlinePoint[],
  gridSize = PIXEL_CONTENT_CELL_SIZE,
): string {
  if (points.length < 3) return "";
  const quantized: OutlinePoint[] = [];
  for (const point of points) {
    const next: OutlinePoint = [
      Math.round(point[0] / gridSize) * gridSize,
      Math.round(point[1] / gridSize) * gridSize,
    ];
    const previous = quantized.at(-1);
    if (!previous || previous[0] !== next[0] || previous[1] !== next[1]) {
      quantized.push(next);
    }
  }
  if (quantized.length < 3) return outlineToSvgPath(points);
  const [first, ...rest] = quantized;
  return `M${first[0].toFixed(2)},${first[1].toFixed(2)} ${
    rest.map((point) => `L${point[0].toFixed(2)},${point[1].toFixed(2)}`).join(" ")
  } Z`;
}

export function strokeToSvgPath(stroke: NativeStroke, complete: boolean): string {
  return outlineToSvgPath(getStrokeOutline(stroke, complete));
}

export function strokeToMaterialSvgPath(
  stroke: NativeStroke,
  preset: MaterialPreset,
  complete: boolean,
): string {
  const outline = getStrokeOutline(stroke, complete);
  return preset === "pixels"
    ? outlineToPixelSvgPath(outline)
    : outlineToSvgPath(outline);
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

function materialInkFilterId(document: DrawingDocument): string | null {
  switch (document.material.preset) {
    case "blackboard":
      return "openink-blackboard-chalk";
    case "blueprint":
      return "openink-blueprint-luminous";
    case "letterpress":
      return "openink-letterpress-press";
    case "paper":
      return "openink-paper-ink";
    case "pixels":
      return "openink-pixels-contrast";
    case "sketch":
      return "openink-sketch-graphite";
    case "warhol":
      return "openink-warhol-registration";
    default:
      return null;
  }
}

export function renderStrokeSvg(
  stroke: NativeStroke,
  complete = true,
  fill = stroke.brush.color,
  preset: MaterialPreset = "default",
): string {
  return `<path d="${strokeToMaterialSvgPath(stroke, preset, complete)}" fill="${
    escapeXml(fill)
  }" transform="translate(${stroke.transform.x} ${stroke.transform.y}) scale(${stroke.transform.scale})"${
    preset === "pixels" ? ' shape-rendering="crispEdges"' : ""
  } />`;
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
  const inkProcess = (() => {
    switch (material.preset) {
      case "blackboard":
        return '<filter id="openink-blackboard-chalk" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.62 0.18" numOctaves="2" seed="41" result="chalk-noise" /><feDisplacementMap in="SourceGraphic" in2="chalk-noise" scale="1.8" xChannelSelector="R" yChannelSelector="G" result="chalk-rough" /><feComposite in="chalk-noise" in2="chalk-rough" operator="in" result="chalk-grain" /><feBlend in="chalk-rough" in2="chalk-grain" mode="screen" /></filter>';
      case "blueprint":
        return '<filter id="openink-blueprint-luminous" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="1.15" result="blueprint-blur" /><feFlood flood-color="#79e5ff" flood-opacity="0.34" result="blueprint-color" /><feComposite in="blueprint-color" in2="blueprint-blur" operator="in" result="blueprint-glow" /><feMerge><feMergeNode in="blueprint-glow" /><feMergeNode in="SourceGraphic" /></feMerge></filter>';
      case "letterpress":
        return '<filter id="openink-letterpress-press" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="0.45" result="press-blur" /><feOffset in="press-blur" dx="-0.75" dy="-0.75" result="press-highlight-offset" /><feFlood flood-color="#fff7e7" flood-opacity="0.8" result="press-highlight-color" /><feComposite in="press-highlight-color" in2="press-highlight-offset" operator="in" result="press-highlight" /><feOffset in="press-blur" dx="0.85" dy="0.85" result="press-shadow-offset" /><feFlood flood-color="#3f2119" flood-opacity="0.48" result="press-shadow-color" /><feComposite in="press-shadow-color" in2="press-shadow-offset" operator="in" result="press-shadow" /><feMerge><feMergeNode in="press-highlight" /><feMergeNode in="press-shadow" /><feMergeNode in="SourceGraphic" /></feMerge></filter>';
      case "paper":
        return '<filter id="openink-paper-ink" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency="0.015 0.4" numOctaves="1" seed="17" result="paper-fiber" /><feDisplacementMap in="SourceGraphic" in2="paper-fiber" scale="1.1" xChannelSelector="R" yChannelSelector="G" result="paper-rough" /><feMorphology in="paper-rough" operator="dilate" radius="0.12" /></filter>';
      case "pixels":
        return '<filter id="openink-pixels-contrast" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncA type="discrete" tableValues="0 0 0 1 1" /></feComponentTransfer></filter>';
      case "sketch":
        return '<filter id="openink-sketch-graphite" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.38 0.75" numOctaves="2" seed="29" result="graphite-noise" /><feDisplacementMap in="SourceGraphic" in2="graphite-noise" scale="1.35" xChannelSelector="R" yChannelSelector="G" result="graphite-rough" /><feComposite in="graphite-noise" in2="graphite-rough" operator="in" result="graphite-grain" /><feBlend in="graphite-rough" in2="graphite-grain" mode="multiply" /></filter>';
      case "warhol":
        return '<filter id="openink-warhol-registration" x="-14%" y="-14%" width="128%" height="128%" color-interpolation-filters="sRGB"><feOffset in="SourceAlpha" dx="8" dy="7" result="warhol-cyan-alpha" /><feFlood flood-color="#29dbc2" flood-opacity="0.92" result="warhol-cyan-color" /><feComposite in="warhol-cyan-color" in2="warhol-cyan-alpha" operator="in" result="warhol-cyan" /><feOffset in="SourceAlpha" dx="-6" dy="5" result="warhol-yellow-alpha" /><feFlood flood-color="#ffe147" flood-opacity="0.88" result="warhol-yellow-color" /><feComposite in="warhol-yellow-color" in2="warhol-yellow-alpha" operator="in" result="warhol-yellow" /><feMerge><feMergeNode in="warhol-cyan" /><feMergeNode in="warhol-yellow" /><feMergeNode in="SourceGraphic" /></feMerge></filter>';
      default:
        return "";
    }
  })();
  const pattern = (() => {
    switch (material.preset) {
      case "blackboard":
        return `<pattern id="openink-blackboard-dust" width="72" height="72" patternUnits="userSpaceOnUse"><path d="M-8 18C14 13 38 22 80 15M-6 53C22 47 48 58 78 50" fill="none" stroke="${
          escapeXml(material.foreground)
        }" stroke-opacity="0.035" stroke-width="2.5" /><circle cx="8" cy="11" r="1.2" fill="${
          escapeXml(material.foreground)
        }" fill-opacity="0.09" /><circle cx="49" cy="37" r="0.8" fill="${
          escapeXml(material.foreground)
        }" fill-opacity="0.07" /><circle cx="24" cy="64" r="1.6" fill="${
          escapeXml(material.foreground)
        }" fill-opacity="0.04" /></pattern>`;
      case "blueprint":
        return `<pattern id="openink-blueprint-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M8 0V40M16 0V40M24 0V40M32 0V40M0 8H40M0 16H40M0 24H40M0 32H40" fill="none" stroke="${
          escapeXml(material.foreground)
        }" stroke-opacity="0.055" stroke-width="0.7" /><path d="M40 0H0V40" fill="none" stroke="${
          escapeXml(material.foreground)
        }" stroke-opacity="0.2" stroke-width="1.1" /></pattern>`;
      case "letterpress":
        return `<pattern id="openink-letterpress-fibers" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M-4 9L11 -3M2 34L34 2M22 36L36 22" stroke="${
          escapeXml(material.foreground)
        }" stroke-opacity="0.035" stroke-width="1" /><circle cx="7" cy="20" r="0.9" fill="${
          escapeXml(material.foreground)
        }" fill-opacity="0.045" /><circle cx="27" cy="11" r="0.7" fill="${
          escapeXml(material.foreground)
        }" fill-opacity="0.04" /></pattern>`;
      case "paper":
        return '<pattern id="openink-paper-rule" width="160" height="40" patternUnits="userSpaceOnUse"><path d="M0 39.5H160" stroke="#6c9aab" stroke-opacity="0.24" stroke-width="1" /><path d="M28 0V40" stroke="#d17a70" stroke-opacity="0.22" stroke-width="1" /></pattern>';
      case "pixels":
        return `<pattern id="openink-pixels-grid" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#202524" fill-opacity="0.035" /><rect x="12" y="12" width="12" height="12" fill="#202524" fill-opacity="0.035" /><path d="M24 0H0V24M12 0V24M0 12H24" fill="none" stroke="#202524" stroke-opacity="0.095" stroke-width="1" shape-rendering="crispEdges" /></pattern><pattern id="openink-pixels-content-cells" width="${PIXEL_CONTENT_CELL_SIZE}" height="${PIXEL_CONTENT_CELL_SIZE}" patternUnits="userSpaceOnUse"><rect width="${PIXEL_CONTENT_FILL_SIZE}" height="${PIXEL_CONTENT_FILL_SIZE}" fill="#fff" shape-rendering="crispEdges" /></pattern><mask id="openink-pixels-content-mask" x="0" y="0" width="${document.width}" height="${document.height}" maskUnits="userSpaceOnUse"><rect width="${document.width}" height="${document.height}" fill="url(#openink-pixels-content-cells)" /></mask>`;
      case "sketch":
        return '<pattern id="openink-sketch-hatch" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(18)"><path d="M0 0V22M7 0V22M17 0V22" stroke="#3b3b38" stroke-opacity="0.035" stroke-width="0.8" /><circle cx="12" cy="8" r="0.7" fill="#3b3b38" fill-opacity="0.045" /></pattern>';
      case "warhol":
        return '<pattern id="openink-warhol-dots" width="36" height="36" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#ff6aae" fill-opacity="0.32" /><rect x="18" y="18" width="18" height="18" fill="#ff6aae" fill-opacity="0.32" /><circle cx="9" cy="9" r="5.5" fill="#ffe447" fill-opacity="0.82" /><circle cx="27" cy="27" r="5.5" fill="#52e5ca" fill-opacity="0.68" /></pattern>';
      default:
        return "";
    }
  })();
  return texture || inkProcess || pattern
    ? `<defs>${texture}${inkProcess}${pattern}</defs>`
    : "";
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
          ? renderStrokeSvg(
            stroke,
            true,
            document.material.foreground,
            document.material.preset,
          )
          : "";
      }
      const imported = importedById.get(reference.id);
      const rendered = renderedById.get(reference.id);
      return imported && rendered
        ? `<image href="${
          escapeXml(rendered.dataUrl)
        }" width="${imported.width}" height="${imported.height}" transform="translate(${imported.transform.x} ${imported.transform.y}) scale(${imported.transform.scale})"${
          document.material.preset === "pixels" ? ' image-rendering="pixelated"' : ""
        } />`
        : "";
    }).join("");
    return `<g data-openink-layer="${escapeXml(layer.id)}">${content}</g>`;
  }).join("");
  const textureFilteredInk = document.material.textureStrength > 0 ||
      document.material.edgeSoftness > 0 || document.material.bleed > 0
    ? `<g filter="url(#openink-ink-texture)">${ink}</g>`
    : ink;
  const inkFilterId = materialInkFilterId(document);
  const filteredInk = inkFilterId
    ? `<g filter="url(#${inkFilterId})">${textureFilteredInk}</g>`
    : textureFilteredInk;
  const materialInk = document.material.preset === "pixels"
    ? `<g mask="url(#openink-pixels-content-mask)">${filteredInk}</g>`
    : filteredInk;
  const patternId = materialPatternId(document);
  const presetBackdrop = patternId
    ? `<rect width="100%" height="100%" fill="url(#${patternId})" />`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${document.width}" height="${document.height}" viewBox="0 0 ${document.width} ${document.height}" role="img" data-openink-material="${document.material.preset}" aria-label="${
    escapeXml(document.title)
  }">${renderMaterialDefinitions(document)}<rect width="100%" height="100%" fill="${
    escapeXml(document.material.background)
  }" />${presetBackdrop}${materialInk}</svg>`;
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
