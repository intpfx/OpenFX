import { expect } from "@std/expect";

import {
  addDrawingLayer,
  applyMaterialPreset,
  commitImportedInkLayer,
  commitStroke,
  createDrawingDocument,
  type ImportedInkLayer,
  type NativeStroke,
  setDrawingLayerVisibility,
} from "../src/drawing-document.ts";
import {
  PIXEL_CONTENT_CELL_SIZE,
  renderDocumentSvg,
  strokeToMaterialSvgPath,
  strokeToSvgPath,
} from "../src/stroke-renderer.ts";

Deno.test("perfect-freehand output becomes a deterministic exportable SVG", () => {
  const stroke: NativeStroke = {
    id: "stroke-1",
    points: [
      { x: 20, y: 30, pressure: 0.2, time: 0 },
      { x: 80, y: 65, pressure: 0.8, time: 16 },
      { x: 140, y: 40, pressure: 0.5, time: 32 },
    ],
    brush: {
      color: "#18201c",
      size: 18,
      thinning: 0.6,
      smoothing: 0.75,
      streamline: 0.6,
      simulatePressure: false,
    },
    transform: { x: 12, y: -8, scale: 1.4 },
  };
  const empty = createDrawingDocument({
    id: "doc-1",
    title: "雨夜手稿",
    width: 1200,
    height: 800,
    now: "2026-08-19T00:00:00.000Z",
  });
  const document = commitStroke(empty, stroke, empty.updatedAt);

  const path = strokeToSvgPath(stroke, true);
  const svg = renderDocumentSvg(document);

  expect(path.startsWith("M")).toBe(true);
  expect(path.endsWith("Z")).toBe(true);
  expect(path).not.toContain("NaN");
  expect(svg).toContain('viewBox="0 0 1200 800"');
  expect(svg).toContain('transform="translate(12 -8) scale(1.4)"');
  expect(svg).toContain('fill="#18201c"');
});

Deno.test("blueprint material is encoded in canonical SVG without changing geometry", () => {
  const stroke: NativeStroke = {
    id: "stroke-blueprint",
    points: [
      { x: 20, y: 30, pressure: 0.5, time: 0 },
      { x: 100, y: 80, pressure: 0.5, time: 16 },
    ],
    brush: {
      color: "#ff0000",
      size: 16,
      thinning: 0.5,
      smoothing: 0.7,
      streamline: 0.6,
      simulatePressure: true,
    },
    transform: { x: 0, y: 0, scale: 1 },
  };
  const empty = createDrawingDocument({
    id: "doc-blueprint",
    now: "2026-08-19T00:00:00.000Z",
    width: 400,
    height: 300,
  });
  const base = commitStroke(empty, stroke, empty.updatedAt);
  const document = applyMaterialPreset(base, "blueprint", base.updatedAt);

  const svg = renderDocumentSvg(document);

  expect(svg).toContain('data-openink-material="blueprint"');
  expect(svg).toContain('<rect width="100%" height="100%" fill="#174758"');
  expect(svg).toContain('fill="#e8f4ee"');
  expect(svg).toContain('filter="url(#openink-ink-texture)"');
  expect(svg).toContain('id="openink-blueprint-grid"');
  expect(svg).toContain("<feGaussianBlur");
  expect(svg).toContain('slope="0.28"');
  expect(svg).toContain(strokeToSvgPath(stroke, true));
});

