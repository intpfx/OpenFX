import { expect } from "@std/expect";

import type { DrawingDocument, NativeStroke } from "../src/drawing-document.ts";
import { renderDocumentSvg, strokeToSvgPath } from "../src/stroke-renderer.ts";

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
  const document: DrawingDocument = {
    version: 1,
    id: "doc-1",
    title: "雨夜手稿",
    width: 1200,
    height: 800,
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:01.000Z",
    strokes: [stroke],
  };

  const path = strokeToSvgPath(stroke, true);
  const svg = renderDocumentSvg(document);

  expect(path.startsWith("M")).toBe(true);
  expect(path.endsWith("Z")).toBe(true);
  expect(path).not.toContain("NaN");
  expect(svg).toContain('viewBox="0 0 1200 800"');
  expect(svg).toContain('transform="translate(12 -8) scale(1.4)"');
  expect(svg).toContain('fill="#18201c"');
});