Deno.test("canonical SVG embeds locally derived photo ink without the source photo", () => {
  const empty = createDrawingDocument({
    id: "doc-photo-export",
    now: "2026-08-19T00:00:00.000Z",
    width: 400,
    height: 300,
  });
  const layer: ImportedInkLayer = {
    id: "photo-export",
    source: {
      assetId: "a".repeat(64),
      mimeType: "image/jpeg",
      width: 1600,
      height: 1200,
      byteLength: 48_000,
    },
    maskAssetId: "b".repeat(64),
    sdfAssetId: "c".repeat(64),
    width: 200,
    height: 150,
    crop: {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 1600, y: 0 },
      bottomRight: { x: 1600, y: 1200 },
      bottomLeft: { x: 0, y: 1200 },
    },
    cleanup: {
      threshold: 0.3,
      denoise: 0.2,
      backgroundRemoval: 0.8,
      thickness: 0,
    },
    transform: { x: 25, y: 30, scale: 1.5 },
  };
  const document = commitImportedInkLayer(empty, layer, empty.updatedAt);
  const derivedPng = "data:image/png;base64,aW5r";

  const svg = renderDocumentSvg(document, [{ id: layer.id, dataUrl: derivedPng }]);

  expect(svg).toContain(`href="${derivedPng}"`);
  expect(svg).toContain('width="200" height="150"');
  expect(svg).toContain('transform="translate(25 30) scale(1.5)"');
  expect(svg).not.toContain(layer.source.assetId);
});

Deno.test("canonical SVG follows drawing layer order and visibility", () => {
  const makeStroke = (id: string, x: number): NativeStroke => ({
    id,
    points: [
      { x: 20, y: 30, pressure: 0.5, time: 0 },
      { x: 100, y: 80, pressure: 0.5, time: 16 },
    ],
    brush: {
      color: "#18201c",
      size: 16,
      thinning: 0.5,
      smoothing: 0.7,
      streamline: 0.6,
      simulatePressure: true,
    },
    transform: { x, y: 0, scale: 1 },
  });
  const base = createDrawingDocument({
    id: "doc-layer-export",
    now: "2026-08-19T00:00:00.000Z",
    width: 400,
    height: 300,
  });
  const lower = commitStroke(base, makeStroke("lower", 11), base.updatedAt);
  const layered = addDrawingLayer(
    lower,
    { id: "layer-upper", name: "上层" },
    lower.updatedAt,
  );
  const upper = commitStroke(
    layered,
    makeStroke("upper", 22),
    layered.updatedAt,
  );
  const hidden = setDrawingLayerVisibility(
    upper,
    "layer-upper",
    false,
    upper.updatedAt,
  );

  const svg = renderDocumentSvg(hidden);

  expect(svg).toContain('data-openink-layer="layer-default"');
  expect(svg).toContain('transform="translate(11 0) scale(1)"');
  expect(svg).not.toContain('data-openink-layer="layer-upper"');
  expect(svg).not.toContain('transform="translate(22 0) scale(1)"');
});

Deno.test("Warhol material exports a pop-art halftone backdrop", () => {
  const base = createDrawingDocument({
    id: "doc-warhol",
    now: "2026-08-19T00:00:00.000Z",
    width: 400,
    height: 300,
  });
  const document = applyMaterialPreset(base, "warhol", base.updatedAt);

  const svg = renderDocumentSvg(document);

  expect(svg).toContain('data-openink-material="warhol"');
  expect(svg).toContain('id="openink-warhol-dots"');
  expect(svg).toContain('fill="#ff4f9a"');
  expect(svg).toContain('fill="url(#openink-warhol-dots)"');
});

Deno.test("Pixels material quantizes curved stroke geometry into hard steps", () => {
  const stroke: NativeStroke = {
    id: "stroke-pixels",
    points: [
      { x: 18.4, y: 28.7, pressure: 0.35, time: 0 },
      { x: 72.9, y: 66.2, pressure: 0.8, time: 16 },
      { x: 141.6, y: 39.3, pressure: 0.5, time: 32 },
    ],
    brush: {
      color: "#202524",
      size: 17,
      thinning: 0.6,
      smoothing: 0.75,
      streamline: 0.6,
      simulatePressure: false,
    },
    transform: { x: 0, y: 0, scale: 1 },
  };

  const smooth = strokeToMaterialSvgPath(stroke, "default", true);
  const pixelated = strokeToMaterialSvgPath(stroke, "pixels", true);

  expect(pixelated).not.toBe(smooth);
  expect(pixelated).toContain(" L");
  expect(pixelated).not.toMatch(/[QT]/);
  const coordinates = [...pixelated.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) =>
    Number(match[0])
  );
  expect(coordinates.every((value) => value % PIXEL_CONTENT_CELL_SIZE === 0)).toBe(
    true,
  );
});

Deno.test("Pixels material samples native and photo ink through one coarse cell mask", () => {
  const empty = createDrawingDocument({
    id: "doc-pixel-content",
    now: "2026-08-19T00:00:00.000Z",
    width: 400,
    height: 300,
  });
  const stroke: NativeStroke = {
    id: "stroke-pixel-content",
    points: [
      { x: 18, y: 24, pressure: 0.5, time: 0 },
      { x: 130, y: 96, pressure: 0.7, time: 16 },
    ],
    brush: {
      color: "#202524",
      size: 18,
      thinning: 0.6,
      smoothing: 0.75,
      streamline: 0.6,
      simulatePressure: false,
    },
    transform: { x: 0, y: 0, scale: 1 },
  };
  const photoInk: ImportedInkLayer = {
    id: "photo-pixel-content",
    source: {
      assetId: "d".repeat(64),
      mimeType: "image/jpeg",
      width: 160,
      height: 120,
      byteLength: 2_400,
    },
    maskAssetId: "e".repeat(64),
    sdfAssetId: "f".repeat(64),
    width: 160,
    height: 120,
    crop: {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 160, y: 0 },
      bottomRight: { x: 160, y: 120 },
      bottomLeft: { x: 0, y: 120 },
    },
    cleanup: {
      threshold: 0.3,
      denoise: 0.2,
      backgroundRemoval: 0.8,
      thickness: 0,
    },
    transform: { x: 180, y: 80, scale: 1 },
  };
  const withStroke = commitStroke(empty, stroke, empty.updatedAt);
  const withPhoto = commitImportedInkLayer(
    withStroke,
    photoInk,
    withStroke.updatedAt,
  );
  const document = applyMaterialPreset(withPhoto, "pixels", withPhoto.updatedAt);
  const svg = renderDocumentSvg(document, [{
    id: photoInk.id,
    dataUrl: "data:image/png;base64,aW5r",
  }]);

  expect(svg).toContain('id="openink-pixels-content-cells"');
  expect(svg).toContain('id="openink-pixels-content-mask"');
  const maskedInk = svg.slice(
    svg.indexOf('<g mask="url(#openink-pixels-content-mask)"'),
  );
  expect(maskedInk).toContain('<path d="');
  expect(maskedInk).toContain('href="data:image/png;base64,aW5r"');
});

Deno.test("each handcrafted material exports its own backdrop and ink process", () => {
  const base = createDrawingDocument({
    id: "doc-material-effects",
    now: "2026-08-19T00:00:00.000Z",
    width: 400,
    height: 300,
  });
  const effects = [
    ["blackboard", "openink-blackboard-dust", "openink-blackboard-chalk"],
    ["blueprint", "openink-blueprint-grid", "openink-blueprint-luminous"],
    ["letterpress", "openink-letterpress-fibers", "openink-letterpress-press"],
    ["paper", "openink-paper-rule", "openink-paper-ink"],
    ["pixels", "openink-pixels-grid", "openink-pixels-contrast"],
    ["sketch", "openink-sketch-hatch", "openink-sketch-graphite"],
    ["warhol", "openink-warhol-dots", "openink-warhol-registration"],
  ] as const;

  for (const [preset, patternId, filterId] of effects) {
    const svg = renderDocumentSvg(
      applyMaterialPreset(base, preset, base.updatedAt),
    );
    expect(svg).toContain(`id="${patternId}"`);
    expect(svg).toContain(`fill="url(#${patternId})"`);
    expect(svg).toContain(`id="${filterId}"`);
    expect(svg).toContain(`filter="url(#${filterId})"`);
  }
});
